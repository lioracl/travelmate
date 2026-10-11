import fs from 'node:fs';
import zlib from 'node:zlib';
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
  let width = 0, height = 0, channels = 4, idat = [];
  for (let at = 8; at < file.length;) {
    const len = file.readUInt32BE(at), type = file.toString('ascii', at + 4, at + 8);
    const data = file.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || ![2,6].includes(data[9]) || data[12] !== 0) throw new Error('Expected noninterlaced RGB/RGBA8');
      channels = data[9] === 2 ? 3 : 4;
    }
    if (type === 'IDAT') idat.push(data);
    at += len + 12;
    if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const decoded = Buffer.alloc(width * height * channels);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[offset++], row = y * width * channels;
    for (let i = 0; i < width * channels; i++) {
      const left = i >= channels ? decoded[row + i - channels] : 0;
      const above = y ? decoded[row - width * channels + i] : 0;
      const upperLeft = y && i >= channels ? decoded[row - width * channels + i - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) {
        const p = left + above - upperLeft;
        const a = Math.abs(p - left), b = Math.abs(p - above), c = Math.abs(p - upperLeft);
        predictor = a <= b && a <= c ? left : b <= c ? above : upperLeft;
      } else if (filter !== 0) throw new Error('Unsupported PNG filter ' + filter);
      decoded[row + i] = (raw[offset++] + predictor) & 255;
    }
  }
  const pixels = Buffer.alloc(width * height * 4, 255);
  for(let i=0;i<width*height;i++) for(let c=0;c<channels;c++) pixels[i*4+c]=decoded[i*channels+c];
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

export { decodePng, encodePng, sample };
