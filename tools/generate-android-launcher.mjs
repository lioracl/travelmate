// Deterministic TravelMate Android launcher raster generation (Node built-ins only).
// The source is the approved pin/plane/AI adaptive artwork; no system icon templates.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const res = path.join(root, 'android/app/src/main/res');
const sourceFile = path.join(root, 'assets/icons/travelmate-adaptive-source.png');
if (!fs.existsSync(sourceFile)) throw new Error('Missing immutable approved launcher source');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function decodePng(filename) {
  const file = fs.readFileSync(filename);
  if (file.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid PNG');
  let width = 0, height = 0, idat = [];
  for (let at = 8; at < file.length;) {
    const len = file.readUInt32BE(at), type = file.toString('ascii', at + 4, at + 8);
    const data = file.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error('Expected noninterlaced RGBA8');
    }
    if (type === 'IDAT') idat.push(data);
    at += len + 12;
    if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * 4);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[offset++], row = y * width * 4;
    for (let i = 0; i < width * 4; i++) {
      const left = i >= 4 ? pixels[row + i - 4] : 0;
      const above = y ? pixels[row - width * 4 + i] : 0;
      const upperLeft = y && i >= 4 ? pixels[row - width * 4 + i - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) {
        const p = left + above - upperLeft;
        const a = Math.abs(p - left), b = Math.abs(p - above), c = Math.abs(p - upperLeft);
        predictor = a <= b && a <= c ? left : b <= c ? above : upperLeft;
      } else if (filter !== 0) throw new Error('Unsupported PNG filter ' + filter);
      pixels[row + i] = (raw[offset++] + predictor) & 255;
    }
  }
  return { width, height, pixels };
}
function encodePng(width, height, pixels) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) pixels.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function sample(src, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  let alpha = 0, rgb = [0, 0, 0];
  for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
    const px = x0 + dx, py = y0 + dy;
    if (px < 0 || py < 0 || px >= src.width || py >= src.height) continue;
    const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
    const i = (py * src.width + px) * 4, a = src.pixels[i + 3] / 255 * weight;
    alpha += a;
    for (let c = 0; c < 3; c++) rgb[c] += src.pixels[i + c] * a;
  }
  return { alpha, rgb: alpha ? rgb.map(c => c / alpha) : [0, 0, 0] };
}
function raster(src, size, mode) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // Adaptive: recenter +33px offset and fit artwork inside the 66dp safe circle.
    // Legacy: crop to painted bounds for readable artwork at small launcher sizes.
    const sx = mode === 'adaptive' ? 249 + ((x + .5) * 432 / size - .5 - 216) / .85 : 90 + (x + .5) * 318 / size - .5;
    const sy = mode === 'adaptive' ? 216 + ((y + .5) * 432 / size - .5 - 216) / .85 : 57 + (y + .5) * 318 / size - .5;
    const { alpha, rgb } = sample(src, sx, sy);
    const i = (y * size + x) * 4;
    if (mode === 'adaptive') {
      for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(rgb[c]);
      pixels[i + 3] = Math.round(alpha * 255);
      continue;
    }
    const t = (x + y) / Math.max(1, 2 * (size - 1));
    const bg = [23 + 12 * t, 62 + 37 * t, 71 + 44 * t];
    for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(rgb[c] * alpha + bg[c] * (1 - alpha));
    const radius = size / 2, d = Math.hypot(x + .5 - radius, y + .5 - radius);
    pixels[i + 3] = mode === 'round' ? Math.round(255 * Math.max(0, Math.min(1, radius - d))) : 255;
  }
  return encodePng(size, size, pixels);
}
const src = decodePng(sourceFile);
if (src.width !== 432 || src.height !== 432) throw new Error('Unexpected adaptive source dimensions');
for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  const dir = path.join(res, 'mipmap-' + density);
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), raster(src, size, 'square'));
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), raster(src, size, 'round'));
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), raster(src, size * 9 / 4, 'adaptive'));
  console.log('Generated TravelMate launcher resources:', density);
}
