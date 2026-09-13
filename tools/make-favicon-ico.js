/* Build one .ico per theme from the 512px renders of the SVG cuts.
   No image library: PNG is decoded and re-encoded with Node's own zlib, and
   the ICO is a header plus the PNG blobs, which Windows has accepted since
   Vista. Downsampling averages in premultiplied alpha, or the transparent
   rounded corners bleed dark fringes.

     node tools/make-theme-icons.js <dir>     # SVG cuts + render wrappers
     <screenshot each wrapper to <dir>/src-<theme>-<cut>.png at 512px>
     node tools/make-favicon-ico.js <dir>     # favicon-<theme>.ico

   favicon.ico, the tab icon, is the dial build and is left alone here; it is
   the same artwork as favicon-dial.ico, so copy that across if the dial cuts
   ever change. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = process.argv[2];
if (!SRC) { console.error('usage: node tools/make-favicon-ico.js <srcdir>'); process.exit(1); }
const OUT = path.join(__dirname, '..');
const THEMES = ['dial', 'console', 'rams', 'editorial', 'retro', 'departures', 'marconi'];

// ---------- CRC32 ----------
const CRC_TABLE = (function () {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// ---------- decode ----------
function decodePng(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('not a PNG');

  let pos = 8, ihdr = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0), height: data.readUInt32BE(4),
        depth: data[8], colorType: data[9], interlace: data[12]
      };
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error('no IHDR');
  if (ihdr.depth !== 8) throw new Error('expected 8-bit, got ' + ihdr.depth);
  if (ihdr.interlace !== 0) throw new Error('interlaced PNG not supported');

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.colorType];
  if (!channels) throw new Error('colour type ' + ihdr.colorType + ' not supported');

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { width: w, height: h } = ihdr;
  const bpp = channels;
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);

  let ri = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[ri++];
    const line = raw.slice(ri, ri + stride); ri += stride;
    const cur = out.slice(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.slice((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = (prev && x >= bpp) ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if (filter !== 0) throw new Error('bad filter ' + filter);
      cur[x] = v & 0xff;
    }
  }

  // Normalise to RGBA.
  if (channels === 4) return { width: w, height: h, data: out };
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0, j = 0; i < w * h; i++) {
    if (channels === 3) { rgba[j++] = out[i * 3]; rgba[j++] = out[i * 3 + 1]; rgba[j++] = out[i * 3 + 2]; rgba[j++] = 255; }
    else if (channels === 1) { const g = out[i]; rgba[j++] = g; rgba[j++] = g; rgba[j++] = g; rgba[j++] = 255; }
    else { const g = out[i * 2]; rgba[j++] = g; rgba[j++] = g; rgba[j++] = g; rgba[j++] = out[i * 2 + 1]; }
  }
  return { width: w, height: h, data: rgba };
}

// ---------- encode ----------
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(img) {
  const { width: w, height: h, data } = img;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------- box downsample, premultiplied ----------
function resize(img, size) {
  const { width: sw, height: sh, data: src } = img;
  const dst = Buffer.alloc(size * size * 4);
  const sx = sw / size, sy = sh / size;

  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1 && yy < sh; yy++) {
        for (let xx = x0; xx < x1 && xx < sw; xx++) {
          const i = (yy * sw + xx) * 4;
          const al = src[i + 3] / 255;
          r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al; a += src[i + 3];
          n++;
        }
      }
      const o = (y * size + x) * 4;
      if (!n) continue;
      const am = a / n;
      const un = am > 0 ? (255 / am) : 0;
      dst[o] = Math.min(255, Math.round((r / n) * un));
      dst[o + 1] = Math.min(255, Math.round((g / n) * un));
      dst[o + 2] = Math.min(255, Math.round((b / n) * un));
      dst[o + 3] = Math.round(am);
    }
  }
  return { width: size, height: size, data: dst };
}

// ---------- ICO ----------
function buildIco(entries) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(entries.length, 4);

  const table = Buffer.alloc(16 * entries.length);
  let offset = 6 + table.length;
  entries.forEach(function (e, i) {
    const o = i * 16;
    table[o] = e.size >= 256 ? 0 : e.size;
    table[o + 1] = e.size >= 256 ? 0 : e.size;
    table[o + 2] = 0; table[o + 3] = 0;
    table.writeUInt16LE(1, o + 4);
    table.writeUInt16LE(32, o + 6);
    table.writeUInt32LE(e.png.length, o + 8);
    table.writeUInt32LE(offset, o + 12);
    offset += e.png.length;
  });
  return Buffer.concat([dir, table].concat(entries.map(function (e) { return e.png; })));
}

// ---------- run ----------
THEMES.forEach(function (theme) {
  const small = decodePng(fs.readFileSync(path.join(SRC, 'src-' + theme + '-small.png')));
  const marked = decodePng(fs.readFileSync(path.join(SRC, 'src-' + theme + '-wordmark.png')));

  // Below 48 the wordmark is a smudge, so those sizes take the simplified cut.
  const PLAN = [
    { size: 16, from: small }, { size: 24, from: small }, { size: 32, from: small },
    { size: 48, from: marked }, { size: 64, from: marked },
    { size: 128, from: marked }, { size: 256, from: marked }
  ];

  const entries = PLAN.map(function (p) {
    return { size: p.size, png: encodePng(resize(p.from, p.size)) };
  });

  const file = path.join(OUT, 'favicon-' + theme + '.ico');
  fs.writeFileSync(file, buildIco(entries));
  console.log('favicon-' + theme + '.ico  ' + fs.statSync(file).size + ' bytes, ' + entries.length + ' sizes');
});
