// Dev-only: generates assets/icon-*.png with no image library (zlib + CRC32 only).
// Square orange tile, rounded corners, white graduation cap + tassel.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
mkdirSync(path.join(ROOT, "assets"), { recursive: true });

const crcTable = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const inPoly = (x, y, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

function render(S, { maskable = false } = {}) {
  const px = Buffer.alloc(S * S * 4);
  const pad = S * (maskable ? 0.20 : 0.06);          // maskable = keep art inside the safe zone
  const box = S - pad * 2;
  const rad = S * 0.19;
  const brand = [249, 115, 22], deep = [234, 88, 12];

  // Geometry in a 100-unit design space, then scaled.
  const u = (v) => pad + (v / 100) * box;
  const board = [[50, 26], [95, 45], [50, 64], [5, 45]].map(([x, y]) => [u(x), u(y)]);
  const skull = [[27, 51], [73, 51], [73, 70], [50, 79], [27, 70]].map(([x, y]) => [u(x), u(y)]);
  const tasselX = u(88), tasselTop = u(48), tasselBot = u(74), tasselW = Math.max(2, S * 0.022);
  const knob = [u(88), u(79)];

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      // rounded-rect background
      const cx = Math.min(Math.max(x, pad + rad), pad + box - rad);
      const cy = Math.min(Math.max(y, pad + rad), pad + box - rad);
      const d = Math.hypot(x - cx, y - cy);
      let r = 0, g = 0, b = 0, a = 0;
      if (d <= rad) {
        const t = (x - pad) / box;
        r = Math.round(brand[0] + (deep[0] - brand[0]) * t);
        g = Math.round(brand[1] + (deep[1] - brand[1]) * t);
        b = Math.round(brand[2] + (deep[2] - brand[2]) * t);
        a = 255;
      }
      if (a === 255) {
        const onSkull = inPoly(x, y, skull);
        const onBoard = inPoly(x, y, board);
        const onTassel = Math.abs(x - tasselX) <= tasselW && y >= tasselTop && y <= tasselBot;
        const onKnob = Math.hypot(x - knob[0], y - knob[1]) <= tasselW * 1.5;
        if (onSkull || onBoard || onTassel || onKnob) { r = g = b = 255; }
        else if (y > u(45) && y < u(49) && x > u(20) && x < u(80)) { r = 255; g = 247; b = 237; } // highlight band
      }
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
    }
  }
  const raw = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0;
    px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [name, size, opt] of [["icon-192.png", 192, {}], ["icon-512.png", 512, {}], ["icon-maskable-512.png", 512, { maskable: true }]]) {
  const buf = render(size, opt);
  writeFileSync(path.join(ROOT, "assets", name), buf);
  console.log(`assets/${name}  ${(buf.length / 1024).toFixed(1)} kB`);
}
