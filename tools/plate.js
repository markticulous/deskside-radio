/* The plate shape every icon shares: big corners top-right and bottom-left,
   small ones top-left and bottom-right (the 12 : 3 proportion of the
   Markticulous plate). Used by make-icon-svg.js and make-theme-icons.js. */
const BIG = 46;
const SMALL = BIG * 3 / 12;

const num = (v) => v.toFixed(2).replace(/\.?0+$/, '');

function plate(x, y, w, h, big, small) {
  const a = small, b = big, c = small, d = big, X = x + w, Y = y + h;
  return `M${num(x + a)},${num(y)} H${num(X - b)} A${num(b)},${num(b)} 0 0 1 ${num(X)},${num(y + b)} ` +
    `V${num(Y - c)} A${num(c)},${num(c)} 0 0 1 ${num(X - c)},${num(Y)} H${num(x + d)} ` +
    `A${num(d)},${num(d)} 0 0 1 ${num(x)},${num(Y - d)} V${num(y + a)} A${num(a)},${num(a)} 0 0 1 ${num(x + a)},${num(y)} Z`;
}

/* Concentric square frames (x = y = d, width = height = 256 - 2d, d <= 20)
   become inset plates; everything is clipped to the outer plate. */
const SQUARE = /<rect x="([\d.]+)" y="\1" width="([\d.]+)" height="\2"(?: rx="[\d.]+")?([^>]*)\/>/g;

function toPlate(svg) {
  if (svg.indexOf('plate-clip') !== -1) return svg; // already a plate (the dial cuts are read back in)
  svg = svg.replace(SQUARE, function (whole, dStr, wStr, rest) {
    const d = parseFloat(dStr), w = parseFloat(wStr);
    if (Math.abs(w - (256 - 2 * d)) > 0.01 || d > 20) return whole;
    return `<path d="${plate(d, d, w, w, Math.max(BIG - d, 0), Math.max(SMALL - d, 0))}"${rest}/>`;
  });
  const clip = `<clipPath id="plate-clip"><path d="${plate(0, 0, 256, 256, BIG, SMALL)}"/></clipPath>`;
  svg = svg.replace(/(<svg[^>]*>)/, `$1<defs>${clip}</defs><g clip-path="url(#plate-clip)">`);
  return svg.replace(/\s*<\/svg>\s*$/, '</g></svg>\n');
}

module.exports = { plate, toPlate, BIG, SMALL };
