/* Fold the app into one file for distribution.

   The source stays split — five modules and a stylesheet — because that is
   how it is worked on. What ships is index.html with all of it inlined, the
   four theme icons, and the shortcut helper: six files, and the only ones
   that cannot be folded in are the icons, because Windows reads them off
   disk rather than out of the page.

     node tools/build-dist.js          → dist/

   The webfont link is left pointing at Google. Offline the app falls back
   to the stacks named beside each face, which is the same behaviour the
   split version has on a plane. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* A closing tag inside a string would end the block early — app.js has none
   today, but a build that can be broken by a future string is not a build. */
function inlineSafe(js) { return js.replace(/<\/script/gi, '<\\/script'); }

function dataUri(file, type) {
  return 'data:' + type + ';base64,' + fs.readFileSync(path.join(ROOT, file)).toString('base64');
}

/* The one webfont that is not fetched from Google travels with the sheet,
   or the console theme would fall back to a typeface in the download and
   nowhere else. */
function styleSheet() {
  const url = 'url("fonts/VfdNova-Regular.otf")';
  const css = read('app.css');
  if (css.indexOf(url) === -1) throw new Error('app.css no longer loads the VFD face');
  return css.replace(url, 'url("' + dataUri('fonts/VfdNova-Regular.otf', 'font/otf') + '")');
}

let html = read('index.html');
const before = html.length;

html = html.replace('<link rel="stylesheet" href="app.css">', function () {
  return '<style>\n' + styleSheet() + '\n</style>';
});

const SCRIPTS = ['signal.js', 'radio-directory.js', 'scheduler.js', 'tuner-ui.js', 'app.js'];
SCRIPTS.forEach(function (src) {
  const tag = '<script src="' + src + '"></script>';
  if (html.indexOf(tag) === -1) throw new Error('index.html no longer loads ' + src);
  html = html.replace(tag, '<script>\n' + inlineSafe(read(src)) + '\n</script>');
});

/* The tab icon becomes the dial .ico, which ships anyway for the shortcut.
   The other two are small enough to carry in the page. */
html = html.replace('<link rel="icon" href="favicon.ico"', '<link rel="icon" href="favicon-dial.ico"');
html = html.replace('href="icon-small.svg"', 'href="' + dataUri('icon-small.svg', 'image/svg+xml') + '"');
html = html.replace('href="icon-256.png"', 'href="' + dataUri('icon-256.png', 'image/png') + '"');

/* Anything still loaded from a second file has to be one we copy across.
   Only real tags count — app.js builds URLs in strings, and matching those
   made the build report itself. */
const loads = html.match(/<(?:script|link|img)\b[^>]*\b(?:src|href)="(?!https?:|data:)([^"]+)"/g) || [];
const outside = loads.filter(function (tag) { return tag.indexOf('favicon-dial.ico') === -1; });
if (outside.length) console.log('note: still loading from separate files:\n  ' + outside.join('\n  '));

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html, 'utf8');

['favicon-dial.ico', 'favicon-console.ico', 'favicon-rams.ico', 'favicon-editorial.ico',
 'favicon-retro.ico', 'favicon-departures.ico', 'favicon-marconi.ico',
 'Create Desktop Shortcut.cmd'].forEach(function (f) {
  fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
});

/* The folder people actually download needs its own readme: the one in the
   repository is written for someone reading the source, not for someone who
   has just unzipped this. Plain .txt so it opens on a double-click. */
fs.copyFileSync(path.join(ROOT, 'tools', 'dist-readme.txt'), path.join(OUT, 'README.txt'));

const files = fs.readdirSync(OUT);
const total = files.reduce(function (n, f) { return n + fs.statSync(path.join(OUT, f)).size; }, 0);
console.log('dist/  ' + files.length + ' files, ' + (total / 1024).toFixed(0) + ' KB');
files.forEach(function (f) {
  console.log('  ' + f + '  ' + (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1) + ' KB');
});
console.log('index.html went from ' + (before / 1024).toFixed(1) + ' KB to ' +
  (fs.statSync(path.join(OUT, 'index.html')).size / 1024).toFixed(1) + ' KB with everything folded in');
