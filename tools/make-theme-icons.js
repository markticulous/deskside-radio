/* One icon per theme, so the desktop shortcut looks like the radio the user
   is actually running. Each drawing is that theme's own face, not a recolour
   of the dial: console is a rack panel with a VFD window, rams is the flat
   scale with its orange pointer, editorial is the colour block with the
   name set in it. Dial keeps the existing artwork, which is already the
   analogue cabinet.

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

/* ---------- write ----------
   Dial reuses the artwork already in the repo; the other three are drawn
   above. The wrapper loads the app's webfonts with display=block, or the
   renderer catches the fallback face mid-swap. */
const FONTS = 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@500;600;700;800' +
  '&family=IBM+Plex+Mono:wght@400;600&family=Barlow+Condensed:wght@500;600;700' +
  '&family=Archivo+Narrow:wght@400;500;600;700&family=Syne:wght@700;800&family=Figtree:wght@400;500;600&display=block';

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
  editorial: { small: editorialSvg(true), wordmark: editorialSvg(false) }
};

Object.keys(CUTS).forEach(function (theme) {
  Object.keys(CUTS[theme]).forEach(function (cut) {
    const svg = CUTS[theme][cut];
    fs.writeFileSync(path.join(OUT, theme + '-' + cut + '.svg'), svg, 'utf8');
    fs.writeFileSync(path.join(OUT, theme + '-' + cut + '.html'), wrapper(svg), 'utf8');
  });
});

console.log('wrote ' + Object.keys(CUTS).length * 2 + ' cuts to ' + OUT);
