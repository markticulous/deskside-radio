/* Fold the app into one file for distribution.

   The source stays split — five modules and a stylesheet — because that is
   how it is worked on. What ships is index.html with all of it inlined, the
   eight theme icons, the shortcut helpers, the licence and the manual. The
   icons are the only thing that cannot be folded in, because Windows reads
   them off disk rather than out of the page.

     node tools/build-dist.js          → dist/ and the release zips

   The zip is built here rather than by hand at release time, because the
   hand-made one drifted: the archive published with 1.2.5 still carried
   the shortcut scripts under their old names and had never heard of the
   Edge, Firefox or Linux ones. A folder and an archive that can disagree
   will eventually disagree.

   The webfont link is left pointing at Google. Offline the app falls back
   to the stacks named beside each face, which is the same behaviour the
   split version has on a plane.

   Comments and indentation are taken out on the way in. The source keeps
   them -- they are the better half of it -- but they are read in the
   repository, not in a single 240 KB file that every launch parses. See
   tools/strip.js, which is deliberately not a minifier: nothing is
   renamed and nothing is rewritten, so what ships is still the same code,
   just without the margins. */
const fs = require('fs');
const path = require('path');
const strip = require('./strip.js');
const zip = require('./zip.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
// Everything the app needs and nobody double-clicks.
const ASSETS = 'assets';
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const bytes = (s) => Buffer.byteLength(s, 'utf8');
let saved = 0;

/* A closing tag inside a string would end the block early — app.js has none
   today, but a build that can be broken by a future string is not a build. */
function inlineSafe(js) { return js.replace(/<\/script/gi, '<\\/script'); }

function dataUri(file, type) {
  return 'data:' + type + ';base64,' + fs.readFileSync(path.join(ROOT, file)).toString('base64');
}

/* The one webfont that is not fetched from Google travels with the sheet,
   or the console theme would fall back to a typeface in the download and
   nowhere else. WOFF rather than the OTF it was made from: identical
   glyphs, a tenth of the bytes, and base64 charges a third on top of
   whatever it wraps. */
function styleSheet() {
  const url = 'url("fonts/VfdNova-Regular.woff")';
  const css = read('app.css');
  if (css.indexOf(url) === -1) throw new Error('app.css no longer loads the VFD face');
  const lean = strip.stripCss(css);
  saved += bytes(css) - bytes(lean);
  return lean.replace(url, 'url("' + dataUri('fonts/VfdNova-Regular.woff', 'font/woff') + '")');
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
  const code = read(src);
  const lean = strip.stripJs(code);
  saved += bytes(code) - bytes(lean);
  html = html.replace(tag, '<script>\n' + inlineSafe(lean) + '\n</script>');
});

/* The two small icons are carried in the page; the .ico is already beside
   it for the shortcut, so it stays a file. */
html = html.replace('href="icon-small.svg"', 'href="' + dataUri('icon-small.svg', 'image/svg+xml') + '"');
html = html.replace('href="icon-256.png"', 'href="' + dataUri('icon-256.png', 'image/png') + '"');

/* Anything still loaded from a second file has to be one we copy across.
   Only real tags count — app.js builds URLs in strings, and matching those
   made the build report itself. */
const loads = html.match(/<(?:script|link|img)\b[^>]*\b(?:src|href)="(?!https?:|data:)([^"]+)"/g) || [];
const outside = loads.filter(function (tag) { return tag.indexOf(ASSETS + '/favicon-dial.ico') === -1; });
if (outside.length) console.log('note: still loading from separate files:\n  ' + outside.join('\n  '));

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html, 'utf8');

/* What lands in the root of the download is exactly what somebody is
   meant to double-click, and nothing else. Anything the app needs but
   nobody opens goes in assets/ beside it.

   The reason is that this folder is the whole interface for half of what
   this project does. Someone who has just unzipped it is looking for the
   thing to run, and eight .ico files and a licence sitting in the same
   list as the scripts are eight wrong answers each. Sorted this way the
   root reads as a short menu. */
['Win - Create Desktop Shortcut (Chrome).cmd', 'Win - Start With Windows.cmd',
 /* What the Desktop shortcut and the Startup entry actually point at. It
    starts the browser and then takes the resize grip off the window, which
    is the one thing a page cannot do for itself. Without it in the folder
    the two scripts above fall back to aiming straight at the browser, so a
    missing copy costs the lock and nothing else. */
 'Win - Open Deskside Radio.cmd',
 /* And the four lines that start it without a console. A .cmd is run by
    cmd.exe and cmd.exe gets a console window, which Windows draws before
    a minimised shortcut can hide it -- the black rectangle that flashes
    at launch. Missing, the two scripts above fall back to the .cmd and
    the flash comes back; nothing else is lost. */
 'Win - Open Deskside Radio.vbs',
 /* The per-browser launchers, and Linux. Named for the platform they are
    for, because a folder of double-clickable scripts is the one place a
    filename has to say what it does before anyone opens it. */
 /* Turning the launcher's own updating off, and back on. It is a script
    rather than a switch in Settings because the app's settings live in the
    browser's storage, which a batch file cannot read. */
 'Win - Automatic Updates.cmd',
 'Win - Create Desktop Shortcut (Edge).cmd',
 'Win - Create Desktop Shortcut (Firefox).cmd',
 /* The installer ships inside the thing it installs, on purpose: once it
    has run once, a copy of it is always in the app folder and updating is
    double-clicking it. That is also why it needs no stored install path --
    it works out where it is and what that means. */
 'Win-Install-or-Update-Deskside-Radio.cmd',
 /* And the way back out, which ships for the same reason: the folder
    somebody wants to be rid of is the folder that knows how to remove
    itself, its shortcuts and nothing else. */
 'Win - Uninstall Deskside Radio.cmd',
 /* The one piece of this that is not double-clickable, and the only .ps1
    in the folder. The opener starts it; nobody runs it by hand.

    It sizes the floating mini radio, which is the one thing about that
    window a page is not allowed to do for itself: Chrome decides how big
    one of those opens and ignores what is asked for, and the page may
    only resize it while a user gesture is live -- the gesture that opened
    it having been spent opening it. Missing, the strip still works and
    still floats; it just opens at whatever size Chrome chose until it is
    clicked, which is what happens on macOS and Linux anyway. */
 'strip-fit.ps1',
 'Linux - Create Desktop Shortcut.sh'].forEach(function (f) {
  fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
});

/* The icons keep the path they have in the source tree, so the launchers
   name them the same way whether they are run from a clone or from a
   download -- there is one string, and it cannot drift. */
fs.mkdirSync(path.join(OUT, ASSETS), { recursive: true });
fs.readdirSync(path.join(ROOT, ASSETS))
  .filter(function (f) { return /\.(?:ico|ps1)$/i.test(f); })
  .forEach(function (f) {
    fs.copyFileSync(path.join(ROOT, ASSETS, f), path.join(OUT, ASSETS, f));
  });

/* The folder people actually download needs its own readme: the one in the
   repository is written for someone reading the source, not for someone who
   has just unzipped this.

   It is a page rather than plain text because nothing that ships with
   Windows, macOS or Linux renders Markdown -- a browser hands you a local
   .md as raw text in a <pre>, hashes and asterisks and all -- while every
   one of those machines has a browser, and this one is already a browser
   app. Double-clicking it opens something set to be read.

   It lives beside index.html rather than under tools/, because Settings
   looks for it in its own folder: a copy run straight from the repository
   has to find the same manual the download does, and one kept under tools/
   would leave that button opening raw Markdown. */
const manual = read('README.html').replace(
  /(<span class="ver" id="verChip">)v[0-9.]+(<\/span>)/,
  '$1v' + JSON.parse(read('version.json')).version + '$2');
fs.writeFileSync(path.join(OUT, 'README.html'), manual);

/* And the licence, which the MIT terms ask to travel with every copy. It
   used to be left behind in the repository, which was an oversight when
   the source carried its own header comment and is plainly one now that
   the build takes the comments out.

   In assets/ rather than the root: it has to be in the download and it is
   not a thing anyone opens to use the radio. It keeps its root place in
   the repository, where it is the file GitHub and every licence scanner
   goes looking for. */
fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(OUT, ASSETS, 'LICENSE.txt'));

/* The version, on one line, for the installer to read.

   It says which version it is about to write and which one it is
   replacing, and it has to learn both from files rather than from the
   network: the archive is already on the disk, and the folder being
   replaced is right there. version.json is not in the download -- the
   version the app shows is inlined into index.html, which is one
   240 KB line and no way to read a number out of from a batch file.

   So: one line, no punctuation, read with `set /p`. No JSON parser, no
   PowerShell, nothing to quote. The release notes stay out of it; the
   installer wants the number and nothing else. */
fs.writeFileSync(path.join(OUT, ASSETS, 'version.txt'),
  JSON.parse(read('version.json')).version + '\r\n');

/* The same number again, as a line of JavaScript, for the page rather than
   for the batch file.

   A page opened from a disk cannot fetch and cannot read a file -- but it
   CAN load a script, which is how the settings seed beside index.html is
   read. So this is the one channel the app has for finding out what is on
   disk NOW, as opposed to what was on disk when it loaded. The difference
   matters exactly once: the launcher has fetched a new version in the
   background while the radio played, and the notice can then say that the
   update is already here and one relaunch away, instead of guessing.

   Measured rather than assumed: a second read comes back with the new
   contents, and file:// does not even serve it from cache. The query
   string on the request is belt and braces. */
/* assets/shortcut.js is deliberately NOT written here.

   It says whether a Desktop shortcut exists, and only the launcher can
   know that. Shipping a starting answer looked harmless -- false means
   show the button, which is right for a folder just unzipped -- but tar
   replaces the files it carries, so every update overwrote a true with a
   false and the button came back on a machine that had a shortcut all
   along. Leaving the file out of the archive means an update does not
   touch it, and the only thing that ever writes it is the thing that
   checked. Absent is already the right default: the page shows the button
   when it cannot find out. */

fs.writeFileSync(path.join(OUT, ASSETS, 'version.js'),
  '/* Written by the build. What is on disk, which is not always what is\r\n'
  + '   running: the launcher replaces these files underneath a window that\r\n'
  + '   is already open. */\r\n'
  + 'window.DESKSIDE_ON_DISK = ' + JSON.stringify(JSON.parse(read('version.json')).version) + ';\r\n');

/* Forward slashes, because these names become zip entry names and that is
   what the format uses on every platform. */
function walk(dir, prefix) {
  return fs.readdirSync(path.join(OUT, dir || '.')).sort().reduce(function (all, f) {
    const rel = prefix ? prefix + '/' + f : f;
    return all.concat(fs.statSync(path.join(OUT, rel)).isDirectory() ? walk(rel, rel) : [rel]);
  }, []);
}
const files = walk('', '');
const total = files.reduce(function (n, f) { return n + fs.statSync(path.join(OUT, f)).size; }, 0);
console.log('dist/  ' + files.length + ' files, ' + (total / 1024).toFixed(0) + ' KB');
files.forEach(function (f) {
  console.log('  ' + f + '  ' + (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1) + ' KB');
});

/* ---------- the archive that actually gets downloaded ----------------

   Entries sit at the root of the zip with no folder around them, which is
   what the earlier releases did: every unzipper worth the name makes a
   folder for a multi-file archive anyway, and changing it would move where
   the app lands for anyone who already knows where to put it.

   Stamped from the release date rather than the clock, so building twice
   from the same source gives the same bytes. */
const meta = JSON.parse(read('version.json'));
const stamp = new Date(meta.released + 'T12:00:00');

const entries = files.map(function (f) {
  return {
    name: f,
    data: fs.readFileSync(path.join(OUT, f)),
    // The Linux script arrives ready to run instead of needing a chmod.
    mode: /\.sh$/.test(f) ? 0o100755 : 0o100644
  };
});

const archive = zip(entries, stamp);
/* Two names, one archive: the versioned one is what the release page
   lists, and the bare one is a link that can be printed somewhere and go
   on working after the next release. */
[ 'deskside-radio-' + meta.version + '.zip', 'deskside-radio.zip' ].forEach(function (name) {
  fs.writeFileSync(path.join(ROOT, name), archive);
});
console.log('\ndeskside-radio-' + meta.version + '.zip  ' + (archive.length / 1024).toFixed(0) +
  ' KB, ' + entries.length + ' entries (and a copy as deskside-radio.zip)');
console.log('index.html went from ' + (before / 1024).toFixed(1) + ' KB to ' +
  (fs.statSync(path.join(OUT, 'index.html')).size / 1024).toFixed(1) + ' KB with everything folded in');
console.log('  (' + (saved / 1024).toFixed(1) + ' KB of comments and indentation left behind)');
