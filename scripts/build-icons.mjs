// Generates PWA PNG icons with no external dependencies (no ImageMagick/canvas).
// A green tile with a simple white bus, kept inside the maskable safe zone.
// Run: node scripts/build-icons.mjs
import zlib from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "icons");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      raw[p++] = rgba[i];
      raw[p++] = rgba[i + 1];
      raw[p++] = rgba[i + 2];
      raw[p++] = rgba[i + 3];
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function makeIcon(size) {
  const W = size;
  const rgba = new Uint8Array(W * W * 4);
  const set = (x, y, c) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= W) return;
    const i = (y * W + x) * 4;
    rgba[i] = c[0];
    rgba[i + 1] = c[1];
    rgba[i + 2] = c[2];
    rgba[i + 3] = 255;
  };
  const green = [0x18, 0xa9, 0x57];
  const white = [255, 255, 255];
  const dark = [0x0b, 0x13, 0x20];

  // full-bleed green background (safe for maskable)
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) set(x, y, green);

  const roundRect = (nx, ny, nw, nh, nr, col) => {
    const x0 = nx * W, y0 = ny * W, x1 = (nx + nw) * W, y1 = (ny + nh) * W, r = nr * W;
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++)
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        let dx = 0, dy = 0;
        if (x < x0 + r && y < y0 + r) { dx = x0 + r - x; dy = y0 + r - y; }
        else if (x > x1 - r - 1 && y < y0 + r) { dx = x - (x1 - r - 1); dy = y0 + r - y; }
        else if (x < x0 + r && y > y1 - r - 1) { dx = x0 + r - x; dy = y - (y1 - r - 1); }
        else if (x > x1 - r - 1 && y > y1 - r - 1) { dx = x - (x1 - r - 1); dy = y - (y1 - r - 1); }
        if (dx * dx + dy * dy <= r * r) set(x, y, col);
      }
  };
  const circle = (ncx, ncy, nr, col) => {
    const cx = ncx * W, cy = ncy * W, r = nr * W;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r * r) set(x, y, col);
      }
  };

  // bus body
  roundRect(0.22, 0.28, 0.56, 0.4, 0.06, white);
  // windows
  let wx = 0.27;
  for (let i = 0; i < 4; i++) {
    roundRect(wx, 0.33, 0.1, 0.12, 0.02, green);
    wx += 0.125;
  }
  // wheels
  for (const cx of [0.34, 0.66]) {
    circle(cx, 0.7, 0.055, dark);
    circle(cx, 0.7, 0.022, white);
  }
  return rgba;
}

mkdirSync(OUT, { recursive: true });
for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon-180.png", 180],
]) {
  writeFileSync(join(OUT, name), encodePNG(size, makeIcon(size)));
  console.log("wrote", name);
}
