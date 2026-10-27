/**
 * PNG in and out without a dependency: 8-bit RGB and RGBA, not interlaced, which is what the export writes. `inspect`
 * and `contact` read sheets with it, and the trimmed export (tools/trim.ts) writes its pages with it.
 */

import { deflateSync, inflateSync } from 'node:zlib';

export interface Decoded {
  width: number;
  height: number;
  /** 3 (RGB) or 4 (RGBA). */
  channels: number;
  pixels: Buffer;
}

/** Decodes an 8-bit RGB or RGBA PNG. Throws an Error that says what it cannot read. */
export function decodePng(buffer: Buffer): Decoded {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error('not a PNG file.');

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8) throw new Error(`8-bit PNG only (found ${bitDepth}-bit).`);
      if (colorType !== 6 && colorType !== 2) throw new Error(`RGB and RGBA PNG only (found color type ${colorType}).`);
      if (interlace !== 0) throw new Error('interlaced PNG is not supported.');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      let value = raw[src + x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) value += paeth(left, up, upLeft);
      pixels[y * stride + x] = value & 255;
    }
  }

  return { width, height, channels, pixels };
}

function paeth(left: number, up: number, upLeft: number): number {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface EncodeOptions {
  /**
   * Row filters: 'none' writes the bytes as they are (fast, for review images); 'adaptive' picks, for each row, the
   * filter whose bytes sum smallest, as encoders do, so deflate finds more to compress (for exported pages).
   */
  filter?: 'none' | 'adaptive';
  /** zlib level, 0 to 9. */
  level?: number;
}

/** Encodes RGBA pixels as an 8-bit RGBA PNG. The same pixels always give the same bytes. */
export function encodePng(width: number, height: number, rgba: Buffer, { filter = 'none', level }: EncodeOptions = {}): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  const candidate = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const out = y * (stride + 1);
    if (filter === 'none') {
      rgba.copy(raw, out + 1, row, row + stride);
      continue;
    }
    let bestSum = Infinity;
    for (let type = 0; type <= 4; type++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const value = rgba[row + x];
        const left = x >= 4 ? rgba[row + x - 4] : 0;
        const up = y > 0 ? rgba[row - stride + x] : 0;
        const upLeft = y > 0 && x >= 4 ? rgba[row - stride + x - 4] : 0;
        const predicted = type === 0 ? 0 : type === 1 ? left : type === 2 ? up : type === 3 ? (left + up) >> 1 : paeth(left, up, upLeft);
        const byte = (value - predicted) & 255;
        candidate[x] = byte;
        sum += byte < 128 ? byte : 256 - byte;
        if (sum >= bestSum) break;
      }
      if (sum < bestSum) {
        bestSum = sum;
        raw[out] = type;
        candidate.copy(raw, out + 1);
      }
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, level === undefined ? {} : { level })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
