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

// PSD CMYK samples are inverted. This conversion assumes an unprofiled
// document; profiled and transparent CMYK require a color-managed renderer.
function cmykToRgb(pixels: Buffer): Buffer {
  const result = Buffer.alloc(pixels.length / 4 * 3);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
    result[j] = Math.round(pixels[i] * pixels[i + 3] / 255);
    result[j + 1] = Math.round(pixels[i + 1] * pixels[i + 3] / 255);
    result[j + 2] = Math.round(pixels[i + 2] * pixels[i + 3] / 255);
  }
  return result;
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
    const colorChannels = mode === 3 ? 3 : mode === 1 ? 1 : mode === 4 ? 4 : 0;
    if (![1, 2].includes(version) || ![8, 16].includes(depth) || !colorChannels || channels < colorChannels || channels > 56 || !width || !height || width > 300000 || height > 300000 || signal?.aborted) return null;
    let pos = 30 + header.readUInt32BE(26);
    const resources = await read(pos, 4); if (!resources) return null;
    // Parse resource headers without loading their contents. Refuse embedded
    // ICC profiles until color-managed conversion is available.
    if (mode === 4) {
      let cursor = pos + 4;
      const end = cursor + resources.readUInt32BE(0);
      if (end > size) return null;
      for (let records = 0; cursor < end; records++) {
        if (records >= MAX_RECORDS || cursor + 12 > end) return null;
        const record = await read(cursor, 7);
        if (!record || record.toString("ascii", 0, 4) !== "8BIM") return null;
        if (record.readUInt16BE(4) === 1039) return null;
        const nameLength = 1 + record[6];
        const lengthOffset = cursor + 6 + nameLength + (nameLength % 2);
        const recordLength = await read(lengthOffset, 4);
        if (!recordLength) return null;
        const length = recordLength.readUInt32BE(0);
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
    if (mode === 4 && hasAlpha) return null;
    const usedChannels = colorChannels + (hasAlpha ? 1 : 0);
    pos += layerSizeBytes + layerLength;
    const compression = await read(pos, 2); if (!compression) return null;
    const compressionType = compression.readUInt16BE();
    if (compressionType > 3) return null;
    pos += 2;
    const entrySize = version === 2 ? 4 : 2;
    const tableSize = compressionType === 1 ? channels * height * entrySize : 0;
    if (tableSize > 16 * 1024 * 1024) return null;
    const table = await read(pos, tableSize); if (!table) return null;
    pos += tableSize;
    // Large PSBs can have hundreds of millions of pixels. Sample rows and
    // columns directly instead of allocating a full-sized flattened image.
    const scale = width * height > 60_000_000 ? Math.min(1, 2048 / width, 2048 / height) : 1;
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
      const bytesPerPlane = width * height * bytesPerSample;
      const required = bytesPerPlane * usedChannels;
      const input = createReadStream(path, { start: pos, highWaterMark: 64 * 1024 });
      const inflater = createInflate();
      const abort = () => input.destroy(new Error("Preview cancelled"));
      signal?.addEventListener("abort", abort, { once: true });
      input.on("error", error => inflater.destroy(error));
      input.pipe(inflater);
      let index = 0, previous = 0, highByte = 0;
      try {
        for await (const data of inflater) {
          const chunk = data as Buffer;
          for (const byte of chunk) {
            const inPlane = index % bytesPerPlane;
            const channel = Math.floor(index / bytesPerPlane);
            if (channel >= usedChannels) break;
            let sampleByte = byte;
            let sampleReady = inPlane % bytesPerSample === 0;
            if (compressionType === 3 && depth === 16) {
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
      if (hasAlpha) removeWhiteMatte(pixels, colorChannels);
      return await sharp(mode === 4 ? cmykToRgb(pixels) : pixels, { raw: { width: outWidth, height: outHeight, channels: (mode === 4 ? 3 : usedChannels) as 1 | 2 | 3 | 4 } })
        .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    }
    const rowBytes = width * (depth / 8);
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
          for (let x = 0; x < outWidth; x++) pixels[((outRow * outWidth + x) * usedChannels) + channel] = packed[sourceColumns[x] * (depth / 8)];
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
        for (let x = 0; x < outWidth; x++) pixels[((outRow * outWidth + x) * usedChannels) + channel] = unpacked[sourceColumns[x] * (depth / 8)];
      }
    }
    if (hasAlpha) removeWhiteMatte(pixels, colorChannels);
    return await sharp(mode === 4 ? cmykToRgb(pixels) : pixels, { raw: { width: outWidth, height: outHeight, channels: (mode === 4 ? 3 : usedChannels) as 1 | 2 | 3 | 4 } })
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } finally { await file.close(); }
}
