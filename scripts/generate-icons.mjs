import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function insideShield(x, y, size) {
  const normalizedX = x / size;
  const normalizedY = y / size;
  if (normalizedY < 0.22 || normalizedY > 0.86) return false;
  const halfWidth =
    normalizedY < 0.49 ? 0.31 : 0.31 * (1 - (normalizedY - 0.49) / 0.45);
  return Math.abs(normalizedX - 0.5) <= Math.max(0.04, halfWidth);
}

function makeIcon(size) {
  const stride = size * 4 + 1;
  const pixels = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    pixels[y * stride] = 0;
    for (let x = 0; x < size; x += 1) {
      const offset = y * stride + 1 + x * 4;
      const dx = x - size / 2;
      const dy = y - size / 2;
      const rounded = Math.hypot(
        Math.max(0, Math.abs(dx) - size * 0.31),
        Math.max(0, Math.abs(dy) - size * 0.31),
      );
      const background = rounded < size * 0.17;
      const shield = insideShield(x, y, size);
      const fork =
        shield &&
        ((Math.abs(x / size - 0.42) < 0.025 &&
          y / size > 0.3 &&
          y / size < 0.7) ||
          (Math.abs(x / size - 0.58) < 0.025 &&
            y / size > 0.3 &&
            y / size < 0.7) ||
          (y / size > 0.62 &&
            y / size < 0.67 &&
            x / size > 0.34 &&
            x / size < 0.66));
      const color = fork
        ? [33, 22, 50, 255]
        : shield
          ? [240, 181, 77, 255]
          : background
            ? [34, 24, 62, 255]
            : [15, 10, 28, 255];
      pixels.set(color, offset);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  const target = resolve(`apps/web/public/icon-${size}.png`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, makeIcon(size));
}
