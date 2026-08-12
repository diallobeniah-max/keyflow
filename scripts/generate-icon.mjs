import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const svgPath = resolve(root, "public", "favicon.svg");
const svg = readFileSync(svgPath);

async function main() {
  const sizes = [256, 128, 64, 48, 32, 16];
  const pngBuffers = await Promise.all(
    sizes.map((size) =>
      sharp(svg).resize(size, size).png().toBuffer()
    )
  );

  const icoPath = resolve(root, "build", "icon.ico");
  const icoBuffer = createIco(pngBuffers);
  writeFileSync(icoPath, icoBuffer);
  console.log(`Generated: ${icoPath} (${icoBuffer.length} bytes, ${sizes.length} sizes)`);
}

function createIco(pngBuffers) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngBuffers.length, 4);

  const dirEntries = [];
  let offset = 6 + pngBuffers.length * 16;
  const imageData = [];

  for (const png of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(png.width === 256 ? 0 : png.width, 0);
    entry.writeUInt8(png.height === 256 ? 0 : png.height, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += png.length;
    imageData.push(png);
  }

  return Buffer.concat([header, ...dirEntries, ...imageData]);
}

main().catch((err) => {
  console.error("Icon generation failed:", err);
  process.exit(1);
});
