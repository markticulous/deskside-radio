/* Wrap an OpenType file as WOFF 1.

     node tools/make-woff.js fonts/VfdNova-Regular.otf

   Nothing about the font changes. WOFF is the same tables in the same
   order with zlib around each one and a fourteen-word header in front, so
   the glyphs that come out are the ones that went in — no subsetting, no
   re-outlining, no hinting touched. The VFD face is 317 glyphs of a
   fourteen-segment display, which is the same handful of straight edges
   three hundred times over, and that compresses to about a tenth.

   Chrome, Edge, Firefox and Safari have all read WOFF for well over a
   decade, so this costs no compatibility. WOFF2 would be smaller again by
   about a kilobyte and a half, but it needs a Brotli-for-fonts encoder,
   which means a dependency — and this project does not have any.

   The licence permits it: VFD Nova is public domain, stated in
   fonts/VFD-Nova-LICENCE.txt. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/make-woff.js <font.otf>');
  process.exit(1);
}

const otf = fs.readFileSync(src);
const flavor = otf.readUInt32BE(0);
const numTables = otf.readUInt16BE(4);

const pad4 = (n) => (n + 3) & ~3;

const tables = [];
for (let i = 0; i < numTables; i++) {
  const rec = 12 + i * 16;
  tables.push({
    tag: otf.readUInt32BE(rec),
    checksum: otf.readUInt32BE(rec + 4),
    offset: otf.readUInt32BE(rec + 8),
    length: otf.readUInt32BE(rec + 12)
  });
}

// The directory has to be in tag order; the data may be anywhere.
tables.sort((a, b) => a.tag - b.tag);

let totalSfntSize = 12 + numTables * 16;
tables.forEach((t) => {
  t.data = otf.subarray(t.offset, t.offset + t.length);
  const squeezed = zlib.deflateSync(t.data, { level: 9 });
  // Stored as-is when compressing would not help, which the spec allows
  // and signals by the two lengths being equal.
  t.comp = squeezed.length < t.length ? squeezed : t.data;
  totalSfntSize += pad4(t.length);
});

const HEAD = 44, ENTRY = 20;
let offset = HEAD + numTables * ENTRY;
tables.forEach((t) => {
  t.woffOffset = offset;
  offset += pad4(t.comp.length);
});

const out = Buffer.alloc(offset, 0);
out.write('wOFF', 0, 'ascii');
out.writeUInt32BE(flavor, 4);
out.writeUInt32BE(offset, 8);            // total WOFF length
out.writeUInt16BE(numTables, 12);
out.writeUInt16BE(0, 14);                // reserved
out.writeUInt32BE(totalSfntSize, 16);
out.writeUInt16BE(1, 20);                // major version
out.writeUInt16BE(0, 22);                // minor version
out.writeUInt32BE(0, 24);                // metaOffset
out.writeUInt32BE(0, 28);                // metaLength
out.writeUInt32BE(0, 32);                // metaOrigLength
out.writeUInt32BE(0, 36);                // privOffset
out.writeUInt32BE(0, 40);                // privLength

tables.forEach((t, i) => {
  const rec = HEAD + i * ENTRY;
  out.writeUInt32BE(t.tag, rec);
  out.writeUInt32BE(t.woffOffset, rec + 4);
  out.writeUInt32BE(t.comp.length, rec + 8);
  out.writeUInt32BE(t.length, rec + 12);
  out.writeUInt32BE(t.checksum, rec + 16);
  t.comp.copy(out, t.woffOffset);
});

const dest = src.replace(/\.otf$/i, '.woff');
fs.writeFileSync(dest, out);

const tag = (n) => String.fromCharCode((n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255);
tables.forEach((t) => {
  console.log('  ' + tag(t.tag).padEnd(6) + String(t.length).padStart(8) + ' -> ' + String(t.comp.length).padStart(8));
});
console.log(path.basename(src) + '  ' + otf.length + ' B  ->  ' +
  path.basename(dest) + '  ' + out.length + ' B  (' +
  Math.round((1 - out.length / otf.length) * 100) + '% smaller)');
