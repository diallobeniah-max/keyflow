import { open } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInflate } from "node:zlib";
import sharp from "sharp";

// Photoshop image resources contain an optional JPEG thumbnail. Read only the
// header and bounded resource records, never the potentially multi-GB layers.
const MAX_THUMBNAIL_BYTES = 32 * 1024 * 1024;
const MAX_RECORDS = 10000;

// PSD merged RGB channels are composited against white when merged
// transparency is present. Undo that matte before storing straight-alpha PNG.
function removeWhiteMatte(pixels: Buffer, colorChannels: number): void {
  const channels = colorChannels + 1;
  for (let i = 0; i < pixels.length; i += channels) {
    const alpha = pixels[i + colorChannels];
    if (alpha === 255) continue;
    for (let c = 0; c < colorChannels; c++) {
      pixels[i + c] = alpha === 0 ? 0 : Math.max(0, Math.min(255, Math.round((pixels[i + c] - (255 - alpha)) * 255 / alpha)));
    }
  }
}

function readSample(row: Buffer, offset: number, depth: number): number {
  if (depth === 1) return row[Math.floor(offset / 8)] & (0x80 >>> (offset % 8)) ? 0 : 255;
  if (depth !== 32) return row[offset];
  const value = row.readFloatBE(offset);
  return Number.isNaN(value) ? 0 : Math.max(0, Math.min(255, Math.floor(value * 256)));
}

// PSD CMYK samples are inverted. This approximate conversion is used only
// when the document has no embedded color profile.
function cmykToRgb(pixels: Buffer): Buffer {
  const result = Buffer.alloc(pixels.length / 4 * 3);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
    result[j] = Math.round(pixels[i] * pixels[i + 3] / 255);
    result[j + 1] = Math.round(pixels[i + 1] * pixels[i + 3] / 255);
    result[j + 2] = Math.round(pixels[i + 2] * pixels[i + 3] / 255);
  }
  return result;
}

// libvips can silently ignore malformed ICC data. Reject structurally invalid
// profiles before passing them on, so they cannot masquerade as color-managed.
function isPlausibleProfile(profile: Buffer, mode: number): boolean {
  if (profile.length < 132 || profile.readUInt32BE(0) !== profile.length ||
      profile.toString('ascii', 36, 40) !== 'acsp' || profile.toString('ascii', 16, 20) !== (mode === 4 ? 'CMYK' : mode === 3 || mode === 2 ? 'RGB ' : 'GRAY')) return false;
  const count = profile.readUInt32BE(128);
  if (count > Math.floor((profile.length - 132) / 12)) return false;
  const tags = new Set<string>();
  for (let i = 0; i < count; i++) {
    const entry = 132 + i * 12;
    const offset = profile.readUInt32BE(entry + 4), length = profile.readUInt32BE(entry + 8);
    if (length < 8 || offset < 132 + count * 12 || offset + length > profile.length) return false;
    const tag = profile.toString('ascii', entry, entry + 4);
    tags.add(tag);
  }
  return tags.has('A2B0') || tags.has('D2B0') || ((mode === 3 || mode === 2) && ['rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC'].every(tag => tags.has(tag))) || (mode === 1 && tags.has('kTRC'));
}

// Wrap sampled channels as TIFF so libvips can apply the embedded ICC profile.
// PSD stores inverted CMYK samples, while TIFF uses ordinary ink values.
function profiledTiff(pixels: Buffer, width: number, height: number, profile: Buffer, colorChannels: number): Buffer {
  const entries: Array<[number, number, number, number]> = [];
  const directorySize = 2 + 12 * 11 + 4;
  const bitsOffset = 8 + directorySize;
  const profileOffset = bitsOffset + 8;
  const imageOffset = profileOffset + profile.length + (profile.length % 2);
  entries.push([256, 4, 1, width], [257, 4, 1, height], [258, 3, colorChannels, colorChannels === 1 ? 8 : bitsOffset],
    [259, 3, 1, 1], [262, 3, 1, colorChannels === 4 ? 5 : colorChannels === 3 ? 2 : 1], [273, 4, 1, imageOffset],
    [277, 3, 1, colorChannels], [278, 4, 1, height], [279, 4, 1, pixels.length],
    [284, 3, 1, 1], [34675, 7, profile.length, profileOffset]);
  const output = Buffer.alloc(imageOffset + pixels.length);
  output.write('II'); output.writeUInt16LE(42, 2); output.writeUInt32LE(8, 4);
  output.writeUInt16LE(entries.length, 8);
  entries.forEach(([tag, type, count, value], i) => {
    const offset = 10 + i * 12;
    output.writeUInt16LE(tag, offset); output.writeUInt16LE(type, offset + 2);
    output.writeUInt32LE(count, offset + 4); output.writeUInt32LE(value, offset + 8);
  });
  for (let i = 0; i < 4; i++) output.writeUInt16LE(8, bitsOffset + i * 2);
  profile.copy(output, profileOffset);
  for (let i = 0; i < pixels.length; i++) output[imageOffset + i] = colorChannels === 4 ? 255 - pixels[i] : pixels[i];
  return output;
}

async function encodeComposite(pixels: Buffer, width: number, height: number, channels: number, mode: number, profile: Buffer | null, hasAlpha: boolean): Promise<Buffer | null> {
  try {
    if (hasAlpha && (mode === 4 || profile)) {
      const colors = mode === 4 ? 4 : mode === 3 ? 3 : 1;
      const inks = Buffer.alloc(width * height * colors);
      for (let i = 0, j = 0; i < pixels.length; i += channels, j += colors) pixels.copy(inks, j, i, i + colors);
      const rgb = profile
        ? await sharp(profiledTiff(inks, width, height, profile, colors), { failOn: 'warning' }).toColourspace('srgb').removeAlpha().raw().toBuffer()
        : cmykToRgb(inks);
      if (rgb.length !== width * height * 3) return null;
      const rgba = Buffer.alloc(width * height * 4);
      for (let i = 0; i < width * height; i++) {
        rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = pixels[i * channels + colors];
      }
      removeWhiteMatte(rgba, 3);
      return await sharp(rgba, { raw: { width, height, channels: 4 } }).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    }
    const image = profile
      ? sharp(profiledTiff(pixels, width, height, profile, mode === 4 ? 4 : mode === 3 ? 3 : 1), { failOn: 'warning' }).toColourspace('srgb')
      : sharp(mode === 4 ? cmykToRgb(pixels) : pixels, { raw: { width, height, channels: (mode === 4 ? 3 : channels) as 1 | 2 | 3 | 4 } });
    return await image.resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  } catch { return null; }
}

async function encodeIndexed(pixels: Buffer, width: number, height: number, palette: Buffer, profile: Buffer | null, transparentIndex: number | null): Promise<Buffer | null> {
  try {
    const rgb = Buffer.alloc(width * height * 3);
    for (let i = 0; i < pixels.length; i++) {
      const index = pixels[i]; rgb[i * 3] = palette[index]; rgb[i * 3 + 1] = palette[256 + index]; rgb[i * 3 + 2] = palette[512 + index];
    }
    const colors = profile ? await sharp(profiledTiff(rgb, width, height, profile, 3), { failOn: 'warning' }).toColourspace('srgb').removeAlpha().raw().toBuffer() : rgb;
    if (colors.length !== rgb.length) return null;
    if (transparentIndex === null) return await sharp(colors, { raw: { width, height, channels: 3 } }).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0; i < pixels.length; i++) {
      rgba[i * 4] = colors[i * 3]; rgba[i * 4 + 1] = colors[i * 3 + 1]; rgba[i * 4 + 2] = colors[i * 3 + 2]; rgba[i * 4 + 3] = pixels[i] === transparentIndex ? 0 : 255;
    }
    return await sharp(rgba, { raw: { width, height, channels: 4 } }).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  } catch { return null; }
}

export async function readPsdThumbnail(path: string): Promise<Buffer | null> {
  const file = await open(path, "r");
  try {
    const { size } = await file.stat();
    async function readAt(offset: number, length: number): Promise<Buffer | null> {
      if (!Number.isSafeInteger(offset) || offset < 0 || length < 0 || offset + length > size) return null;
      const data = Buffer.alloc(length);
      const { bytesRead } = await file.read(data, 0, length, offset);
      return bytesRead === length ? data : null;
    }
    const header = await readAt(0, 30);
    if (!header || header.toString("ascii", 0, 4) !== "8BPS" || ![1, 2].includes(header.readUInt16BE(4))) return null;
    const colorLength = header.readUInt32BE(26);
    const resourceLengthOffset = 30 + colorLength;
    const length = await readAt(resourceLengthOffset, 4);
    if (!length) return null;
    let pos = resourceLengthOffset + 4;
    const end = pos + length.readUInt32BE(0);
    if (end > size) return null;
    for (let records = 0; pos + 12 <= end && records < MAX_RECORDS; records++) {
      const head = await readAt(pos, 7);
      if (!head || head.toString("ascii", 0, 4) !== "8BIM") return null;
      const id = head.readUInt16BE(4);
      const nameBytes = 1 + head[6];
      const sizeOffset = pos + 6 + nameBytes + (nameBytes % 2);
      const sizeBytes = await readAt(sizeOffset, 4);
      if (!sizeBytes) return null;
      const dataSize = sizeBytes.readUInt32BE(0);
      const dataOffset = sizeOffset + 4;
      if (dataOffset + dataSize > end) return null;
      if ((id === 1033 || id === 1036) && dataSize >= 28 && dataSize <= MAX_THUMBNAIL_BYTES + 28) {
        const meta = await readAt(dataOffset, 28);
        if (meta && meta.readUInt32BE(0) === 1) {
          const jpeg = await readAt(dataOffset + 28, dataSize - 28);
          if (jpeg && jpeg.length >= 4 && jpeg[0] === 0xff && jpeg[1] === 0xd8) return jpeg;
        }
      }
      pos = dataOffset + dataSize + (dataSize % 2);
    }
    return null;
  } finally {
    await file.close();
  }
}

/** Decode a supported RGB/greyscale flattened composite without reading its layers. */
export async function readPsdComposite(path: string, signal?: AbortSignal): Promise<Buffer | null> {
  const file = await open(path, "r");
  try {
    const { size } = await file.stat();
    const read = async (offset: number, length: number) => {
      if (!Number.isSafeInteger(offset) || offset < 0 || length < 0 || offset + length > size) return null;
      const b = Buffer.alloc(length);
      return (await file.read(b, 0, length, offset)).bytesRead === length ? b : null;
    };
    const header = await read(0, 30);
    if (!header || header.toString("ascii", 0, 4) !== "8BPS") return null;
    const version = header.readUInt16BE(4), channels = header.readUInt16BE(12);
    const height = header.readUInt32BE(14), width = header.readUInt32BE(18);
    const depth = header.readUInt16BE(22), mode = header.readUInt16BE(24);
    const colorChannels = mode === 3 ? 3 : mode === 0 || mode === 1 || mode === 2 ? 1 : mode === 4 ? 4 : 0;
    if (![1, 2].includes(version) || ![1, 8, 16, 32].includes(depth) || (depth === 1) !== (mode === 0) || !colorChannels || channels < colorChannels || channels > 56 || !width || !height || width > 300000 || height > 300000 || signal?.aborted) return null;
    const palette = mode === 2 && depth === 8 && header.readUInt32BE(26) === 768 ? await read(30, 768) : null;
    if (mode === 2 && !palette) return null;
    let pos = 30 + header.readUInt32BE(26);
    const resources = await read(pos, 4); if (!resources) return null;
    let profile: Buffer | null = null;
    let transparentIndex: number | null = null;
    {
      let cursor = pos + 4;
      const end = cursor + resources.readUInt32BE(0);
      if (end > size) return null;
      for (let records = 0; cursor < end; records++) {
        if (records >= MAX_RECORDS || cursor + 12 > end) return null;
        const record = await read(cursor, 7);
        if (!record || record.toString("ascii", 0, 4) !== "8BIM") return null;
        const id = record.readUInt16BE(4);
        const nameLength = 1 + record[6];
        const lengthOffset = cursor + 6 + nameLength + (nameLength % 2);
        const recordLength = await read(lengthOffset, 4);
        if (!recordLength) return null;
        const length = recordLength.readUInt32BE(0);
        if (id === 1039) {
          if (profile || length < 128 || length > 4 * 1024 * 1024 || lengthOffset + 4 + length > end) return null;
          profile = await read(lengthOffset + 4, length);
          if (!profile || !isPlausibleProfile(profile, mode)) return null;
        }
        if (mode === 2 && id === 1047) {
          if (transparentIndex !== null || length !== 2 || lengthOffset + 6 > end) return null;
          const value = await read(lengthOffset + 4, 2);
          if (!value || value.readUInt16BE() > 255) return null;
          transparentIndex = value.readUInt16BE();
        }
        cursor = lengthOffset + 4 + length + (length % 2);
        if (cursor > end) return null;
      }
    }
    pos += 4 + resources.readUInt32BE(0);
    const layerSizeBytes = version === 2 ? 8 : 4;
    const layers = await read(pos, layerSizeBytes); if (!layers) return null;
    const layerLength = version === 2 ? Number(layers.readBigUInt64BE()) : layers.readUInt32BE();
    if (!Number.isSafeInteger(layerLength)) return null;
    let hasAlpha = false;
    if (layerLength >= layerSizeBytes + 2) {
      const layerInfo = await read(pos + layerSizeBytes, layerSizeBytes + 2);
      if (!layerInfo) return null;
      const infoLength = version === 2 ? Number(layerInfo.readBigUInt64BE()) : layerInfo.readUInt32BE();
      if (!Number.isSafeInteger(infoLength) || infoLength > layerLength - layerSizeBytes) return null;
      hasAlpha = infoLength >= 2 && layerInfo.readInt16BE(layerSizeBytes) < 0;
    }
    if (hasAlpha && channels <= colorChannels) return null;
    if (mode === 2 && hasAlpha) return null;
    const usedChannels = colorChannels + (hasAlpha ? 1 : 0);
    pos += layerSizeBytes + layerLength;
    const compression = await read(pos, 2); if (!compression) return null;
    const compressionType = compression.readUInt16BE();
    if (compressionType > 3) return null;
    if (depth === 1 && compressionType === 3) return null;
    pos += 2;
    const entrySize = version === 2 ? 4 : 2;
    const tableSize = compressionType === 1 ? channels * height * entrySize : 0;
    if (tableSize > 16 * 1024 * 1024) return null;
    const table = await read(pos, tableSize); if (!table) return null;
    pos += tableSize;
    // Large PSBs can have hundreds of millions of pixels. Sample rows and
    // columns directly instead of allocating a full-sized flattened image.
    const scale = width * height > (profile || mode === 2 || (mode === 4 && hasAlpha) ? 4_000_000 : 60_000_000) ? Math.min(1, 2048 / width, 2048 / height) : 1;
    const outWidth = Math.max(1, Math.floor(width * scale));
    const outHeight = Math.max(1, Math.floor(height * scale));
    const sourceColumns = new Int32Array(outWidth);
    const outputColumns = new Int32Array(width).fill(-1);
    const outputRows = new Int32Array(height).fill(-1);
    for (let x = 0; x < outWidth; x++) { const source = Math.floor((x + 0.5) * width / outWidth); sourceColumns[x] = source; outputColumns[source] = x; }
    for (let y = 0; y < outHeight; y++) outputRows[Math.floor((y + 0.5) * height / outHeight)] = y;
    const pixels = Buffer.alloc(outWidth * outHeight * usedChannels);
    if (compressionType === 2 || compressionType === 3) {
      const bytesPerSample = depth / 8;
      const bytesPerPlane = depth === 1 ? Math.ceil(width / 8) * height : width * height * bytesPerSample;
      const required = bytesPerPlane * usedChannels;
      const input = createReadStream(path, { start: pos, highWaterMark: 64 * 1024 });
      const inflater = createInflate();
      const abort = () => input.destroy(new Error("Preview cancelled"));
      signal?.addEventListener("abort", abort, { once: true });
      input.on("error", error => inflater.destroy(error));
      input.pipe(inflater);
      let index = 0, previous = 0, highByte = 0;
      const floatSample = Buffer.alloc(4);
      const predictedFloatRow = depth === 32 && compressionType === 3 ? Buffer.alloc(width * 4) : null;
      const bitmapRow = depth === 1 ? Buffer.alloc(Math.ceil(width / 8)) : null;
      try {
        for await (const data of inflater) {
          const chunk = data as Buffer;
          for (const byte of chunk) {
            const inPlane = index % bytesPerPlane;
            const channel = Math.floor(index / bytesPerPlane);
            if (channel >= usedChannels) break;
            if (bitmapRow) {
              const rowOffset = inPlane % bitmapRow.length;
              bitmapRow[rowOffset] = byte;
              if (rowOffset === bitmapRow.length - 1) {
                const y = outputRows[Math.floor(inPlane / bitmapRow.length)];
                if (y >= 0) for (let x = 0; x < outWidth; x++) pixels[(y * outWidth + x) * usedChannels + channel] = readSample(bitmapRow, sourceColumns[x], 1);
              }
              index++;
              continue;
            }
            if (predictedFloatRow) {
              const rowOffset = inPlane % (width * 4);
              previous = rowOffset === 0 ? byte : (previous + byte) & 0xff;
              predictedFloatRow[rowOffset] = previous;
              if (rowOffset === width * 4 - 1) {
                const y = outputRows[Math.floor(inPlane / (width * 4))];
                if (y >= 0) for (let x = 0; x < outWidth; x++) {
                  const sourceX = sourceColumns[x];
                  for (let k = 0; k < 4; k++) floatSample[k] = predictedFloatRow[k * width + sourceX];
                  pixels[(y * outWidth + x) * usedChannels + channel] = readSample(floatSample, 0, 32);
                }
              }
              index++;
              continue;
            }
            let sampleByte = byte;
            let sampleReady = inPlane % bytesPerSample === 0;
            if (depth === 32) {
              floatSample[inPlane % 4] = byte;
              sampleReady = inPlane % 4 === 3;
              if (sampleReady) sampleByte = readSample(floatSample, 0, depth);
            } else if (compressionType === 3 && depth === 16) {
              if (sampleReady) { highByte = byte; sampleReady = false; }
              else {
                const encoded = (highByte << 8) | byte;
                const sample = Math.floor(inPlane / 2);
                previous = sample % width === 0 ? encoded : (previous + encoded) & 0xffff;
                sampleByte = previous >>> 8;
                sampleReady = true;
              }
            } else if (compressionType === 3) {
              previous = inPlane % width === 0 ? byte : (previous + byte) & 0xff;
              sampleByte = previous;
            }
            if (sampleReady) {
              const sample = Math.floor(inPlane / bytesPerSample);
              if (scale === 1) pixels[sample * usedChannels + channel] = sampleByte;
              else {
                const y = outputRows[Math.floor(sample / width)], x = outputColumns[sample % width];
                if (x >= 0 && y >= 0) pixels[(y * outWidth + x) * usedChannels + channel] = sampleByte;
              }
            }
            index++;
          }
          if (index >= required) break;
        }
      } catch {
        return null;
      } finally {
        input.destroy();
        inflater.destroy();
        signal?.removeEventListener("abort", abort);
      }
      if (index !== required) return null;
      if (palette) return await encodeIndexed(pixels, outWidth, outHeight, palette, profile, transparentIndex);
      if (hasAlpha && mode !== 4 && !profile) removeWhiteMatte(pixels, colorChannels);
      return await encodeComposite(pixels, outWidth, outHeight, usedChannels, mode, profile, hasAlpha);
    }
    const rowBytes = Math.ceil(width * depth / 8);
    for (let channel = 0; channel < usedChannels; channel++) {
      for (let row = 0; row < height; row++) {
        if (signal?.aborted) return null;
        const i = (channel * height + row) * entrySize;
        const count = compressionType === 0 ? rowBytes : entrySize === 2 ? table.readUInt16BE(i) : table.readUInt32BE(i);
        if (count > rowBytes * 2 + 1024) return null;
        if (pos + count > size) return null;
        const outRow = outputRows[row];
        if (outRow < 0) { pos += count; continue; }
        const packed = await read(pos, count); if (!packed) return null;
        pos += count;
        if (compressionType === 0) {
          for (let x = 0; x < outWidth; x++) pixels[((outRow * outWidth + x) * usedChannels) + channel] = readSample(packed, sourceColumns[x] * (depth === 1 ? 1 : depth / 8), depth);
          continue;
        }
        const unpacked = Buffer.alloc(rowBytes);
        let source = 0, x = 0;
        while (source < packed.length && x < rowBytes) {
          const n = packed.readInt8(source++);
          if (n >= 0) {
            const len = n + 1; if (source + len > packed.length || x + len > rowBytes) return null;
            for (let k = 0; k < len; k++) unpacked[x++] = packed[source++];
          } else if (n !== -128) {
            const len = 1 - n; if (source >= packed.length || x + len > rowBytes) return null;
            const value = packed[source++];
            for (let k = 0; k < len; k++) unpacked[x++] = value;
          }
        }
        if (x !== rowBytes) return null;
        for (let x = 0; x < outWidth; x++) pixels[((outRow * outWidth + x) * usedChannels) + channel] = readSample(unpacked, sourceColumns[x] * (depth === 1 ? 1 : depth / 8), depth);
      }
    }
    if (palette) return await encodeIndexed(pixels, outWidth, outHeight, palette, profile, transparentIndex);
    if (hasAlpha && mode !== 4 && !profile) removeWhiteMatte(pixels, colorChannels);
    return await encodeComposite(pixels, outWidth, outHeight, usedChannels, mode, profile, hasAlpha);
  } finally { await file.close(); }
}
