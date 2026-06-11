const fs = require('fs');
const path = require('path');

const SIZES = [16, 48, 128];
const COLORS = {
  bg: '#ff6b35',
  text: '#ffffff',
  border: '#000000',
};

function createPNG(size) {
  const canvas = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;

      if (dist <= r) {
        canvas[idx] = 0xff;     // R
        canvas[idx + 1] = 0x6b; // G
        canvas[idx + 2] = 0x35; // B
        canvas[idx + 3] = 0xff; // A
      } else {
        canvas[idx] = 0;
        canvas[idx + 1] = 0;
        canvas[idx + 2] = 0;
        canvas[idx + 3] = 0;
      }
    }
  }

  return canvas;
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
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const zlib = require('zlib');
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
  const pixelData = createPNG(size);
  const pngBuffer = makePNGBuffer(pixelData, size, size);
  const filePath = path.join(assetsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, pngBuffer);
  console.log(`Created ${filePath} (${pngBuffer.length} bytes)`);
});
