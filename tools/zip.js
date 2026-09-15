/* A ZIP writer, because the release needs one and nothing else here has a
   dependency. It is the same bargain as tools/make-favicon-ico.js, which
   encodes PNG and ICO by hand: the format is a header, the bytes, and a
   table of contents at the end, and Node already owns the hard part --
   zlib does the deflating.

     const zip = require('./zip.js');
     fs.writeFileSync('out.zip', zip([{ name: 'a.txt', data: buf }]));

   Only what a release needs: no folders, no encryption, no Zip64, no
   archives over 4 GB. Everything else a reader expects is here, including
   the Unix mode bits, so the Linux shortcut script arrives executable
   rather than needing a chmod before it will run. */
const zlib = require('zlib');

/* CRC-32 as the format defines it: reflected, polynomial 0xEDB88320. Built
   once rather than per file, because a 300 KB archive would otherwise pay
   for the table sixteen times. */
const TABLE = (function () {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/* MS-DOS packed date and time, which is what ZIP has carried since 1989:
   two seconds of resolution, and years counted from 1980. */
function dosTime(d) {
  return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
}
function dosDate(d) {
  return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
}

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;

/* entries: [{ name, data: Buffer, mode }]  ->  Buffer
   `when` stamps every entry, so the same input gives the same archive
   rather than a new one each time the build is run. */
function zip(entries, when) {
  const stamp = when || new Date();
  const time = dosTime(stamp), date = dosDate(stamp);
  const body = [], central = [];
  let offset = 0;

  entries.forEach(function (e) {
    const name = Buffer.from(e.name, 'utf8');
    const raw = e.data;
    const packed = zlib.deflateRawSync(raw, { level: 9 });
    /* Deflate makes already-compressed data slightly bigger. The icons are
       PNG inside, so they are stored rather than grown. */
    const method = packed.length < raw.length ? 8 : 0;
    const out = method === 8 ? packed : raw;
    const sum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL, 0);
    local.writeUInt16LE(20, 4);              // version needed: 2.0
    local.writeUInt16LE(0, 6);               // no flags: sizes are known up front
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(out.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);              // no extra field
    body.push(local, name, out);

    const head = Buffer.alloc(46);
    head.writeUInt32LE(CENTRAL, 0);
    /* Made by Unix (0x03), spec 3.0 (0x1E). The high byte is what tells a
       reader the external attributes hold a Unix mode worth honouring. */
    head.writeUInt16LE(0x031E, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0, 8);
    head.writeUInt16LE(method, 10);
    head.writeUInt16LE(time, 12);
    head.writeUInt16LE(date, 14);
    head.writeUInt32LE(sum, 16);
    head.writeUInt32LE(out.length, 20);
    head.writeUInt32LE(raw.length, 24);
    head.writeUInt16LE(name.length, 28);
    head.writeUInt16LE(0, 30);               // extra
    head.writeUInt16LE(0, 32);               // comment
    head.writeUInt16LE(0, 34);               // disk it starts on
    head.writeUInt16LE(0, 36);               // internal attributes
    // Multiplied rather than shifted: 0o100755 << 16 overflows a signed int.
    head.writeUInt32LE((e.mode || 0o100644) * 0x10000, 38);
    head.writeUInt32LE(offset, 42);
    central.push(head, name);

    offset += local.length + name.length + out.length;
  });

  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END, 0);
  end.writeUInt16LE(0, 4);                   // this disk
  end.writeUInt16LE(0, 6);                   // disk the directory starts on
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);                  // no archive comment

  return Buffer.concat([Buffer.concat(body), dir, end]);
}

module.exports = zip;
