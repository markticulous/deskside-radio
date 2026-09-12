const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const L = (...lines) => lines.join('\n');

/* The Analogue tuner reduced to an icon: walnut cabinet, brass bezel, lit
   dial glass, a tick scale and the red needle, in the tuner's own colours.
   Three cuts, because one drawing cannot serve 16px and 256px:
     small    — 16 to 32. Bigger glass, fewer and fatter ticks, fat needle.
     plain    — the browser tab and any middle size. No text.
     wordmark — 48 and up, where DESKSIDE is actually readable. */

const C = {
  woodA: '#4a2c19', woodB: '#412616', woodEdge: '#2c1a0f',
  brass: '#a5802f', brassLit: '#d6b25e',
  glassTop: '#f7eed2', glassBot: '#d8c08d',
  ink: '#6b5324', needle: '#c1402f', gold: '#d8bd7a'
};

function ticks(x0, x1, baseY, step, majorEvery, minorH, majorH, minorW, majorW) {
  const out = [];
  let i = 0;
  for (let x = x0; x <= x1 + 0.01; x += step, i++) {
    const major = majorEvery > 0 && i % majorEvery === 0;
    const h = major ? majorH : minorH;
    const w = major ? majorW : minorW;
    out.push(
      `<rect x="${(x - w / 2).toFixed(2)}" y="${(baseY - h).toFixed(2)}" ` +
      `width="${w}" height="${h}" rx="${(w / 2).toFixed(2)}" fill="${C.ink}" ` +
      `opacity="${major ? 0.95 : 0.6}"/>`
    );
  }
  return out.join('');
}

function build(o) {
  const g = o.glass;
  const baseY = g.y + g.h - o.scaleInset;
  const needleTop = g.y + o.needleInset;
  const needleBot = baseY + o.needleFoot;
  const nw = o.needleW;

  return L(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="Deskside Radio">',
    '  <defs>',
    '    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">',
    `      <stop offset="0" stop-color="${C.glassTop}"/>`,
    `      <stop offset="1" stop-color="${C.glassBot}"/>`,
    '    </linearGradient>',
    '    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">',
    '      <stop offset="0" stop-color="#ffffff" stop-opacity=".14"/>',
    '      <stop offset=".55" stop-color="#ffffff" stop-opacity="0"/>',
    '      <stop offset="1" stop-color="#000000" stop-opacity=".18"/>',
    '    </linearGradient>',
    '    <linearGradient id="bezel" x1="0" y1="0" x2="0" y2="1">',
    `      <stop offset="0" stop-color="${C.brassLit}"/>`,
    `      <stop offset="1" stop-color="${C.brass}"/>`,
    '    </linearGradient>',
    '    <pattern id="grain" width="9" height="9" patternUnits="userSpaceOnUse">',
    `      <rect width="9" height="9" fill="${C.woodA}"/>`,
    `      <rect width="4" height="9" fill="${C.woodB}"/>`,
    '    </pattern>',
    '  </defs>',
    '',
    '  <!-- cabinet -->',
    `  <rect x="0" y="0" width="256" height="256" rx="${o.radius}" fill="url(#grain)"/>`,
    `  <rect x="0" y="0" width="256" height="256" rx="${o.radius}" fill="url(#sheen)"/>`,
    `  <rect x="2" y="2" width="252" height="252" rx="${o.radius - 2}" fill="none" stroke="${C.woodEdge}" stroke-width="4"/>`,
    '',
    '  <!-- brass bezel -->',
    `  <rect x="${o.bezelInset}" y="${o.bezelInset}" width="${256 - o.bezelInset * 2}" height="${256 - o.bezelInset * 2}" rx="${o.radius - o.bezelInset + 2}" fill="none" stroke="url(#bezel)" stroke-width="${o.bezelW}"/>`,
    '',
    '  <!-- lit dial glass -->',
    `  <rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="${o.glassRadius}" fill="url(#glass)"/>`,
    `  <rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="${o.glassRadius}" fill="none" stroke="${C.ink}" stroke-opacity=".35" stroke-width="2"/>`,
    '',
    '  <!-- scale -->',
    `  <rect x="${o.scale.x0}" y="${baseY}" width="${o.scale.x1 - o.scale.x0}" height="${o.scale.rule}" rx="${o.scale.rule / 2}" fill="${C.ink}" opacity=".8"/>`,
    '  ' + ticks(o.scale.x0, o.scale.x1, baseY, o.scale.step, o.scale.majorEvery, o.scale.minorH, o.scale.majorH, o.scale.minorW, o.scale.majorW),
    '',
    '  <!-- needle -->',
    `  <rect x="${(o.needleX - nw / 2).toFixed(1)}" y="${needleTop}" width="${nw}" height="${(needleBot - needleTop).toFixed(1)}" rx="${(nw / 2).toFixed(1)}" fill="${C.needle}"/>`,
    `  <rect x="${(o.needleX - nw / 2 + nw * 0.27).toFixed(1)}" y="${needleTop}" width="${(nw * 0.22).toFixed(1)}" height="${(needleBot - needleTop).toFixed(1)}" rx="${(nw * 0.11).toFixed(1)}" fill="#ffffff" opacity=".3"/>`,
    o.wordmark
      ? L('',
          '  <!-- wordmark -->',
          `  <text x="128" y="${o.wordmarkY}" text-anchor="middle" fill="${C.gold}"` +
          ' font-family="Big Shoulders Display, Barlow Condensed, Arial Narrow, Impact, sans-serif"' +
          ` font-size="${o.wordmarkSize}" font-weight="800" letter-spacing="${o.wordmarkTrack}">DESKSIDE</text>`)
      : '',
    '</svg>',
    ''
  );
}

const base = {
  radius: 46, bezelInset: 17, bezelW: 7, glassRadius: 11,
  scaleInset: 20, needleInset: 12, needleFoot: 10, needleW: 7, needleX: 152,
  wordmark: false
};

const plain = build(Object.assign({}, base, {
  glass: { x: 38, y: 74, w: 180, h: 108 },
  scale: { x0: 52, x1: 204, step: 9.5, majorEvery: 4, rule: 2.6, minorH: 9, majorH: 17, minorW: 2, majorW: 3.4 }
}));

/* Below about 32px every hairline turns to mush, so the small cut throws
   away the fine ticks and the thin bezel and keeps only what still reads:
   a big lit dial, five fat marks and a fat needle. */
const small = build(Object.assign({}, base, {
  radius: 40, bezelInset: 13, bezelW: 9, glassRadius: 10,
  scaleInset: 26, needleInset: 14, needleFoot: 14, needleW: 15, needleX: 158,
  glass: { x: 28, y: 58, w: 200, h: 140 },
  scale: { x0: 48, x1: 208, step: 40, majorEvery: 1, rule: 6, minorH: 26, majorH: 26, minorW: 7, majorW: 7 }
}));

const marked = build(Object.assign({}, base, {
  wordmark: true, wordmarkY: 208, wordmarkSize: 44, wordmarkTrack: 2,
  glass: { x: 38, y: 48, w: 180, h: 104 },
  scale: { x0: 52, x1: 204, step: 9.5, majorEvery: 4, rule: 2.6, minorH: 9, majorH: 17, minorW: 2, majorW: 3.4 }
}));

fs.writeFileSync(ROOT + 'icon.svg', plain, 'utf8');
fs.writeFileSync(ROOT + 'icon-small.svg', small, 'utf8');
fs.writeFileSync(ROOT + 'icon-wordmark.svg', marked, 'utf8');
console.log('icon.svg, icon-small.svg, icon-wordmark.svg written');
