// Generate 1980s retro-style PWA icons
// Run with: node scripts/generate-icons.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '../public');

// CRC32 implementation for PNG
function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// Linear interpolation between two colors
function lerpColor(c1, c2, t) {
  return {
    r: Math.round(c1.r + (c2.r - c1.r) * t),
    g: Math.round(c1.g + (c2.g - c1.g) * t),
    b: Math.round(c1.b + (c2.b - c1.b) * t),
  };
}

// Create 1980s retro gradient PNG with book and magnifying glass
function createRetroPNG(size) {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk - RGBA
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData.writeUInt8(8, 8);  // bit depth
  ihdrData.writeUInt8(6, 9);  // color type RGBA
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Colors
  const pink1 = { r: 255, g: 107, b: 157 };   // #ff6b9d - top left
  const pink2 = { r: 196, g: 69, b: 105 };    // #c44569 - middle
  const purple = { r: 107, g: 45, b: 92 };    // #6b2d5c - bottom right
  const yellow = { r: 255, g: 230, b: 109 };  // #ffe66d - accent
  const white = { r: 255, g: 255, b: 255 };
  const darkPink = { r: 140, g: 40, b: 70 };

  const rowSize = 1 + size * 4; // filter byte + RGBA
  const rawData = Buffer.alloc(size * rowSize);

  const cornerRadius = Math.floor(size * 0.156); // ~80/512

  // Precompute some sizes
  const bookCenterX = size * 0.5;
  const bookCenterY = size * 0.55;
  const bookWidth = size * 0.47;
  const bookHeight = size * 0.39;
  const spineWidth = size * 0.047;

  const magX = size * 0.664;
  const magY = size * 0.312;
  const magRadius = size * 0.098;
  const magThickness = size * 0.023;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // filter byte

    for (let x = 0; x < size; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;

      // Check if inside rounded rectangle
      let inside = true;
      if (x < cornerRadius && y < cornerRadius) {
        const dx = cornerRadius - x;
        const dy = cornerRadius - y;
        if (dx * dx + dy * dy > cornerRadius * cornerRadius) inside = false;
      } else if (x >= size - cornerRadius && y < cornerRadius) {
        const dx = x - (size - cornerRadius - 1);
        const dy = cornerRadius - y;
        if (dx * dx + dy * dy > cornerRadius * cornerRadius) inside = false;
      } else if (x < cornerRadius && y >= size - cornerRadius) {
        const dx = cornerRadius - x;
        const dy = y - (size - cornerRadius - 1);
        if (dx * dx + dy * dy > cornerRadius * cornerRadius) inside = false;
      } else if (x >= size - cornerRadius && y >= size - cornerRadius) {
        const dx = x - (size - cornerRadius - 1);
        const dy = y - (size - cornerRadius - 1);
        if (dx * dx + dy * dy > cornerRadius * cornerRadius) inside = false;
      }

      if (!inside) {
        rawData[pixelOffset] = 0;
        rawData[pixelOffset + 1] = 0;
        rawData[pixelOffset + 2] = 0;
        rawData[pixelOffset + 3] = 0;
        continue;
      }

      // Diagonal gradient
      const t = (x + y) / (size * 2);
      let color;
      if (t < 0.5) {
        color = lerpColor(pink1, pink2, t * 2);
      } else {
        color = lerpColor(pink2, purple, (t - 0.5) * 2);
      }

      // Scanlines
      if (y % Math.floor(size / 8.5) < Math.floor(size / 128)) {
        color = lerpColor(color, { r: 0, g: 0, b: 0 }, 0.1);
      }

      // Draw book
      const relX = x - bookCenterX;
      const relY = y - bookCenterY;

      // Left page
      if (relX >= -bookWidth / 2 && relX <= -spineWidth / 2 &&
          relY >= -bookHeight / 2 && relY <= bookHeight / 2) {
        color = lerpColor(white, color, 0.05);
        // Page lines
        const lineSpacing = bookHeight / 6;
        for (let i = 1; i < 6; i++) {
          const lineY = -bookHeight / 2 + i * lineSpacing;
          if (Math.abs(relY - lineY) < size * 0.006 && relX < -spineWidth / 2 - size * 0.04) {
            color = lerpColor(darkPink, color, 0.4);
          }
        }
      }

      // Right page
      if (relX >= spineWidth / 2 && relX <= bookWidth / 2 &&
          relY >= -bookHeight / 2 && relY <= bookHeight / 2) {
        color = lerpColor(white, color, 0.05);
        // Page lines
        const lineSpacing = bookHeight / 6;
        for (let i = 1; i < 6; i++) {
          const lineY = -bookHeight / 2 + i * lineSpacing;
          if (Math.abs(relY - lineY) < size * 0.006 && relX > spineWidth / 2 + size * 0.04) {
            color = lerpColor(darkPink, color, 0.4);
          }
        }
      }

      // Spine
      if (Math.abs(relX) <= spineWidth / 2 &&
          relY >= -bookHeight / 2 && relY <= bookHeight / 2) {
        color = yellow;
      }

      // Magnifying glass
      const magDx = x - magX;
      const magDy = y - magY;
      const magDist = Math.sqrt(magDx * magDx + magDy * magDy);

      // Glass rim
      if (magDist >= magRadius - magThickness && magDist <= magRadius + magThickness) {
        const rimT = (magDist - magRadius + magThickness) / (magThickness * 2);
        color = lerpColor(yellow, { r: 255, g: 154, b: 60 }, rimT);
      }

      // Glass interior
      if (magDist < magRadius - magThickness) {
        color = lerpColor(color, white, 0.3);
      }

      // Handle
      const handleStartX = magX + magRadius * 0.707;
      const handleStartY = magY + magRadius * 0.707;
      const handleEndX = magX + magRadius * 1.4 + size * 0.068;
      const handleEndY = magY + magRadius * 1.4 + size * 0.068;

      // Check distance to handle line
      const handleLen = Math.sqrt((handleEndX - handleStartX) ** 2 + (handleEndY - handleStartY) ** 2);
      const handleDirX = (handleEndX - handleStartX) / handleLen;
      const handleDirY = (handleEndY - handleStartY) / handleLen;
      const handleProjLen = (x - handleStartX) * handleDirX + (y - handleStartY) * handleDirY;

      if (handleProjLen > 0 && handleProjLen < handleLen) {
        const handleProjX = handleStartX + handleDirX * handleProjLen;
        const handleProjY = handleStartY + handleDirY * handleProjLen;
        const handleDist = Math.sqrt((x - handleProjX) ** 2 + (y - handleProjY) ** 2);
        if (handleDist < magThickness) {
          const handleT = handleProjLen / handleLen;
          color = lerpColor(yellow, { r: 255, g: 154, b: 60 }, handleT);
        }
      }

      rawData[pixelOffset] = color.r;
      rawData[pixelOffset + 1] = color.g;
      rawData[pixelOffset + 2] = color.b;
      rawData[pixelOffset + 3] = 255;
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate icons
function main() {
  const sizes = [
    { name: 'pwa-192x192.png', size: 192 },
    { name: 'pwa-512x512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
  ];

  for (const { name, size } of sizes) {
    console.log(`Generating ${name} (${size}x${size})...`);
    const png = createRetroPNG(size);
    fs.writeFileSync(path.join(publicDir, name), png);
  }

  console.log('Done! 1980s retro icons generated in public/');
}

main();
