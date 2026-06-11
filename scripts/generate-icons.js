const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZES = [16, 48, 128];
const ACCENT = [255, 107, 53];
const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];
const DARK = [40, 40, 40];

function setPixel(buf, size, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const idx = (y * size + x) * 4;
  buf[idx] = r;
  buf[idx + 1] = g;
  buf[idx + 2] = b;
  buf[idx + 3] = a;
}

function fillRect(buf, size, x1, y1, x2, y2, r, g, b, a = 255) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      setPixel(buf, size, x, y, r, g, b, a);
    }
  }
}

function drawHLine(buf, size, x1, x2, y, r, g, b) {
  for (let x = x1; x <= x2; x++) setPixel(buf, size, x, y, r, g, b);
}

function drawVLine(buf, size, x, y1, y2, r, g, b) {
  for (let y = y1; y <= y2; y++) setPixel(buf, size, x, y, r, g, b);
}

function drawLetterA(buf, size, cx, cy, scale, r, g, b) {
  const w = Math.max(3, Math.round(scale * 0.5));
  const h = Math.max(4, Math.round(scale * 0.7));
  const left = cx - Math.round(w / 2);
  const barY = cy + Math.round(h * 0.15);

  for (let row = 0; row < h; row++) {
    const half = Math.round((row / h) * w * 0.5);
    for (let col = half; col < w - half; col++) {
      setPixel(buf, size, left + col, cy - Math.round(h / 2) + row, r, g, b);
    }
  }
  drawHLine(buf, size, left + 1, left + w - 2, barY, r, g, b);
}

function createIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const pad = Math.max(1, Math.round(size * 0.08));
  const bw = Math.max(1, Math.round(size * 0.04));

  // folder body
  const fTop = Math.round(size * 0.28);
  const fBot = size - pad - 1;
  const fL = pad;
  const fR = size - pad - 1;

  // folder tab
  const tabW = Math.round(size * 0.4);
  const tabH = Math.round(size * 0.12);
  const tabL = Math.round(size * 0.15);
  const tabR = tabL + tabW;

  // fill folder background
  fillRect(buf, size, fL, fTop + tabH, fR, fBot, ACCENT[0], ACCENT[1], ACCENT[2]);

  // tab
  fillRect(buf, size, tabL, fTop, tabR, fTop + tabH, ACCENT[0], ACCENT[1], ACCENT[2]);

  // folder lines (subtle document lines)
  const lineY1 = Math.round(size * 0.5);
  const lineY2 = Math.round(size * 0.58);
  const lineY3 = Math.round(size * 0.66);
  const lineY4 = Math.round(size * 0.74);
  const linePad = Math.round(size * 0.12);
  for (const ly of [lineY1, lineY2, lineY3, lineY4]) {
    drawHLine(buf, size, fL + linePad, fR - linePad, ly, 220, 80, 40);
  }

  // letter A
  const aScale = Math.round(size * 0.5);
  drawLetterA(buf, size, Math.round(size / 2), Math.round(size * 0.58), aScale, WHITE[0], WHITE[1], WHITE[2]);

  // black border (folder)
  for (let x = fL; x <= fR; x++) {
    for (let b = 0; b < bw; b++) {
      setPixel(buf, size, x, fTop + tabH - 1 + b, BLACK[0], BLACK[1], BLACK[2]);
      setPixel(buf, size, x, fBot - b, BLACK[0], BLACK[1], BLACK[2]);
    }
  }
  for (let y = fTop + tabH; y <= fBot; y++) {
    for (let b = 0; b < bw; b++) {
      setPixel(buf, size, fL + b, y, BLACK[0], BLACK[1], BLACK[2]);
      setPixel(buf, size, fR - b, y, BLACK[0], BLACK[1], BLACK[2]);
    }
  }

  // tab border
  for (let x = tabL; x <= tabR; x++) {
    for (let b = 0; b < bw; b++) {
      setPixel(buf, size, x, fTop - 1 + b, BLACK[0], BLACK[1], BLACK[2]);
    }
  }
  for (let y = fTop; y <= fTop + tabH; y++) {
    for (let b = 0; b < bw; b++) {
      setPixel(buf, size, tabL - 1 + b, y, BLACK[0], BLACK[1], BLACK[2]);
      setPixel(buf, size, tabR + 1 - b, y, BLACK[0], BLACK[1], BLACK[2]);
    }
  }

  return buf;
}

function makePNGBuffer(pixelData, width, height) {
  const rawData = Buffer.alloc(pixelData.length);
  pixelData.copy(rawData);

  const lineSize = width * 4 + 1;
  const dataSize = lineSize * height;
  const buf = Buffer.alloc(dataSize);

  for (let y = 0; y < height; y++) {
    buf[y * lineSize] = 0;
    pixelData.copy(buf, y * lineSize + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const deflated = zlib.deflateSync(buf);

  function crc32(data) {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      c = (c >>> 8) ^ crc32Table[(c ^ data[i]) & 0xff];
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  const crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crc32Table[i] = c;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeB = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeB, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData), 0);
    return Buffer.concat([len, typeB, data, crc]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const assetsDir = path.join(__dirname, '..', 'src', 'assets');

SIZES.forEach(size => {
  const pixelData = createIcon(size);
  const pngBuffer = makePNGBuffer(pixelData, size, size);
  const filePath = path.join(assetsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, pngBuffer);
  console.log(`Created ${filePath} (${pngBuffer.length} bytes)`);
});
