// Generates solid-color PNG icons for the Chrome extension.
// Output: src/assets/icon-{16,48,128}.png
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'src', 'assets');
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Draws a solid-color rounded square with a simple gradient dot.
function makePng(size) {
  const bg = [37, 99, 235];  // blue-600
  const fg = [250, 250, 250]; // zinc-50
  const bytesPerPx = 4;
  const raw = Buffer.alloc(size * (1 + size * bytesPerPx));
  const r = size / 2;
  const cx = r;
  const cy = r;
  const dotR = size * 0.22;
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * bytesPerPx);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const i = rowStart + 1 + x * bytesPerPx;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.hypot(dx, dy);
      // outer rounded square mask
      const pad = size * 0.06;
      const inside =
        x >= pad && x < size - pad && y >= pad && y < size - pad;
      const cornerR = size * 0.24;
      const cornerInside = (() => {
        // distance from nearest corner center
        const ccx = Math.min(Math.max(x + 0.5, pad + cornerR), size - pad - cornerR);
        const ccy = Math.min(Math.max(y + 0.5, pad + cornerR), size - pad - cornerR);
        return Math.hypot(x + 0.5 - ccx, y + 0.5 - ccy) <= cornerR;
      })();
      if (!inside || !cornerInside) {
        raw[i] = 0;
        raw[i + 1] = 0;
        raw[i + 2] = 0;
        raw[i + 3] = 0;
        continue;
      }
      // central dot + two smaller dots (scrolling danmaku feel)
      const dotCenters = [
        { x: cx - size * 0.22, y: cy, r: dotR * 0.55 },
        { x: cx, y: cy, r: dotR * 0.85 },
        { x: cx + size * 0.22, y: cy, r: dotR * 0.7 },
      ];
      let isFg = false;
      for (const dot of dotCenters) {
        if (Math.hypot(x + 0.5 - dot.x, y + 0.5 - dot.y) <= dot.r) {
          isFg = true;
          break;
        }
      }
      const [rr, gg, bb] = isFg ? fg : bg;
      raw[i] = rr;
      raw[i + 1] = gg;
      raw[i + 2] = bb;
      raw[i + 3] = 255;
      // mark dist used to avoid lint no-unused-var
      void dist;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  const idat = deflateSync(raw);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return png;
}

for (const size of [16, 48, 128]) {
  const file = join(outDir, `icon-${size}.png`);
  writeFileSync(file, makePng(size));
  console.log('wrote', file);
}
