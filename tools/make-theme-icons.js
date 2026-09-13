/* One icon per theme, so the desktop shortcut looks like the radio the user
   is actually running. Each drawing is that theme's own face, not a recolour
   of the dial: console is a rack panel with a VFD window, rams is the flat
   scale with its orange pointer, editorial is the colour block with the
   name set in it, retro is the pixel screen with its cell meter, departures
   is a flap and its fold seam, marconi is the ray fan over a gold arc.
   Dial keeps the existing artwork, which is already the analogue cabinet.

   Two cuts per theme, same reasoning as make-icon-svg.js: below about 32px
   the fine work turns to mush, so the small cut throws it away and keeps
   only the shapes that survive.

   Writes the SVGs plus an HTML wrapper per cut (the wrapper pulls the same
   webfonts the app uses) into a directory given on the command line:
     node tools/make-theme-icons.js <outdir>
   render-theme-icons then screenshots the wrappers. */
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/make-theme-icons.js <outdir>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const ROOT = path.join(__dirname, '..');
const L = (...lines) => lines.filter(Boolean).join('\n');

/* ---------- B · console ----------
   Black rack panel, corner screws, a sunken VFD window with scanlines, and
   the amber readout inside it. The VU strip is the one flash of colour. */
const CONSOLE = {
  panelTop: '#0d0f12', panelBot: '#090a0c', edge: '#1f2327',
  screw: '#2c3036', screwWell: '#0e1013',
  glass: '#050506', glassEdge: '#1a1d21',
  amber: '#ffb000', amberDim: '#a67a12', green: '#2ee56a', red: '#ff3b1f'
};

function consoleSvg(small) {
  const C = CONSOLE;
  const r = small ? 12 : 14;
  const win = small
    ? { x: 20, y: 46, w: 216, h: 164 }
    : { x: 24, y: 54, w: 208, h: 150 };

  /* The VU strip is the same 9-on-3-off mask the console meter uses. Five
     fat segments at small size, fourteen thin ones at large. */
  const segs = [];
  const n = small ? 5 : 14;
  const sw = small ? 30 : 12;
  const gap = small ? 10 : 4;
  const totalW = n * sw + (n - 1) * gap;
  const sx = 128 - totalW / 2;
  const sy = small ? 158 : 160;
  const sh = small ? 26 : 18;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const fill = t > 0.87 ? C.red : (t > 0.65 ? C.amber : C.green);
    segs.push(`<rect x="${(sx + i * (sw + gap)).toFixed(1)}" y="${sy}" width="${sw}" height="${sh}" fill="${fill}"/>`);
  }

  return L(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="Deskside Radio">',
    '  <defs>',
    '    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">',
    `      <stop offset="0" stop-color="${C.panelTop}"/>`,
    `      <stop offset="1" stop-color="${C.panelBot}"/>`,
    '    </linearGradient>',
    '    <radialGradient id="glow" cx=".5" cy=".42" r=".62">',
    `      <stop offset="0" stop-color="${C.amber}" stop-opacity=".16"/>`,
    `      <stop offset="1" stop-color="${C.amber}" stop-opacity="0"/>`,
    '    </radialGradient>',
    small ? '' : '    <pattern id="scan" width="3" height="3" patternUnits="userSpaceOnUse">',
    small ? '' : '      <rect width="3" height="1" fill="#ffffff" fill-opacity=".05"/>',
    small ? '' : '    </pattern>',
    '  </defs>',
    '',
    '  <!-- rack panel -->',
    `  <rect x="0" y="0" width="256" height="256" rx="${r}" fill="url(#panel)"/>`,
    `  <rect x="1.5" y="1.5" width="253" height="253" rx="${r - 1}" fill="none" stroke="${C.edge}" stroke-width="3"/>`,
    small ? '' : L(
      '',
      '  <!-- corner screws -->',
      [[24, 24], [232, 24], [24, 232], [232, 232]].map(function (p) {
        return `  <circle cx="${p[0]}" cy="${p[1]}" r="6.5" fill="${C.screwWell}"/>` +
               `<circle cx="${p[0]}" cy="${p[1] - 0.5}" r="4.5" fill="${C.screw}"/>`;
      }).join('\n')),
    '',
    '  <!-- VFD window -->',
    `  <rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}" rx="3" fill="${C.glass}"/>`,
    `  <rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}" rx="3" fill="url(#glow)"/>`,
    '',
    small
      ? L('  <!-- readout: one fat lit bar, which is all that reads at 16px -->',
          `  <rect x="46" y="76" width="164" height="34" rx="3" fill="${C.amber}"/>`,
          `  <rect x="46" y="122" width="104" height="14" rx="3" fill="${C.amberDim}"/>`)
      : L('  <!-- readout -->',
          `  <text x="128" y="118" text-anchor="middle" fill="${C.amber}"` +
          ' font-family="Barlow Condensed, Arial Narrow, sans-serif"' +
          ' font-size="52" font-weight="700" letter-spacing="3">DESKSIDE</text>',
          `  <text x="128" y="142" text-anchor="middle" fill="${C.amberDim}"` +
          ' font-family="IBM Plex Mono, monospace" font-size="17" letter-spacing="2">ON AIR</text>'),
    '',
    '  <!-- VU strip -->',
    '  ' + segs.join(''),
    small ? '' : `  <rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}" rx="3" fill="url(#scan)"/>`,
    `  <rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}" rx="3" fill="none" stroke="${C.glassEdge}" stroke-width="2"/>`,
    '</svg>',
    ''
  );
}

/* ---------- C · rams ----------
   Off-white body, one ink rule with its ticks, one orange pointer sitting
   on it, one orange dot. Nothing else, which is the point of the theme. */
const RAMS = { body: '#f3f1ec', rule: '#cfcbc2', ink: '#1d1d1b', mute: '#7a7871', orange: '#f0842a' };

function ramsSvg(small) {
  const C = RAMS;
  const r = small ? 22 : 26;
  const baseY = small ? 176 : 152;
  const x0 = small ? 24 : 34, x1 = small ? 232 : 222;
  const ruleH = small ? 10 : 3;

  const ticks = [];
  if (small) {
    // Four fat marks, far enough apart to survive a 16px box.
    for (let i = 0; i < 4; i++) {
      const x = x0 + 14 + i * ((x1 - x0 - 28) / 3);
      ticks.push(`<rect x="${(x - 5).toFixed(1)}" y="${baseY + ruleH + 8}" width="10" height="26" rx="5" fill="${C.ink}"/>`);
    }
  } else {
    const step = (x1 - x0) / 16;
    for (let i = 0; i <= 16; i++) {
      const major = i % 4 === 0;
      const w = major ? 3 : 1.8;
      const h = major ? 20 : 11;
      ticks.push(`<rect x="${(x0 + i * step - w / 2).toFixed(1)}" y="${baseY + ruleH + 6}" width="${w}" height="${h}" rx="${(w / 2).toFixed(1)}" fill="${major ? C.ink : C.mute}"/>`);
    }
  }

  // The pointer is the theme's own: a triangle standing on the scale line.
  const half = small ? 46 : 17;
  const tall = small ? 78 : 34;
  const px = small ? 150 : 154;
  const pointer = `<path d="M ${px} ${baseY - tall} L ${px + half} ${baseY} L ${px - half} ${baseY} Z" fill="${C.orange}"/>`;

  return L(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="Deskside Radio">',
    '',
    '  <!-- body -->',
    `  <rect x="0" y="0" width="256" height="256" rx="${r}" fill="${C.body}"/>`,
    `  <rect x="1" y="1" width="254" height="254" rx="${r - 1}" fill="none" stroke="${C.rule}" stroke-width="2"/>`,
    '',
    small ? '' : L('  <!-- brand dot -->',
      `  <circle cx="38" cy="40" r="9" fill="${C.orange}"/>`,
      `  <rect x="58" y="36" width="70" height="8" rx="4" fill="${C.ink}" opacity=".85"/>`,
      `  <rect x="58" y="52" width="44" height="6" rx="3" fill="${C.mute}" opacity=".6"/>`),
    '',
    '  <!-- scale -->',
    `  <rect x="${x0}" y="${baseY}" width="${x1 - x0}" height="${ruleH}" rx="${(ruleH / 2).toFixed(1)}" fill="${C.ink}"/>`,
    '  ' + ticks.join(''),
    '',
    '  <!-- pointer -->',
    '  ' + pointer,
    small ? '' : L('',
      '  <!-- wordmark -->',
      `  <text x="128" y="222" text-anchor="middle" fill="${C.ink}"` +
      ' font-family="Archivo Narrow, Arial Narrow, sans-serif"' +
      ' font-size="30" font-weight="700" letter-spacing="2.4">DESKSIDE</text>'),
    '</svg>',
    ''
  );
}

/* ---------- D · editorial ----------
   Paper, a hairline, and the station colour block with the name set large
   and flush in it — the theme is the type and the block, nothing else. */
const EDITORIAL = { paper: '#fbfbfa', rule: '#e3e3df', ink: '#111', block: '#10307a', mute: '#6e6e6a' };

function editorialSvg(small) {
  const C = EDITORIAL;
  const r = small ? 20 : 22;
  const blockY = small ? 84 : 96;

  /* The block is flush to three edges, so it needs the bottom corners
     rounded and the top two square. */
  const block =
    `<path d="M 0 ${blockY} L 256 ${blockY} L 256 ${256 - r} ` +
    `A ${r} ${r} 0 0 1 ${256 - r} 256 L ${r} 256 ` +
    `A ${r} ${r} 0 0 1 0 ${256 - r} Z" fill="${C.block}"/>`;

  return L(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="Deskside Radio">',
    '',
    '  <!-- paper -->',
    `  <rect x="0" y="0" width="256" height="256" rx="${r}" fill="${C.paper}"/>`,
    '',
    small ? '' : L('  <!-- bar -->',
      `  <rect x="26" y="34" width="13" height="13" fill="${C.block}"/>`,
      `  <rect x="49" y="36" width="82" height="9" rx="1" fill="${C.ink}"/>`,
      `  <rect x="0" y="66" width="256" height="2" fill="${C.rule}"/>`),
    '',
    '  <!-- colour block -->',
    '  ' + block,
    '',
    small
      ? L('  <!-- one letter is all that survives at 16px -->',
          '  <text x="128" y="226" text-anchor="middle" fill="#ffffff"' +
          ' font-family="Syne, Figtree, Helvetica Neue, Arial, sans-serif"' +
          ' font-size="116" font-weight="800">D</text>')
      : L('  <!-- name, set the way the display sets it -->',
          '  <text x="22" y="182" fill="#ffffff"' +
          ' font-family="Syne, Figtree, Helvetica Neue, Arial, sans-serif"' +
          ' font-size="50" font-weight="800" letter-spacing="-2">DESK</text>',
          '  <text x="22" y="230" fill="#ffffff"' +
          ' font-family="Syne, Figtree, Helvetica Neue, Arial, sans-serif"' +
          ' font-size="50" font-weight="800" letter-spacing="-2">SIDE</text>'),
    `  <rect x="1" y="1" width="254" height="254" rx="${r - 1}" fill="none" stroke="${C.rule}" stroke-width="2"/>`,
    '</svg>',
    ''
  );
}

/* ---------- E · retro 8-bit ----------
   No curves anywhere, four colours, and the meter quantised into cells.
   The small cut drops the dither: a 1px checker turns to grey mush the
   moment the icon is scaled down. */
/* "Press Start 2P" must be quoted wherever it appears: an unquoted CSS
   family name cannot have a component starting with a digit, so "2P"
   invalidates the whole stack and the text falls back to serif. */
const PS2P = "'Press Start 2P', monospace";
const RETRO = {
  void: '#0a0a0c', ink: '#fcfcfc', grey: '#7c7c7c', dark: '#3c3c3c',
  red: '#f83800', gold: '#f8b800', green: '#b8f818', sky: '#3cbcfc'
};

function retroSvg(small) {
  const C = RETRO;
  const bez = small ? 12 : 10;          // white bezel, fatter when small

  // The cell meter, the one instrument this theme owns.
  const n = small ? 5 : 12;
  const cw = small ? 30 : 15;
  const gap = small ? 10 : 5;
  const totalW = n * cw + (n - 1) * gap;
  const sx = 128 - totalW / 2;
  const sy = small ? 188 : 196;
  const ch = small ? 34 : 22;
  const cells = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const lit = t <= 0.78;
    const fill = !lit ? C.dark : (t > 0.66 ? C.red : (t > 0.5 ? C.gold : C.green));
    cells.push(`<rect x="${(sx + i * (cw + gap)).toFixed(1)}" y="${sy}" width="${cw}" height="${ch}" fill="${fill}"/>`);
  }

  return L(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="Deskside Radio">',
    small ? '' : L(
      '  <defs>',
      '    <pattern id="dither" width="4" height="4" patternUnits="userSpaceOnUse">',
      '      <rect width="2" height="2" fill="#14141a"/>',
      '      <rect x="2" y="2" width="2" height="2" fill="#14141a"/>',
      '    </pattern>',
      '  </defs>',
      ''),
    '  <!-- screen, then the hard pixel bezel: grey outer, white inner -->',
    `  <rect x="0" y="0" width="256" height="256" fill="${C.grey}"/>`,
    `  <rect x="${bez / 2}" y="${bez / 2}" width="${256 - bez}" height="${256 - bez}" fill="${C.void}"/>`,
    `  <rect x="${bez}" y="${bez}" width="${256 - bez * 2}" height="${256 - bez * 2}" fill="none" stroke="${C.ink}" stroke-width="${small ? 10 : 6}"/>`,
    small ? '' : `  <rect x="${bez + 3}" y="${bez + 3}" width="${256 - (bez + 3) * 2}" height="${256 - (bez + 3) * 2}" fill="url(#dither)"/>`,
    '',
    small
      ? L('  <!-- one glyph and the meter: everything else is sub-pixel at 16px -->',
          '  <text x="128" y="158" text-anchor="middle" fill="' + C.ink + '"' +
          ` font-family="${PS2P}" font-size="132">D</text>`)
      : L('  <!-- the name, set in the face the theme actually uses -->',
          '  <text x="128" y="112" text-anchor="middle" fill="' + C.ink + '"' +
          ` font-family="${PS2P}" font-size="42">DESK</text>`,
          '  <text x="128" y="160" text-anchor="middle" fill="' + C.sky + '"' +
          ` font-family="${PS2P}" font-size="42">SIDE</text>`),
    '',
    '  <!-- level, in cells -->',
    '  ' + cells.join(''),
    '</svg>',
    ''
  );
}

/* ---------- F · departures ----------
   A flap and its fold seam. At 16px that is the whole idea: one tile, one
   seam, one amber glyph. The large cut spells the name across four flaps
   and puts the board's own meter under it. */
const DEPARTURES = {
  board: '#0b0b0c', tileTop: '#26282d', tileBot: '#15161a', seam: '#000000',
  edge: '#33363c', amber: '#ffc400', mute: '#6f7176'
};

function departuresSvg(small) {
  const C = DEPARTURES;

  function flap(x, y, w, h, ch, fs) {
    return L(
      `  <rect x="${x}" y="${y}" width="${w}" height="${h / 2}" fill="${C.tileTop}"/>`,
      `  <rect x="${x}" y="${y + h / 2}" width="${w}" height="${h / 2}" fill="${C.tileBot}"/>`,
      `  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${C.edge}" stroke-width="2"/>`,
      ch ? `  <text x="${x + w / 2}" y="${y + h / 2 + fs * 0.36}" text-anchor="middle" fill="${C.amber}"` +
           ` font-family="IBM Plex Mono, monospace" font-size="${fs}" font-weight="700">${ch}</text>` : '',
      `  <rect x="${x}" y="${y + h / 2 - 1.5}" width="${w}" height="3" fill="${C.seam}"/>`
    );
  }

  const segs = [];
  if (!small) {
    const n = 10, sw = 18, gap = 4;
    const totalW = n * sw + (n - 1) * gap;
    const sx = 128 - totalW / 2;
    for (let i = 0; i < n; i++) {
      segs.push(`<rect x="${sx + i * (sw + gap)}" y="204" width="${sw}" height="16" fill="${i < 7 ? C.amber : '#1b1c20'}"/>`);
    }
  }

  return L(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="Deskside Radio">',
    '',
    '  <!-- board -->',
    `  <rect x="0" y="0" width="256" height="256" fill="${C.board}"/>`,
    '',
    small
      ? L('  <!-- one flap, filling the frame -->', flap(22, 34, 212, 188, 'D', 150))
      : L('  <!-- the name across four flaps -->',
          [0, 1, 2, 3].map(function (i) {
            return flap(18 + i * 56, 58, 50, 104, 'DESK'[i], 62);
          }).join('\n'),
          '',
          '  <!-- the meter, built from the same flaps -->',
          '  ' + segs.join('')),
    `  <rect x="1" y="1" width="254" height="254" fill="none" stroke="${C.edge}" stroke-width="2"/>`,
    '</svg>',
    ''
  );
}

/* ---------- G · marconi ----------
   Lacquer, gold, and the ray fan every 1930s cabinet wore. The rays are
   drawn from an inner radius outward rather than masked, which gives the
   same ring without asking a 16px render to resolve a gradient mask. */
const MARCONI = {
  lacquer: '#0f0c09', deep: '#1d1811', gold: '#c9a227', goldHi: '#f0d98a',
  goldLo: '#6d5a2c', mute: '#9a875c'
};

function marconiSvg(small) {
  const C = MARCONI;
  const cx = 128, cy = small ? 122 : 138;
  const n = small ? 10 : 34;
  const r0 = small ? 48 : 34, r1 = small ? 122 : 112;
  const w = small ? 15 : 4;

  const rays = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360;
    rays.push(`<rect x="${cx - w / 2}" y="${cy - r1}" width="${w}" height="${r1 - r0}" fill="${C.gold}"` +
              ` fill-opacity="${small ? 0.62 : 0.34}" transform="rotate(${a.toFixed(1)} ${cx} ${cy})"/>`);
  }

  // The dial arc, and the pointer sitting on it.
  const ar = small ? 86 : 78;
  const ay = small ? 206 : 214;
  const arc = `M ${cx - ar} ${ay} A ${ar} ${ar} 0 0 1 ${cx + ar} ${ay}`;

  return L(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="Deskside Radio">',
    '  <defs>',
    '    <radialGradient id="lac" cx=".5" cy=".08" r=".95">',
    `      <stop offset="0" stop-color="${C.deep}"/>`,
    `      <stop offset="1" stop-color="${C.lacquer}"/>`,
    '    </radialGradient>',
    '    <linearGradient id="leaf" x1="0" y1="0" x2="0" y2="1">',
    '      <stop offset="0" stop-color="#f8eac0"/>',
    `      <stop offset=".55" stop-color="${C.gold}"/>`,
    '      <stop offset="1" stop-color="#8a6d1c"/>',
    '    </linearGradient>',
    '  </defs>',
    '',
    '  <!-- lacquer -->',
    '  <rect x="0" y="0" width="256" height="256" fill="url(#lac)"/>',
    '',
    '  <!-- rays -->',
    '  ' + rays.join(''),
    '',
    small
      ? ''
      : L('  <!-- the name, in the theme\'s own serif -->',
          '  <text x="128" y="152" text-anchor="middle" fill="url(#leaf)"' +
          ' font-family="Cinzel, Cormorant Garamond, serif"' +
          ' font-size="40" font-weight="700" letter-spacing="3">DESKSIDE</text>'),
    '',
    '  <!-- dial arc and pointer -->',
    `  <path d="${arc}" fill="none" stroke="${C.gold}" stroke-width="${small ? 11 : 4}"/>`,
    `  <line x1="${cx}" y1="${ay}" x2="${(cx + ar * 0.74 * Math.cos(-Math.PI / 3.1)).toFixed(1)}" y2="${(ay + ar * 0.74 * Math.sin(-Math.PI / 3.1)).toFixed(1)}"` +
    ` stroke="${C.goldHi}" stroke-width="${small ? 9 : 5}" stroke-linecap="round"/>`,
    `  <circle cx="${cx}" cy="${ay}" r="${small ? 12 : 8}" fill="${C.goldHi}"/>`,
    '',
    `  <rect x="${small ? 4 : 3}" y="${small ? 4 : 3}" width="${256 - (small ? 8 : 6)}" height="${256 - (small ? 8 : 6)}" fill="none" stroke="${C.goldLo}" stroke-width="${small ? 8 : 4}"/>`,
    '</svg>',
    ''
  );
}

/* ---------- H · tivoli ----------
   The object in three shapes: driver, plate, knob. The small cut keeps
   only the knob, because at sixteen pixels the knob is the one part of a
   Model One nobody would mistake for something else. The weave is a
   pattern rather than a texture: at icon sizes it resolves to a tone,
   which is exactly what cloth does at arm's length. */
const TIVOLI = {
  cherryHi: '#8a4828', cherry: '#6b3620', cherryLo: '#3f1d0d',
  cream: '#f3f0e8', creamLo: '#ddd7c8', ink: '#3a352f', mute: '#948d82',
  cloth: '#c3b596', clothHi: '#d6c8a8', clothLo: '#8e8267',
  alHi: '#fdfdfc', al: '#c2c6c5', alLo: '#6f7473', amber: '#ff9d2e',
  red: '#c1402f'
};

function tivoliKnob(cx, cy, r) {
  const C = TIVOLI;
  const flutes = [];
  const n = 48;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * (r - r * 0.16), y1 = cy + Math.sin(a) * (r - r * 0.16);
    const x2 = cx + Math.cos(a) * r, y2 = cy + Math.sin(a) * r;
    flutes.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"` +
      ` stroke="#2f3433" stroke-opacity=".45" stroke-width="${(r * 0.045).toFixed(2)}"/>`);
  }
  return L(
    `  <circle cx="${cx}" cy="${cy + r * 0.05}" r="${r}" fill="#2a1408" fill-opacity=".55"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#tv-al)"/>`,
    '  ' + flutes.join(''),
    `  <circle cx="${cx}" cy="${cy}" r="${r * 0.78}" fill="url(#tv-al)" stroke="${C.alLo}" stroke-width="${(r * 0.03).toFixed(2)}"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="${r * 0.78}" fill="url(#tv-cap)"/>`,
    `  <rect x="${(cx - r * 0.045).toFixed(1)}" y="${(cy - r * 0.9).toFixed(1)}" width="${(r * 0.09).toFixed(1)}"` +
      ` height="${(r * 0.3).toFixed(1)}" rx="${(r * 0.04).toFixed(1)}" fill="#3f4443"/>`
  );
}

function tivoliSvg(small) {
  const C = TIVOLI;
  const defs = L(
    '  <defs>',
    '    <linearGradient id="tv-wood" x1="0" y1="0" x2=".34" y2="1">',
    `      <stop offset="0" stop-color="${C.cherryHi}"/>`,
    `      <stop offset=".58" stop-color="${C.cherry}"/>`,
    `      <stop offset="1" stop-color="${C.cherryLo}"/>`,
    '    </linearGradient>',
    '    <radialGradient id="tv-cloth" cx=".36" cy=".3" r=".8">',
    `      <stop offset="0" stop-color="${C.clothHi}"/>`,
    `      <stop offset=".58" stop-color="${C.cloth}"/>`,
    `      <stop offset="1" stop-color="${C.clothLo}"/>`,
    '    </radialGradient>',
    '    <pattern id="tv-weave" width="7" height="7" patternUnits="userSpaceOnUse">',
    '      <rect width="7" height="7" fill="#c3b596"/>',
    '      <path d="M0 .5 H7 M0 3.5 H7" stroke="#261608" stroke-opacity=".26" stroke-width="1"/>',
    '      <path d="M.5 0 V7 M3.5 0 V7" stroke="#fff8e8" stroke-opacity=".22" stroke-width="1"/>',
    '    </pattern>',
    '    <radialGradient id="tv-al" cx=".34" cy=".26" r=".86">',
    `      <stop offset="0" stop-color="${C.alHi}"/>`,
    `      <stop offset=".5" stop-color="${C.al}"/>`,
    `      <stop offset="1" stop-color="${C.alLo}"/>`,
    '    </radialGradient>',
    '    <radialGradient id="tv-cap" cx=".36" cy=".28" r=".8">',
    '      <stop offset="0" stop-color="#ffffff" stop-opacity=".55"/>',
    '      <stop offset=".6" stop-color="#ffffff" stop-opacity="0"/>',
    '      <stop offset="1" stop-color="#5f6463" stop-opacity=".3"/>',
    '    </radialGradient>',
    '  </defs>'
  );

  const wood = L(
    `  <rect x="0" y="0" width="256" height="256" fill="url(#tv-wood)"/>`,
    '  <g stroke="#3a1406" stroke-opacity=".3" stroke-width="1">',
    '    ' + [26, 58, 96, 140, 178, 214, 240].map(function (x) {
      return `<line x1="${x}" y1="0" x2="${x - 8}" y2="256"/>`;
    }).join(''),
    '  </g>'
  );

  if (small) {
    return L(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="Deskside Radio">',
      defs,
      wood,
      '  <!-- the knob, and nothing else: it is what the set is known by -->',
      tivoliKnob(128, 128, 92),
      '</svg>',
      ''
    );
  }

  const ticks = [];
  for (let i = 0; i < 17; i++) {
    const x = 126 + i * 3.6;
    ticks.push(`<line x1="${x.toFixed(1)}" y1="${i % 4 === 0 ? 150 : 154}" x2="${x.toFixed(1)}" y2="158" stroke="#b9b1a0" stroke-width="1.4"/>`);
  }

  return L(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="Deskside Radio">',
    defs,
    wood,
    '',
    '  <!-- the driver -->',
    `  <circle cx="64" cy="128" r="48" fill="url(#tv-weave)" stroke="${C.cherryLo}" stroke-width="6"/>`,
    `  <circle cx="64" cy="128" r="12" fill="#20120a" fill-opacity=".22"/>`,
    `  <circle cx="64" cy="128" r="26" fill="none" stroke="#fff8e8" stroke-opacity=".28" stroke-width="3"/>`,
    `  <circle cx="64" cy="128" r="38" fill="none" stroke="#fff8e8" stroke-opacity=".16" stroke-width="2"/>`,
    '',
    '  <!-- the plate -->',
    `  <rect x="116" y="86" width="80" height="84" rx="3" fill="${C.cream}" stroke="#2f1408" stroke-opacity=".5" stroke-width="2"/>`,
    `  <circle cx="126" cy="100" r="4" fill="${C.amber}"/>`,
    `  <rect x="136" y="96" width="50" height="9" rx="2" fill="${C.ink}" fill-opacity=".82"/>`,
    `  <rect x="126" y="116" width="60" height="7" rx="2" fill="${C.mute}" fill-opacity=".55"/>`,
    '  ' + ticks.join(''),
    `  <line x1="126" y1="158" x2="186" y2="158" stroke="#b9b1a0" stroke-width="1.6"/>`,
    `  <line x1="150" y1="146" x2="150" y2="162" stroke="${C.red}" stroke-width="3"/>`,
    '',
    '  <!-- the knob -->',
    tivoliKnob(222, 128, 28),
    '</svg>',
    ''
  );
}

/* ---------- write ----------
   Dial reuses the artwork already in the repo; the other three are drawn
   above. The wrapper loads the app's webfonts with display=block, or the
   renderer catches the fallback face mid-swap. */
const FONTS = 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@500;600;700;800' +
  '&family=IBM+Plex+Mono:wght@400;600;700&family=Barlow+Condensed:wght@500;600;700' +
  '&family=Archivo+Narrow:wght@400;500;600;700&family=Syne:wght@700;800&family=Figtree:wght@400;500;600' +
  '&family=Press+Start+2P&family=Saira+Condensed:wght@400;500;600;700&family=Cinzel:wght@600;700&family=Jost:wght@300;400;500&display=block';

function wrapper(svg) {
  return L(
    '<!doctype html><html><head><meta charset="utf-8">',
    `<link rel="stylesheet" href="${FONTS}">`,
    '<style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:512px;height:512px}</style>',
    '</head><body>',
    svg,
    '</body></html>',
    ''
  );
}

const CUTS = {
  dial: {
    small: fs.readFileSync(path.join(ROOT, 'icon-small.svg'), 'utf8'),
    wordmark: fs.readFileSync(path.join(ROOT, 'icon-wordmark.svg'), 'utf8')
  },
  console: { small: consoleSvg(true), wordmark: consoleSvg(false) },
  rams: { small: ramsSvg(true), wordmark: ramsSvg(false) },
  editorial: { small: editorialSvg(true), wordmark: editorialSvg(false) },
  retro: { small: retroSvg(true), wordmark: retroSvg(false) },
  departures: { small: departuresSvg(true), wordmark: departuresSvg(false) },
  marconi: { small: marconiSvg(true), wordmark: marconiSvg(false) },
  tivoli: { small: tivoliSvg(true), wordmark: tivoliSvg(false) }
};

Object.keys(CUTS).forEach(function (theme) {
  Object.keys(CUTS[theme]).forEach(function (cut) {
    const svg = CUTS[theme][cut];
    fs.writeFileSync(path.join(OUT, theme + '-' + cut + '.svg'), svg, 'utf8');
    fs.writeFileSync(path.join(OUT, theme + '-' + cut + '.html'), wrapper(svg), 'utf8');
  });
});

console.log('wrote ' + Object.keys(CUTS).length * 2 + ' cuts to ' + OUT);
