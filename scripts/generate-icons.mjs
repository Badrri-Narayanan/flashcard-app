// Renders the app icons (two stacked cards on an indigo tile) as PNGs using only node:zlib.
// Run: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = [79, 70, 229];
const BACK = [199, 210, 254];
const FRONT = [255, 255, 255];
const LINE = [79, 70, 229];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Signed distance to a rounded rectangle centred at (cx, cy). Negative means inside. */
function roundRect(x, y, cx, cy, w, h, r) {
  const dx = Math.abs(x - cx) - (w / 2 - r);
  const dy = Math.abs(y - cy) - (h / 2 - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}

/** Colour at unit-square point (u, v); `scale` shrinks the glyph for the maskable safe zone. */
function sample(u, v, { rounded, scale }) {
  if (rounded && roundRect(u, v, 0.5, 0.5, 1, 1, 0.22) > 0) return null;
  const g = (p) => 0.5 + (p - 0.5) / scale;
  const gu = g(u);
  const gv = g(v);
  const r = 0.05 / 1;
  let color = BG;
  if (roundRect(gu, gv, 0.45, 0.42, 0.46, 0.34, r) < 0) color = BACK;
  if (roundRect(gu, gv, 0.55, 0.55, 0.46, 0.34, r) < 0) {
    color = FRONT;
    if (Math.abs(gv - 0.55) < 0.015 && Math.abs(gu - 0.55) < 0.13) color = LINE;
    if (Math.abs(gv - 0.62) < 0.015 && Math.abs(gu - 0.5) < 0.08) color = LINE;
  }
  return color;
}

function render(size, opts) {
  const rgba = Buffer.alloc(size * size * 4);
  const n = 3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const c = sample((x + (sx + 0.5) / n) / size, (y + (sy + 0.5) / n) / size, opts);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
        }
      }
      const i = (y * size + x) * 4;
      if (a > 0) rgba.set([Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round((255 * a) / (n * n))], i);
    }
  }
  return png(size, rgba);
}

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('icon-192.png', out), render(192, { rounded: true, scale: 1 }));
writeFileSync(new URL('icon-512.png', out), render(512, { rounded: true, scale: 1 }));
writeFileSync(new URL('icon-512-maskable.png', out), render(512, { rounded: false, scale: 0.7 }));
