// Assemble a multi-size favicon.ico from PNG files (PNG-compressed ICO entries, supported by all
// modern browsers). Platform-only: node:fs + Buffer, no dependencies.
// Usage: node make-ico.mjs <out.ico> <png16> <png32> <png48> ...
import { readFileSync, writeFileSync } from "node:fs";

const [out, ...pngs] = process.argv.slice(2);
if (!out || pngs.length === 0) {
  console.error("usage: node make-ico.mjs <out.ico> <png...>");
  process.exit(1);
}

const images = pngs.map((path) => {
  const data = readFileSync(path);
  // PNG IHDR: width @ byte 16, height @ byte 20 (big-endian).
  return { data, width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
});

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: 1 = icon
header.writeUInt16LE(images.length, 4);

let offset = 6 + images.length * 16;
const entries = images.map((img) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(img.width >= 256 ? 0 : img.width, 0); // 0 means 256
  e.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
  e.writeUInt8(0, 2); // color palette
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // color planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(img.data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += img.data.length;
  return e;
});

writeFileSync(out, Buffer.concat([header, ...entries, ...images.map((i) => i.data)]));
console.log(`Wrote ${out} with ${images.length} sizes: ${images.map((i) => i.width).join(", ")}`);
