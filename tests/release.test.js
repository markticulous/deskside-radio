/* Guards on the two files that are edited by hand and break quietly:
   the version the app reports, and the launcher script's quoting. Neither
   is reachable from a unit test of the modules, so they are read as text. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('every place a person writes the version agrees with every other', () => {
  /* Four files, and each one has been wrong on its own at some point.
     index.html carried v1.0.0 through nine releases and then v1.4.7
     through six more -- it is overwritten from APP_VERSION a moment after
     boot, so the stale number is only on screen for an instant and nobody
     ever caught it by looking.

     The list is read out of tools/cut.js rather than written again here.
     That script is what sets them all at a cut, so a fifth place added
     there is checked here automatically, and a fifth place added ONLY here
     would be a place the cut never sets -- which is the drift this is
     supposed to stop. */
  const cut = read('tools/cut.js');
  const block = /const SOURCES = \[([\s\S]*?)\n\];/.exec(cut);
  assert.ok(block, 'tools/cut.js no longer lists where the version lives');

  const places = [];
  block[1].replace(/\{\s*file:\s*'([^']+)',\s*re:\s*\/(.+?)\/,\s*what:\s*'([^']+)'\s*\}/g,
    function (_, file, re, what) { places.push({ file: file, re: re, what: what }); return _; });

  assert.ok(places.length >= 4,
    'only ' + places.length + ' places are listed in tools/cut.js; there are at least four');

  const seen = places.map(function (p) {
    const src = read(p.file);
    const m = new RegExp(p.re).exec(src);
    assert.ok(m, p.file + ' has no ' + p.what + ' for the cut script to set');
    return { file: p.file, what: p.what, version: m[1] };
  });

  const want = seen[0].version;
  seen.forEach(function (s) {
    assert.equal(s.version, want,
      s.file + ' says ' + s.version + ' but ' + seen[0].file + ' says ' + want +
      ' (' + s.what + ') — run: node tools/cut.js ' + want);
  });

  /* And the one that actually matters at runtime, said plainly: every
     running copy compares itself against version.json, so a mismatch there
     either hides a release or claims one that does not exist. */
  assert.equal(JSON.parse(read('version.json')).version, want, 'version.json disagrees');
});

test('the launcher passes every flag the zero-click start depends on', () => {
  const cmd = read('Win - Create Desktop Shortcut (Chrome).cmd');
  [
    '--app=',                                  // its own window, no browser furniture
    '--autoplay-policy=no-user-gesture-required',
    '--user-data-dir='                         // without this the flags are dropped
  ].forEach(function (flag) {
    assert.ok(cmd.indexOf(flag) !== -1, 'launcher no longer passes ' + flag);
  });
});

test('the settings sanitisers are defined above the first thing that uses them', () => {
  /* var hoists the name and not the value. CAP sitting below `var state =
     load()` made every stored setting unreadable at boot: cleanStation
     threw on an undefined CAP, normalise caught it and returned the
     defaults, and the real settings were then written over on unload.
     Nothing about that is visible in a diff, so it is pinned here. */
  const src = read('app.js');
  const cap = src.indexOf('var CAP = {');
  const load = src.indexOf('var state = load();');
  assert.ok(cap !== -1 && load !== -1, 'expected both declarations');
  assert.ok(cap < load,
    'var CAP is declared after the load() that needs it, so stored settings are dropped at boot');
});

test('the silence detector is declared above the transport that clears it', () => {
  /* The same trap as CAP above: setStatus clears the silence state, var
     hoists the name and not the value, and setStatus is defined a long
     way above where these used to sit. Nothing about that is visible in a
     diff, and the failure -- a status line that keeps saying there is no
     audio after the station has changed -- would look like anything. */
  const src = read('app.js');
  const decl = src.indexOf('var silentSince = 0');
  const paint = src.indexOf('function paintSilence');
  const setStatus = src.indexOf('function setStatus');
  assert.ok(decl !== -1 && paint !== -1 && setStatus !== -1, 'expected all three');
  assert.ok(decl < setStatus, 'silentSince is declared below the setStatus that clears it');
  assert.ok(paint < setStatus, 'paintSilence is declared below the setStatus beside it');
});

test('the silent-stream ladder climbs and then stops', () => {
  /* Four rungs and no fifth. A ladder that looped would re-tune a station
     that is simply off the air, every couple of minutes, all night -- and
     each attempt is a real interruption for anybody listening to the next
     station along when it comes back. The waits are quoted from the notice
     appearing, which is itself five seconds into the silence, so they read
     five short of the 10/30/90/120 they produce. */
  const src = read('app.js');
  const ladder = /var SILENT_RETRY = \[([^\]]+)\]/.exec(src);
  assert.ok(ladder, 'SILENT_RETRY is gone');
  const rungs = ladder[1].split(',').map(function (n) { return parseInt(n.trim(), 10); });
  assert.deepEqual(rungs.map(function (ms) { return (ms + 5000) / 1000; }), [10, 30, 90, 120],
    'the ladder no longer fires at 10, 30, 90 and 120 seconds of silence');
  assert.ok(/silentTries >= SILENT_RETRY\.length/.test(src),
    'nothing stops the ladder once it runs out of rungs');
  /* And it climbs: without this the first rung would be retried forever. */
  assert.ok(/silentTries\+\+/.test(src), 'the ladder never advances');
});

test('the slot list is only re-ordered when it is out of order', () => {
  /* appendChild on a node that is already in the document MOVES it: the
     browser detaches the subtree and reattaches it. Doing that between a
     mousedown and its mouseup throws the click away -- both land on the
     same element, at the same place, and no click is ever dispatched.

     reflowSlots runs off the card's focusout, on a setTimeout(0), and a
     mousedown is what causes that focusout. So pressing a switch in a slot
     re-inserted every card mid-press and the press threw away its own
     click: the switch needed two goes, every time, and only in the slots.
     Nothing about that is visible in a diff, which is why it is here. */
  const src = read('app.js');
  const at = src.indexOf('function reflowSlots');
  assert.ok(at !== -1, 'reflowSlots is gone');
  const fn = src.slice(at, at + 2600);
  assert.equal(/box\.appendChild\(card\)/.test(fn), false,
    'reflowSlots moves every card again, which cancels any click in progress inside one');
  assert.ok(/if \(card !== shouldFollow\) box\.insertBefore\(card, shouldFollow\)/.test(fn),
    'reflowSlots no longer checks whether a card is already in the right place');
});

test('the settings seed is one filename, spelled the same everywhere', () => {
  /* Six files name this thing: the export writes it, the loader reads it,
     four launcher scripts tell people where to put it, and both readmes
     explain it. It was .json until the launcher stopped being handed the
     run of the disk -- a script tag is the only way a file:// page can read
     a file off disk, so the export had to become .js -- and .gitignore was
     left naming the old one. The result was that the file the app actually
     writes was not ignored, and a seed dropped beside index.html to test
     with was staged with everything else. Committed, it would have seeded
     every clone with one machine's stations. */
  const SEED = 'deskside-radio-settings.js';
  const app = read('app.js');
  assert.ok(app.indexOf("a.download = '" + SEED + "'") !== -1,
    'the export no longer writes ' + SEED);
  assert.ok(app.indexOf("tag.src = '" + SEED + "'") !== -1,
    'the seed loader no longer reads ' + SEED);

  /* Nothing anywhere may name the old one. */
  ['.gitignore', 'app.js', 'index.html', 'README.md', 'User Reference Guide.html'].forEach(function (f) {
    assert.equal(read(f).indexOf('deskside-radio-settings.json'), -1,
      f + ' still names deskside-radio-settings.json, which nothing writes any more');
  });

  /* And the one file the app writes has to be ignored, or the next person
     who drops one in to test has it staged for them. */
  assert.ok(read('.gitignore').indexOf(SEED) !== -1, SEED + ' is not ignored');

  /* Every script that tells somebody where to put it says the same name. */
  fs.readdirSync(ROOT)
    .filter(function (f) { return /\.(cmd|sh)$/i.test(f); })
    .forEach(function (f) {
      const src = read(f);
      if (src.indexOf('deskside-radio-settings') === -1) return;
      assert.equal(src.indexOf('deskside-radio-settings.json'), -1,
        f + ' points people at the old .json name');
      assert.ok(src.indexOf(SEED) !== -1, f + ' names the seed as something other than ' + SEED);
    });
});

test('every Windows script is named for Windows, and every Linux one for Linux', () => {
  /* A folder of double-clickable scripts is the one place a filename has
     to say what it is for before anyone opens it -- there is no other
     signal, and running the wrong one does nothing useful.

     "Win - " or "Win-", because the installer is the one script that is
     also published on its own as a release asset, and GitHub replaces
     every space in an asset filename with a dot: it was being listed as
     Win.-.Install.or.Update.Deskside.Radio.cmd, which is not a name
     anybody can read or type. Hyphens survive the trip unchanged. The
     rest keep their spaces; they only ever arrive inside the zip, where
     nothing rewrites them. */
  fs.readdirSync(ROOT).forEach(function (f) {
    if (/\.cmd$/i.test(f)) {
      assert.ok(/^Win( - |-)/.test(f), f + ' is a .cmd and should start with "Win - " or "Win-"');
    }
    if (/\.sh$/i.test(f)) {
      assert.ok(f.indexOf('Linux - ') === 0, f + ' is a .sh and should start with "Linux - "');
    }
  });
});

test('the release asset name survives GitHub without being rewritten', () => {
  /* The installer is downloaded on its own, so its filename is the one
     the reader is told to look for. A space in it comes back as a dot and
     the readmes then name a file nobody can see. */
  assert.equal(/[ ]/.test(INSTALLER), false,
    INSTALLER + ' has a space in it, which GitHub turns into a dot on the release page');
  assert.ok(fs.existsSync(path.join(ROOT, INSTALLER)), INSTALLER + ' is not there');
});

test('the build ships every launcher that is in the repository', () => {
  /* Adding a script and forgetting to add it to the copy list means it is
     in the source and missing from the download, which nobody notices
     until someone unzips it looking for the one they read about. */
  const build = read('tools/build-dist.js');
  fs.readdirSync(ROOT)
    .filter(function (f) { return /\.(cmd|sh)$/i.test(f); })
    .forEach(function (f) {
      assert.ok(build.indexOf(f) !== -1, f + ' is never copied into dist/ by build-dist.js');
    });
});

test('the launcher grants no file access, in either script', () => {
  /* This flag used to be passed so that the settings seed could be read
     off disk. It is not a permission to read one file: it lets every
     script on the page read anything the user can, for as long as the
     shortcut exists. The seed is a script tag now and needs no flag, so
     the only thing left to do about it is make sure it stays gone. */
  ['Win - Create Desktop Shortcut (Chrome).cmd', 'Win - Start with Windows (On-Off).cmd'].forEach(function (f) {
    assert.equal(read(f).indexOf('--allow-file-access-from-files'), -1,
      f + ' passes --allow-file-access-from-files again');
  });
});

test('both launchers name powershell and reg by their full paths', () => {
  /* A double-clicked .cmd runs with the app folder as its current
     directory, and a default Windows looks there before it looks along
     PATH. A bare `powershell` is therefore whatever sits next to the
     script, which on a shared or synced folder is not necessarily ours. */
  ['Win - Create Desktop Shortcut (Chrome).cmd', 'Win - Start with Windows (On-Off).cmd'].forEach(function (f) {
    const cmd = read(f);
    assert.ok(/%SystemRoot%\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe/.test(cmd),
      f + ' no longer calls powershell by its full path');
    assert.equal(/(^|[^\\])\breg query/.test(cmd), false, f + ' calls reg by a bare name');
    assert.ok(cmd.indexOf('%SystemRoot%\\System32\\reg.exe query') !== -1,
      f + ' no longer calls reg by its full path');
  });
});

test('the launcher builds its quotes with [char]34, never a literal one', () => {
  /* cmd holds each PowerShell line inside "..." — a literal double quote in
     the body ends that string early and the shortcut comes out malformed. */
  const powershell = read('Win - Create Desktop Shortcut (Chrome).cmd')
    .split('\n')
    .filter(function (ln) { return /^\s{2}"/.test(ln); });
  assert.ok(powershell.length > 5, 'expected the inline PowerShell block');
  powershell.forEach(function (ln) {
    const body = ln.trim().replace(/^"/, '').replace(/"\s*\^?$/, '');
    assert.equal(body.indexOf('"'), -1, 'literal quote inside a -Command line: ' + ln.trim());
  });
  assert.ok(powershell.join('').indexOf('[char]34') !== -1,
    'the argument string should quote with [char]34');
});

/* ---- the installer ----
   It runs on a machine we will never see, from a folder we do not choose,
   against a URL that has to keep working for every release after this one.
   None of that is reachable from a unit test, so it is read as text. */
const INSTALLER = 'Win-Install-or-Update-Deskside-Radio.cmd';

test('the installer names every tool it runs by its full path', () => {
  /* It is double-clicked from Downloads, so its current directory is the
     one folder on the machine that is full of files nobody vetted -- and
     cmd looks there before it looks along PATH. A bare curl is whatever
     someone was sent last week. Kept apart from the launcher's own test
     because that one also asserts reg.exe, which this never calls. */
  const cmd = read(INSTALLER);
  ['curl.exe', 'tar.exe', 'findstr.exe'].forEach(function (exe) {
    assert.ok(cmd.indexOf('%SystemRoot%\\System32\\' + exe) !== -1,
      INSTALLER + ' no longer calls ' + exe + ' by its full path');
  });
  assert.ok(/%SystemRoot%\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe/.test(cmd),
    INSTALLER + ' no longer calls powershell by its full path');
});

test('the installer downloads the release that is current, not one release', () => {
  /* latest/download is what makes this file work forever. Pinned to a
     version it would install that version for the rest of time, and every
     copy already sitting in an app folder would stop updating -- silently,
     because it would still succeed. */
  const cmd = read(INSTALLER);
  assert.ok(cmd.indexOf('releases/latest/download/deskside-radio.zip') !== -1,
    INSTALLER + ' no longer points at releases/latest/download');
  assert.equal(/releases\/download\/v[0-9]/.test(cmd), false,
    INSTALLER + ' points at a versioned release asset, which freezes every future update');
});

test('the installer makes the shortcut by calling the script that owns it', () => {
  /* Reimplementing the .lnk block would give the WScript.Shell call, the
     [char]34 quoting and the browser detection a second copy to drift from.
     The dependency is satisfied by construction: the installer extracts
     that script before it calls it. */
  const cmd = read(INSTALLER);
  const owner = 'Win - Create Desktop Shortcut (Chrome).cmd';
  assert.ok(cmd.indexOf(owner) !== -1, INSTALLER + ' no longer calls ' + owner);
  assert.ok(fs.existsSync(path.join(ROOT, owner)), owner + ' is gone, and the installer calls it');
  /* It has to run straight through when the installer calls it, or the
     install stops on a "Press any key" nobody is watching for. The flag
     now also skips the script's own introduction, which the installer
     says better in one line -- but the part that matters here is that it
     reaches the end without pausing. */
  const ownerSrc = read(owner);
  assert.ok(ownerSrc.indexOf('if defined DESKSIDE_NOPAUSE goto :quietend') !== -1,
    owner + ' no longer honours DESKSIDE_NOPAUSE, so the installer will stop halfway and wait');
  assert.ok(ownerSrc.search(/^:quietend$/m) > ownerSrc.search(/^pause$/m),
    owner + ' rejoins before its pause, so DESKSIDE_NOPAUSE no longer skips it');
});

test('the installer never deletes the folder it installs into', () => {
  /* It extracts over the top instead. tar replaces the files it carries and
     leaves the rest, which is the whole reason a settings seed sitting
     beside index.html survives an update without being saved and restored.
     A wipe would also turn a failed extraction into an empty app folder. */
  const cmd = read(INSTALLER);
  [/\brd\s+\/s/i, /\brmdir\s+\/s/i].forEach(function (re) {
    assert.equal(re.test(cmd), false,
      INSTALLER + ' deletes a directory tree; it is meant to extract over the top');
  });

  /* Remove-Item -Recurse is allowed on exactly one kind of thing: a
     registry key, which cannot be removed any other way once it has a
     subkey under it -- a protocol handler is a key with shell\open\command
     inside it. Every such line has to say HKCU on the face of it, so a
     folder delete can never arrive wearing the exemption. */
  const lines = cmd.split('\n');
  lines.forEach(function (ln, i) {
    if (!/Remove-Item[^\n]*-Recurse/i.test(ln)) return;
    const near = lines.slice(Math.max(0, i - 10), i + 1).join('\n');
    assert.ok(/HKCU:/.test(near),
      INSTALLER + ' removes a tree that is not a registry key: ' + ln.trim());
    assert.equal(/APPDIR|APPROOT|TARGET|%TEMP%/.test(ln), false,
      INSTALLER + ' recursively removes something built from a folder path: ' + ln.trim());
  });
});

test('the installer builds its quotes with [char]34 too, never a literal one', () => {
  const powershell = read(INSTALLER)
    .split('\n')
    .filter(function (ln) { return /^\s{4}"/.test(ln); });
  assert.ok(powershell.length > 3, 'expected the inline PowerShell block');
  powershell.forEach(function (ln) {
    const body = ln.trim().replace(/^"/, '').replace(/"\s*\^?$/, '');
    assert.equal(body.indexOf('"'), -1, 'literal quote inside a -Command line: ' + ln.trim());
  });
});

/* ---- the uninstaller ----
   It deletes things, which nothing else here does, and it deletes them on
   a machine we will never see. */
const UNINSTALLER = 'Win - Uninstall Deskside Radio.cmd';

test('the uninstaller refuses to run in the source tree', () => {
  /* Every other guard in this file protects a download. This one protects
     the repository: the uninstaller removes the folder it decides it is
     in, and without this line, double-clicking the copy sitting at the
     root would take the source with it. app.css is the discriminator
     because the build inlines it away, so it exists here and nowhere in
     a download. */
  const cmd = read(UNINSTALLER);
  assert.ok(cmd.indexOf('if exist "%~dp0app.css" goto :repo') !== -1,
    UNINSTALLER + ' no longer refuses to run in the source folder');
  const guard = cmd.indexOf('%~dp0app.css');
  const first = cmd.search(/rd\s+\/s/i);
  assert.ok(first === -1 || guard < first,
    UNINSTALLER + ' deletes something before it has checked it is not in the source tree');
});

test('the uninstaller keeps the settings unless it is told twice', () => {
  /* The app folder is replaceable and the profile is not -- it holds every
     station, the schedule and the settings, and no reinstall brings it
     back. So it is a second question with its own answer, and the answer
     that does nothing is the one you get by pressing Enter. */
  const cmd = read(UNINSTALLER);
  assert.ok(cmd.indexOf('DesksideRadio\\profile') !== -1,
    UNINSTALLER + ' no longer knows where the settings live');
  assert.ok(/if \/i not "%WIPE%"=="D"/.test(cmd),
    UNINSTALLER + ' no longer asks separately before deleting the profile');
});

test('the uninstaller finds shortcuts by target as well as by name', () => {
  /* A list of four filenames was the first version of this, and it misses
     any shortcut somebody renamed and every shortcut a later launcher
     adds. Both halves have to stay. */
  const cmd = read(UNINSTALLER);
  assert.ok(cmd.indexOf("'Deskside Radio*.lnk'") !== -1,
    UNINSTALLER + ' no longer matches shortcuts by name');
  assert.ok(cmd.indexOf('$s.TargetPath') !== -1 && cmd.indexOf('$s.Arguments') !== -1,
    UNINSTALLER + ' no longer matches shortcuts by where they point');
  ["GetFolderPath('Desktop')", 'Startup', 'Start Menu'].forEach(function (place) {
    assert.ok(cmd.indexOf(place) !== -1, UNINSTALLER + ' no longer looks in ' + place);
  });
});

test('every script announces itself in capitals before it does anything', () => {
  /* These are double-clicked or run blind, and a console that opens
     straight into its own output leaves you reading it to work out what
     you started. The banner is the first thing printed, so it sits above
     whatever follows.

     Both families, because the promise is about what a console looks like
     and not about which shell drew it. The two quote their arguments
     differently -- `echo   TEXT` in cmd, `echo "  TEXT"` in bash -- so the
     optional quote is the only thing the pattern has to allow for. */
  fs.readdirSync(ROOT)
    .filter(function (f) { return /\.(cmd|sh)$/i.test(f); })
    /* One exemption, and it earns it by never being seen. The opener is
       what the Desktop shortcut and the Startup entry point at, so it runs
       on every launch of the radio and nobody ever double-clicks it. Its
       console is minimised and it exits in under a second; a banner there
       would be a greeting printed into a window put up to be ignored, on
       the one path where the promise this test protects does not apply. */
    .filter(function (f) { return f !== 'Win - Open Deskside Radio.cmd'; })
    .forEach(function (f) {
      const src = read(f);
      const banner = /^[ \t]*echo +"? *(DESKSIDE RADIO[^"\r\n]*?) *"?[ \t]*$/m.exec(src);
      assert.ok(banner, f + ' prints no DESKSIDE RADIO banner');
      assert.equal(banner[1], banner[1].toUpperCase(),
        f + ' banner is not in capitals: ' + banner[1]);
      /* And ahead of every other line of output. A heading printed under
         the first three things the script said is not a heading. The blank
         line is `echo.` in cmd and a bare `echo` in bash; neither is
         output, so neither counts. */
      const firstEcho = src.search(/^[ \t]*echo +[^.\r\n]/m);
      assert.ok(firstEcho === -1 || src.indexOf(banner[0]) <= firstEcho,
        f + ' prints something before its banner');
    });
});

test('the download puts only double-clickable things in its root', () => {
  /* The unzipped folder is the whole interface for half of what this
     project does, and somebody who has just opened it is looking for the
     thing to run. Eight icons and a licence in that same list are nine
     wrong answers. So: scripts, the app and its manual in the root,
     everything else in assets/.

     Asserted against build-dist.js rather than against dist/, which is not
     in the repository and may not have been built. */
  const build = read('tools/build-dist.js');
  assert.ok(/const ASSETS = 'assets';/.test(build),
    'build-dist.js no longer has a name for the folder the support files go in');
  assert.ok(/path\.join\(OUT, ASSETS, 'LICENSE\.txt'\)/.test(build),
    'the licence is being written to the root of the download again');
  assert.ok(build.indexOf("path.join(OUT, ASSETS, f)") !== -1,
    'the icons are being written to the root of the download again');
  /* The copy list is the root of the download, so nothing in it may be an
     icon or a licence. */
  const list = /\['Win - Create Desktop Shortcut \(Chrome\)[\s\S]*?\]\.forEach/.exec(build);
  assert.ok(list, 'the root copy list has moved or been renamed');
  assert.equal(/favicon|LICENSE/i.test(list[0]), false,
    'a support file is back in the list of things copied to the root');
});

test('every script looks for the icons where they actually are', () => {
  /* The icons sit in assets/ in the source tree as well as in the
     download, so one path string serves both and a launcher run from a
     clone finds the same file the download does. A script still naming
     them in the root would write a shortcut with no icon -- which is not
     an error, just a blank square nobody connects to this. */
  fs.readdirSync(ROOT)
    .filter(function (f) { return /\.(cmd|sh)$/i.test(f); })
    .forEach(function (f) {
      read(f).split('\n').forEach(function (line) {
        if (line.indexOf('favicon-') === -1) return;
        /* The installer is the one file allowed to name the old root
           location, because clearing what an earlier version left there is
           the whole point of those two lines. They are recognised by the
           del that does it, and pinned by the test below so they cannot
           quietly turn into something else. */
        if (/\bdel\b|if exist "%APPDIR%favicon-dial\.ico"/.test(line)) return;
        (line.match(/.{0,8}favicon-/g) || []).forEach(function (m) {
          assert.ok(/assets[\\/]favicon-$/.test(m),
            f + ' names an icon without assets/ in front of it: ' + JSON.stringify(m.trim()));
        });
      });
    });
  ['index.html', 'User Reference Guide.html'].forEach(function (f) {
    assert.equal(/href="favicon-/.test(read(f)), false,
      f + ' loads an icon from the root, where there is no longer one');
  });
});

test('updating an older install clears the icons it left in the root', () => {
  /* Unpacking writes over the top and removes nothing, so a folder
     installed while the icons lived in the root would end up carrying both
     sets -- the old ones unreferenced, and sitting in the one list this
     change exists to shorten. Guarded on both sides: it only fires once
     the new set is confirmed present, and it names files rather than a
     tree, which the test above this one also insists on. */
  const cmd = read(INSTALLER);
  assert.ok(cmd.indexOf('if exist "%APPDIR%assets\\favicon-dial.ico" if exist "%APPDIR%favicon-dial.ico"') !== -1,
    INSTALLER + ' no longer checks both layouts before clearing the old icons');
  assert.ok(/del \/q "%APPDIR%favicon-\*\.ico"/.test(cmd),
    INSTALLER + ' no longer clears the icons an older version left in the root');
});

test('the launcher still falls back when no browser is found', () => {
  const cmd = read('Win - Create Desktop Shortcut (Chrome).cmd');
  assert.ok(/if \(\$env:BROWSER\)/.test(cmd), 'no branch on a missing browser');
  assert.ok(/\$link\.TargetPath = \$env:TARGET;/.test(cmd),
    'the fallback should still point the shortcut at index.html');
});

test('a hidden attribute on a .ghost button actually hides it', () => {
  /* `.ghost { display: inline-block }` is a class selector, and the rule
     that makes `hidden` work lives in the browser's own stylesheet, which
     every author rule outranks. So `hidden` on a .ghost did nothing at
     all: Open app folder, which is supposed to appear only while Shift is
     held, shipped permanently visible in 1.4.4 beside Reset to defaults --
     which is the pairing the Shift gate exists to avoid. The pill needed
     the identical line for the identical reason, so this guards both. */
  const css = read('app.css');
  assert.ok(/\.ghost\[hidden\][^{]*\{[^}]*display:\s*none/.test(css),
    'a .ghost with the hidden attribute is still drawn');
  assert.ok(/\.update-pill\[hidden\]\s*\{[^}]*display:\s*none/.test(css),
    'a hidden update pill is still drawn');
  /* Named rather than found, because this one is never written in the
     markup: the shortcut button is hidden from script, after the launcher
     reports that a Desktop shortcut already exists, so the scan below --
     which reads the HTML for a hidden attribute -- cannot see it coming. */
  assert.ok(/\.icon-btn\[hidden\]\s*\{[^}]*display:\s*none/.test(css),
    'a hidden .icon-btn is still drawn, so the shortcut button never goes away');

  /* Anything else that sets display and is ever given `hidden` in the
     markup needs its own line, so the markup is what decides. */
  const html = read('index.html');
  const hiddenIds = [];
  html.replace(/<[^>]*\bhidden\b[^>]*>/g, function (tag) {
    const id = /id="([^"]+)"/.exec(tag);
    const cls = /class="([^"]+)"/.exec(tag);
    if (id && cls) hiddenIds.push([id[1], cls[1]]);
    return tag;
  });
  hiddenIds.forEach(function (pair) {
    const classes = pair[1].split(/\s+/);
    classes.forEach(function (c) {
      /* Does a bare class rule give it a display at all? */
      const sets = new RegExp('(^|[,\\s])\\.' + c + '\\s*(,[^{]*)?\\{[^}]*display:', 'm').test(css);
      if (!sets) return;
      const guarded = new RegExp('\\.' + c + '\\[hidden\\]').test(css)
        || new RegExp('#' + pair[0] + '\\[hidden\\]').test(css);
      assert.ok(guarded,
        '#' + pair[0] + ' carries hidden but .' + c + ' sets display with no [hidden] rule to beat it');
    });
  });
});

test('a launch asks about the version instead of trusting a stale answer', () => {
  /* The six-hour gate was applied to the launch check too, so a machine
     that had asked that morning -- when the running version was the newest
     one -- went on saying "Up to date" for the rest of the day, through
     any number of relaunches. Opening the radio is the one moment the
     answer is wanted, so a launch uses a floor of its own.

     And there was no repeat at all: a radio left open for a week checked
     once, at launch. "Every six hours", which both readmes and the Service
     pane promise, was only ever a rate limit on relaunching. */
  const app = read('app.js');
  assert.ok(/var BOOT_FLOOR = 10 \* 60 \* 1000;/.test(app),
    'the launch check no longer has a floor of its own');
  assert.ok(/checkVersion\(false, BOOT_FLOOR\)/.test(app),
    'the launch check is back to waiting out the full six hours');
  assert.ok(/setInterval\(function \(\) \{ checkVersion\(false\); \}, CHECK_EVERY\);/.test(app),
    'nothing re-checks while the radio is left open, so "every six hours" is not true');
  assert.ok(/function checkVersion\(force, floor\)/.test(app),
    'checkVersion no longer takes a floor');

  /* Check now must still ignore every floor. */
  assert.ok(/checkNow'\)\.addEventListener\('click', function \(\) \{ checkVersion\(true\); \}\)/.test(app),
    'Check now no longer forces');
});

test('the pill fades in, and the dot still snaps', () => {
  /* These were tied together at sixty milliseconds each, opposite
     directions and opposite easings. The tie was wrong. Sixty milliseconds
     is a snap, which is exactly right for a blink -- the snap is the part
     the eye catches -- and wrong for an arrival, where nothing is seen to
     happen at all. The pill's fade was asked for twice for that reason.

     An animation rather than a transition, because the pill comes out of
     display: none and no transition can start from there. */
  const css = read('app.css');
  assert.ok(/@keyframes update-pill-in/.test(css), 'the pill appears with no fade');

  const m = css.match(/\.update-pill \{ animation: update-pill-in ([\d.]+)s ease-out; \}/);
  assert.ok(m, 'the pill fade is gone, or no longer an ease-out animation');
  const ms = Math.round(parseFloat(m[1]) * 1000);
  assert.ok(ms >= 150, 'the pill fade is ' + ms + 'ms, which is back to being too quick to see');
  assert.ok(ms <= 400, 'the pill fade is ' + ms + 'ms, which is long enough to be in the way');

  /* The dot is untouched by that: it still goes out in three per cent of a
     two-second cycle. */
  assert.ok(/74%\s*\{ opacity: 1; animation-timing-function: ease-in; \}\s*\n\s*77%\s*\{ opacity: 0; \}/.test(css),
    'the dot no longer snaps off over 60ms');

  /* Neither animation runs where the machine has asked for stillness. */
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)', css.indexOf('update-dot-blink')));
  assert.ok(/\.update-dot \{ animation: none/.test(reduced) && /\.update-pill[^{]*\{ animation: none/.test(reduced),
    'reduced motion no longer holds the dot and the pill still');

  /* And the pill is seen going, not gone. It used to be set hidden on the
     press, which is display: none in the same frame -- a control that
     vanishes under the finger reads as a misclick. Quicker than the
     arrival, because going is not news. */
  const out = css.match(/\.update-pill\.is-going \{ animation: update-pill-out ([\d.]+)s ease-in forwards; \}/);
  assert.ok(out, 'the pill is dismissed with no fade at all');
  const outMs = Math.round(parseFloat(out[1]) * 1000);
  assert.equal(outMs, 90, 'the dismiss fade is ' + outMs + 'ms rather than 90');
  assert.ok(outMs < ms, 'the pill now takes longer to go than to arrive');

  /* The setting is written before the animation, so a dismissal cannot be
     lost to a timer that never fires. */
  const js = read('app.js');
  const close = js.slice(js.indexOf("updatePillClose"), js.indexOf("updatePillClose") + 900);
  assert.ok(close.indexOf('state.versionPillOff = true;') < close.indexOf('is-going'),
    'the pill is faded before the dismissal is recorded, so a lost timer would lose the press');
  assert.ok(/PILL_OUT_MS/.test(js), 'the dismiss delay is no longer tied to one number');
});

/* One alert colour for the whole app, and brighter than the orange the
   rest of it uses: this mark is 5px across and has to carry against eight
   grounds, walnut through near-black. */
test('the alert mark is one colour, and a bright one', () => {
  const css = read('app.css');
  const m = css.match(/:root \{ --alert: (#[0-9a-f]{6}); \}/i);
  assert.ok(m, 'the alert colour is no longer a token on :root');
  const hex = m[1].toLowerCase();

  const rgb = [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); });
  /* Brighter than the app's ordinary orange, which is what it was cut from
     and what it kept being mistaken for. */
  assert.ok(rgb[0] >= 250, 'the alert orange has gone dull again (' + hex + ')');
  assert.ok(rgb[1] > rgb[2], 'the alert colour is no longer an orange (' + hex + ')');

  /* The fallbacks stand in for the token where it is not inherited, so
     they have to be the same colour, not the old one. */
  const fallbacks = css.match(/var\(--alert, (#[0-9a-f]{6})\)/gi) || [];
  assert.ok(fallbacks.length >= 2, 'the alert fallbacks are gone');
  fallbacks.forEach(function (f) {
    assert.ok(f.toLowerCase().indexOf(hex) !== -1,
      'an alert fallback still carries the old colour: ' + f);
  });

  /* One colour, in both places, on every theme, always. The mark used to
     be cut from each cabinet's own byline -- brass on the dial, lime on
     the board, phosphor amber on the console -- which gave one piece of
     news eight faces, each in a colour that theme already uses for
     something ordinary. The way that cannot come back is for --alert to
     be declared once and nowhere else: a second declaration under a
     [data-theme] block is exactly how it happened the first time. */
  const declarations = css.match(/--alert\s*:/g) || [];
  assert.equal(declarations.length, 1,
    'the alert colour is declared ' + declarations.length + ' times; a theme can override it again');

  /* Both places read that one token: the dot in the pill, and the mark on
     the Settings control. */
  assert.ok(/\.update-dot \{[^}]*background: var\(--alert/.test(css),
    'the pill dot no longer takes the alert token');
  assert.ok(/#openSettings\.has-update::after \{[^}]*background: var\(--alert/.test(css),
    'the mark on the Settings control no longer takes the alert token');

  /* And the preview page shows what the app does, or it is showing a
     design that was never shipped -- including the one-declaration rule,
     since that page carries eight theme skins of its own. */
  const preview = read('previews/update-notice.html');
  assert.ok(preview.toLowerCase().indexOf(hex) !== -1,
    'previews/update-notice.html is still drawn in the old alert colour');
  const previewDecls = preview.match(/--alert\s*:/g) || [];
  assert.equal(previewDecls.length, 1,
    'the preview declares the alert colour ' + previewDecls.length + ' times, so its themes can diverge');
});

test('an update is not something to be taken, and the line says so', () => {
  /* Three shapes in one evening, which is worth recording. It said "run
     Update Deskside Radio from the Start menu" -- an entry that only
     exists where the installer made one, so an archive unzipped by hand
     was pointed at something that had never been created, and one filed
     under U where nobody looks for a radio. Fixing that, it named the
     file, the Start menu entry and the way to reach the folder, all in one
     line, which left the reader to work out which of the three was theirs.

     It is now the same link the release page gives a first-time installer.
     Install and update stop being two procedures. The installer needs no
     argument to do the right thing: with no index.html beside it, and
     there is none in a Downloads folder, it targets the folder it
     installed to. */
  const app = read('app.js');

  /* On Windows the line stopped offering anything the day the opener began
     fetching updates by itself. What it must not do is go back to naming a
     download: that route costs two security prompts the copy already in the
     app folder costs none of, and it is now also the slower of the two. */
  assert.equal(/UPDATER_URL/.test(app), false,
    'the update line is offering a download again -- the opener already fetches it, ' +
    'and the copy in the app folder is the prompt-free way to have it sooner');
  assert.ok(/head \+ 'it installs itself · '/.test(app),
    'the Windows update line no longer says the update arrives on its own');

  /* And the .cmd is offered only where it can be run. The radio runs on a
     Mac and on Linux just as well, and handing either of those a Windows
     batch file is worse than saying nothing: an instruction that cannot be
     followed, from an app that could have checked. Windows has to be
     asserted -- not knowing yet counts as not Windows -- because that way
     round, being wrong costs one extra click through a page that works
     rather than a file somebody cannot open. */
  assert.ok(/function onWindows\(\)/.test(app), 'app.js no longer works out the platform');
  assert.ok(/line\.innerHTML = onWindows\(\)/.test(app),
    'the update line no longer branches on the platform, so a Mac is offered a .cmd');
  assert.ok(/get it from GitHub/.test(app), 'there is no non-Windows wording for the update line');
  assert.ok(/if \(d && d\.platform\) return d\.platform === 'Windows';/.test(app),
    'the platform test no longer asks userAgentData first');
  assert.ok(/catch \(e\) \{ return false; \}/.test(app),
    'the platform test no longer falls back to not-Windows when it cannot tell');

  /* The paragraph in the Service pane has the same two halves. */
  const html = read('index.html');
  const css = read('app.css');
  assert.ok(/<p class="hint os-win">/.test(html) && /<p class="hint os-other">/.test(html),
    'the Service pane explains updating one way for every platform again');
  assert.ok(/\.os-win, \.os-other \{ display: none; \}/.test(css),
    'both platform paragraphs are drawn at once');
  assert.ok(/\[data-os\]:not\(\[data-os="windows"\]\) \.os-other/.test(css),
    'the non-Windows paragraph is never shown');
  assert.ok(/setAttribute\('data-os', onWindows\(\) \? 'windows' : 'other'\)/.test(app),
    'nothing stamps the platform on the root, so neither paragraph is ever drawn');

  /* And both readmes say which platform each route belongs to. */
  ['README.md', 'User Reference Guide.html'].forEach(function (f) {
    const doc = read(f);
    assert.ok(/On Windows/.test(doc), f + ' no longer marks the Windows-only update route');
    assert.ok(/On macOS and Linux/.test(doc), f + ' does not say how to update anywhere but Windows');
  });

  /* One route in that line, not three. The folder copy and the Start menu
     entry are cheaper -- no Mark of the Web, so no prompts -- but they
     belong in the readme, not in the sentence somebody reads when they
     want the new version and nothing else. */
  /* The line itself, not the comment above it. A window of characters
     either side of the wording used to be enough, until the comment
     explaining why there is no second route said "in the app folder" and
     failed the test for saying so. Anchored on the assignment, it reads
     only what is actually rendered. */
  const at = app.indexOf("var head = running + ' \xb7 <b class=\"new-ver\">");
  assert.ok(at !== -1, 'the update line is no longer built where this test can read it');
  const line = app.slice(at, app.indexOf(';', app.indexOf('line.innerHTML', at)));
  assert.equal(/Deskside Radio - Update|in the app folder/.test(line), false,
    'the Service line names more than one way to update again');

  /* The Start menu entry is still made, and still under D. */
  const cmd = read(INSTALLER);
  assert.ok(cmd.indexOf("'Deskside Radio - Update.lnk'") !== -1,
    INSTALLER + ' no longer writes a Start menu entry called Deskside Radio - Update');
  assert.ok(/Test-Path -LiteralPath \(Join-Path \$dir 'Deskside Radio - Update\.lnk'\)\) -and \(Test-Path -LiteralPath \$old\)/.test(cmd),
    INSTALLER + ' removes the old shortcut without confirming the new one exists');
  assert.ok(read('Win - Uninstall Deskside Radio.cmd').indexOf("-like 'Deskside Radio*.lnk'") !== -1,
    'the uninstaller no longer sweeps the wildcard that covers the renamed shortcut');

  /* And nothing anywhere still sends somebody to the name filed under U. */
  ['app.js', 'index.html', 'README.md', 'User Reference Guide.html'].forEach(function (f) {
    assert.ok(!/(run|open|double-click)[^.]{0,40}<?\/?(strong|b)?>?Update Deskside Radio/i.test(read(f)),
      f + ' still sends somebody to a Start menu entry called Update Deskside Radio');
  });
});

test('an unzipped archive is not mistaken for an installed copy', () => {
  /* The rule was "index.html sits beside me, so I am inside an install".
     An archive unpacked into Downloads has exactly that shape, because the
     installer ships inside the zip -- so somebody who downloaded
     deskside-radio-1.4.5.zip, unzipped it and ran the script in it had the
     radio installed into their Downloads folder, with the Desktop shortcut
     and the Start menu entry both pointing there. Reported, reproduced.

     An install is now marked as one. The marker is written by the script
     and is never in the zip, which is the whole of what makes it mean
     something: a folder holding it was installed into, a folder without it
     was unpacked into. */
  const MARKER = 'assets\\installed-here.txt';
  const cmd = read(INSTALLER);

  assert.ok(cmd.indexOf('set "MARKER=' + MARKER + '"') !== -1,
    INSTALLER + ' no longer defines the marker that tells an install from an unzipped archive');
  assert.ok(cmd.indexOf('if exist "%~dp0index.html" if exist "%~dp0%MARKER%"') !== -1,
    INSTALLER + ' decides it is inside an install without checking for the marker, so an ' +
    'unzipped archive is treated as one again');
  assert.ok(/> "%APPDIR%%MARKER%" echo/.test(cmd),
    INSTALLER + ' never writes the marker, so no install would ever be recognised as one');

  /* An install already at the target is an update, wherever the script ran
     from. Without this the occupied guard fired on the ordinary case: the
     app tells people to download the installer and run it, and with a
     perfectly good install in place that was refused -- with a message
     describing an index.html check the code did not perform. */
  assert.ok(cmd.indexOf('if not defined UPDATING if exist "%APPDIR%index.html" set "UPDATING=1"') !== -1,
    INSTALLER + ' no longer treats an existing install at the target as an update, so ' +
    'downloading the installer and running it is refused');
  const occupied = cmd.slice(cmd.indexOf(':occupied'), cmd.indexOf(':occupied') + 400);
  assert.equal(/none of them is index\.html/.test(occupied), false,
    'the occupied message describes a check that is not made');

  /* And the marker must never travel in the zip, or every unzipped archive
     would claim to be an install and we are back where we started. */
  assert.equal(read('tools/build-dist.js').indexOf('installed-here'), -1,
    'the build names the install marker, which would ship it inside the zip');
  assert.equal(fs.existsSync(path.join(ROOT, 'assets', 'installed-here.txt')), false,
    'there is an install marker in the repository, which the build would copy into the zip');
});

test('a name is measured by its ink, not by its trailing tracking', () => {
  /* letter-spacing goes after every character, the last one included, and
     that final gap draws nothing while still counting in scrollWidth.
     Measured in Chrome: six characters at 10px of tracking make scrollWidth
     60px wider, not 50. So a name whose ink ends exactly at the edge of its
     box reported a whole unit of tracking of overflow and was scrolled.

     Departures made it visible -- .05em at 52px is 2.6px of phantom
     overflow, and its flap path rounds any overflow up to a whole cell, so
     a name with room to its right lurched a full cell and back for ever.
     Swept in a browser: the misread band is exactly one unit of tracking
     wide, which is narrower than a character, so it can only be reached by
     moving the wall rather than by adding letters. That is why one machine
     saw it and another did not. */
  const src = read('tuner-ui.js');
  assert.ok(/function trailingTrack\(cs\)/.test(src),
    'tuner-ui.js no longer works out the trailing tracking');
  assert.ok(/var over = el\.scrollWidth - el\.clientWidth - trailingTrack\(cs\);/.test(src),
    'fitLine is back to trusting scrollWidth, which counts a gap that draws nothing');
  /* And it must be read before the flap branch, which is the one that
     rounds the overflow up to a whole cell. */
  const at = src.indexOf('function fitLine');
  const fn = src.slice(at, at + 1200);
  assert.ok(fn.indexOf('trailingTrack(cs)') < fn.indexOf('flap-ch'),
    'the flap path is reached before the trailing tracking is taken off');
});

test('the console peak lamp holds, falls, and is drawn above the cover', () => {
  /* A bar says what the level is now; a peak lamp says what the loudest
     thing was and holds it long enough to be read. It has to sit on the
     cell grid -- half a lit LED is not something a bank of LEDs can do --
     and it has to be drawn over the cover that hides the unlit part of the
     bar, because the cover runs from the current level rightwards, which is
     exactly where a held peak is.

     That last one is not theoretical. Checked by reading pixels out of a
     screenshot: without the z-index the lamp is painted and then covered,
     and the row of pixels where it should be is empty. */
  const css = read('app.css');
  const js = read('tuner-ui.js');
  const html = read('index.html');

  assert.ok(/<i class="meter-peak"><\/i>/.test(html),
    'the peak lamp element is gone from the meter');
  assert.ok(/\.meter-peak \{ display: none; \}/.test(css),
    'the peak lamp is drawn in themes that have nowhere to put it');
  const at = css.indexOf('[data-theme="console"] .meter-peak');
  const lamp = css.slice(at, css.indexOf('}', at));
  assert.ok(/z-index: 1;/.test(lamp),
    'the console peak lamp is back under the cover that hides the unlit bar');
  /* Positioned in whole cells, not in percent. A cell is snapped to whole
     device pixels; a percentage of the bar is not, and at 125% scaling
     that left a 1px fringe down each side of the lamp and another at the
     cover's edge -- three hairlines nobody drew. */
  assert.ok(/left: calc\(var\(--vu-peak-n, 0\) \* var\(--cell-dp/.test(lamp),
    'the lamp is positioned by a fraction of the bar again, which lands between device pixels');
  assert.ok(/transform: translateX\(calc\(var\(--lit-cells\)/.test(css),
    'the cover is scaled again rather than slid by whole cells, so its edge splits a pixel');
  /* Counted with one floor. Rounding to a multiple of the step and then
     dividing by the step again returns 46.99999 as readily as 47, and a
     cell width times that lands a third of a device pixel off -- which is
     exactly the hairline this is here to stop. */
  assert.ok(/--lit-cells: round\(down, calc\(var\(--vu, 0\) \/ var\(--vu-step, \.0125\)\), 1\);/.test(css),
    'the lit cells are counted by dividing a rounded product again, which does not land on whole pixels');
  assert.ok(/setProperty\('--vu-peak-n', s\)/.test(read('tuner-ui.js')),
    'the meter hands the stylesheet a fraction again instead of a cell number');
  assert.ok(/overflow: hidden;/.test(css.slice(css.indexOf('[data-theme="console"] .meter-bar {'),
                                               css.indexOf('[data-theme="console"] .meter-bar::before'))),
    'the console bar no longer clips, so the slid cover paints past its right edge');
  /* And the lamp takes the colour of the band it is standing on, from the
     same gradient the bar is painted with rather than a second copy. */
  assert.ok(/--vu-bands: linear-gradient/.test(css), 'the band gradient is no longer named once');
  assert.ok(/background-image: var\(--vu-bands\);/.test(lamp),
    'the lamp has a colour of its own again instead of the segment it sits on');
  assert.ok(/\.tuner\.is-quiet \.meter-peak \{ opacity: 0; \}/.test(css),
    'the lamp stays lit over a stopped meter, holding the last loud moment for ever');

  /* The console bar has to be on the same grid the lamp lands on. */
  assert.ok(/\[data-theme="console"\] \.meter \{ --vu-cell: 12px; --vu-gap: 3px;/.test(css),
    'the console meter no longer declares its cell pitch, so nothing can snap to it');
  assert.ok(/--lit-cells: round\(down,/.test(css),
    'the console bar is no longer snapped to whole cells, so the lamp and the bar disagree');

  /* Ballistics, and the rule that keeps this off the hot path. */
  assert.ok(/var PEAK_HOLD = 1500;/.test(js), 'the peak hold is no longer 1.5s');
  assert.ok(/var PEAK_FALL = 0\.55;/.test(js), 'the peak fall rate changed');
  assert.ok(/if \(s === t\.lastPeak\) return;/.test(js),
    'setPeak writes on every frame again; it runs sixty times a second');
  assert.ok(/var cells = Math\.floor\(t\.peak \/ t\.step\);/.test(js),
    'the lamp is no longer snapped to whole cells');
});

test('Save and Close are told apart by colour, not only by their word', () => {
  /* One button does both jobs. Only the word changed, which is a small
     thing to notice on a button you are already looking past. The green is
     the drawer's own -- the one a switch turns when it goes on -- rather
     than a ninth colour invented for this. */
  const css = read('app.css');
  assert.ok(/\.primary\.is-dirty \{ background: #2e9a5a; color: #fff; \}/.test(css),
    'the Save state no longer has a colour of its own');
  assert.ok(css.indexOf('.switch input:checked + .switch-track { background: #2e9a5a; }') !== -1,
    'the drawer green moved, so the Save button is now a colour nothing else uses');
  /* The dissolve comes from the shared rule; if that goes, the colour snaps. */
  assert.ok(/\.mini, \.tab, \.ghost, \.file-btn, \.primary,[^{]*\{\s*\n\s*transition: background \.13s ease/.test(css),
    'the primary button no longer fades between colours');
  assert.ok(read('app.js').indexOf("btn.classList.toggle('is-dirty', dirty)") !== -1,
    'nothing puts is-dirty on the button any more');
});

test('the window is put back before the page is drawn, not after', () => {
  /* Chrome will not restore an --app window's own bounds: relaunched on
     the same profile it comes up at its own default, measured twice now --
     a window last seen at 1134x742 reopened at 1266x1372. So the page has
     to move the window, and a page can only move a window that exists,
     which means something is always shown at the launcher's position
     first. The only question is for how long.

     It used to be the whole boot: the move lived in app.js, at the foot of
     the body, behind five scripts and a requestAnimationFrame. Measured in
     a real Chrome window, the move now happens at ~12ms against a first
     paint at ~600ms, so the window is in place before anything is drawn.

     This has to stay in the head, above the stylesheet, or it goes back to
     being late. */
  const html = read('index.html');
  const head = html.slice(0, html.indexOf('</head>'));
  const at = head.indexOf('windowBox');
  assert.ok(at !== -1, 'the early window restore is gone from the head');
  assert.ok(at < head.indexOf('app.css'),
    'the window restore sits below the stylesheet, so it waits on a render-blocking fetch');
  assert.ok(/window\.moveTo\(x, y\);/.test(head), 'the early restore no longer moves the window');
  assert.ok(/window\.resizeTo\(w, h\);/.test(head), 'the early restore no longer sizes the window');

  /* It must decline the same two things app.js declines, or it would move
     somebody's ordinary browser window around. */
  assert.ok(/Chrome\\\/\|Chromium\\\/\|Edg\\\//.test(head),
    'the early restore no longer checks which browser it is in');
  assert.ok(/frame > 0 && frame < 60/.test(head),
    'the early restore no longer checks that this is the launcher window');
  /* And it must never be able to stop the page loading. */
  assert.ok(/try \{/.test(head) && /catch \(e\)/.test(head),
    'the early restore is not wrapped, so a bad stored box would break the boot');

  /* app.js still owns saving, and still runs the restore itself -- that is
     what sets keepBox, without which fitWindow would resize over it. */
  const app = read('app.js');
  assert.ok(/if \(restoreBox\(\)\) \{\s*\n\s*keepBox = true;\s*\n\s*mayFit = true;/.test(app),
    'app.js no longer claims the restored box, so the window gets refitted over it');
});

const OPENER = 'Win - Open Deskside Radio.cmd';
const VBS = 'Win - Open Deskside Radio.vbs';

test('the opener locks the window, and the shortcuts go through it', () => {
  /* A window cannot be made non-resizable from inside the page: there is no
     web API for it and no browser switch for it. The only way is to clear
     WS_THICKFRAME after Windows has made the window, which needs something
     of ours running at launch -- and a shortcut aimed straight at
     chrome.exe leaves nothing of ours running at all. Hence the opener.

     Two things about finding the window were learned by getting them
     wrong. MainWindowTitle only reports a process's *main* window, so with
     Chrome already running the app window was invisible to it; this walks
     every top-level window instead. And the title is not "Deskside Radio"
     once a station is playing -- it is "KISS 92.5 - Deskside Radio" -- so
     an exact match never fired. It matches the tail. */
  const src = read(OPENER);

  assert.ok(/EnumWindows/.test(src),
    OPENER + ' is back to MainWindowTitle, which cannot see a second window of a running browser');
  assert.ok(/EndsWith\(tail\)/.test(src),
    OPENER + ' matches the window title exactly again, which fails as soon as a station is playing');
  assert.ok(/0x40000/.test(src) && /0x10000/.test(src),
    OPENER + ' no longer clears both the resize grip and the maximise box');
  /* A minute, not the ten seconds this started with. Nothing is warm at
     sign-in and the radio has been measured taking over a minute to appear
     after a reboot; a window that turns up after the wait has run out is
     left resizable with nothing said about it. */
  assert.ok(/foreach \(\$try in 1\.\.120\)/.test(src) && /Start-Sleep -Milliseconds 500;/.test(src),
    OPENER + ' no longer waits about a minute for the window to appear');
  /* $args is a PowerShell automatic variable; assigning to it silently
     cost us the whole launch once. */
  assert.equal(/\$args\b/.test(src), false,
    OPENER + ' assigns to $args, which PowerShell owns');

  /* It ships, or the shortcuts point at something that is not there. */
  assert.ok(read('tools/build-dist.js').indexOf(OPENER) !== -1,
    OPENER + ' is not in the build, so a download would have shortcuts aimed at a missing file');

  /* Both shortcut writers go through it -- by way of the .vbs, which is
     what keeps a console from ever being created -- and fall back, first to
     the .cmd and then to the browser. */
  ['Win - Create Desktop Shortcut (Chrome).cmd', 'Win - Start with Windows (On-Off).cmd'].forEach(function (f) {
    const s = read(f);
    assert.ok(s.indexOf('set "OPENER=%APPDIR%' + VBS + '"') !== -1,
      f + ' no longer names the .vbs opener');
    assert.ok(s.indexOf('set "OPENERCMD=%APPDIR%' + OPENER + '"') !== -1,
      f + ' has lost the .cmd fallback for a folder older than the .vbs');
    assert.ok(/if not exist "%OPENER%" set "OPENER="/.test(s),
      f + ' would write a shortcut to an opener that is not there');
    assert.ok(/if not exist "%WSCRIPT%" set "OPENER="/.test(s),
      f + ' would aim a shortcut at wscript.exe without checking it is there');
    assert.ok(/\$link\.TargetPath = \$env:WSCRIPT;/.test(s),
      f + ' does not start the opener through wscript, so the console flashes again');
    assert.ok(/\$link\.Arguments = \$q \+ \$env:OPENER \+ \$q \+ ' ' \+ \$q \+ \$env:BROWSER \+ \$q;/.test(s),
      f + ' does not hand the .vbs the browser to use');
    assert.ok(/\$link\.WindowStyle = 7;/.test(s),
      f + ' no longer minimises the .cmd on the fallback path, so its console shows');
    assert.ok(/\} elseif \(\$env:BROWSER\) \{/.test(s),
      f + ' has lost the fallback that aims straight at the browser');
  });
});

/* A .cmd is run by cmd.exe and cmd.exe gets a console. WindowStyle 7 only
   minimises that console once Windows has drawn it, which is the black
   rectangle and the taskbar button that flash at launch -- both visible on
   a screen recording of a clean 1.4.7 install. Run from a .vbs with a
   window style of 0, the console is never created at all. */
test('the launcher opens without a console window', () => {
  const src = read(VBS);

  assert.ok(/CreateObject\("WScript\.Shell"\)/.test(src), VBS + ' does not use WScript.Shell to start anything');
  assert.ok(src.indexOf(OPENER) !== -1, VBS + ' no longer starts ' + OPENER);
  assert.ok(/sh\.Run line, 0, False/.test(src),
    VBS + ' does not run with window style 0, which is the whole reason it exists');
  assert.ok(/ScriptFullName/.test(src),
    VBS + ' does not work out its own folder, so a moved app folder would break it');
  /* Nothing but the launch. Logic here is logic that cannot be read or run
     on its own, and the .cmd is the file people are meant to be able to
     open and understand. */
  assert.ok(src.split('\n').filter(function (l) {
    const t = l.trim();
    return t && t.charAt(0) !== "'" && !/^Option Explicit$/.test(t);
  }).length < 14, VBS + ' has grown logic of its own; it is meant to be a launcher and nothing else');

  assert.ok(read('tools/build-dist.js').indexOf(VBS) !== -1,
    VBS + ' is not in the build, so a download would have shortcuts aimed at a missing file');
});

/* One line of flags, in four scripts, that has to be the same line in all
   four: the shortcut bakes it into a .lnk, the opener passes it when it
   starts the browser, and a profile started with one set and reopened with
   another is a profile that fetches the lot again. */
test('the profile-trimming flags are the same wherever they are written', () => {
  const FLAGS = ['Win - Open Deskside Radio.cmd', 'Win - Create Desktop Shortcut (Chrome).cmd',
    'Win - Create Desktop Shortcut (Edge).cmd', 'Win - Start with Windows (On-Off).cmd'];
  const lines = FLAGS.map(function (f) {
    const m = read(f).match(/^set "LEAN=.*$/m);
    assert.ok(m, f + ' no longer sets the lean-profile flags');
    return m[0];
  });
  lines.forEach(function (l, i) {
    assert.equal(l, lines[0], FLAGS[i] + ' has drifted from ' + FLAGS[0] + "'s flags");
  });

  /* The ones that matter, named so that removing one is a decision rather
     than an edit. Background networking is the big one: it is what fetches
     most of the thirty-odd folders. */
  ['--disable-background-networking', '--disable-component-update', '--disable-breakpad',
   '--no-pings', 'OptimizationHints', 'SegmentationPlatform'].forEach(function (flag) {
    assert.ok(lines[0].indexOf(flag) !== -1, 'the lean-profile flags no longer pass ' + flag);
  });
  /* Not the shader caches. They are small and they are what stops every
     launch recompiling the same shaders. */
  assert.equal(/disable-gpu-shader-disk-cache/.test(lines[0]), false,
    'the lean-profile flags disable the shader cache, which costs time at every launch to save a few MB once');
});

/* The Chrome profile was the only one of the three not named after its
   browser. Renaming it is a move, never a fresh folder: the stations, the
   schedule and the theme live in it and nowhere else. */
test('the chrome profile is named after chrome, and is moved rather than remade', () => {
  ['Win - Open Deskside Radio.cmd', 'Win - Create Desktop Shortcut (Chrome).cmd',
   'Win - Start with Windows (On-Off).cmd'].forEach(function (f) {
    const s = read(f);
    assert.ok(s.indexOf('set "PROFILE=%LOCALAPPDATA%\\DesksideRadio\\profile-chrome"') !== -1,
      f + ' still points at the unnamed profile folder');
    assert.ok(/move "%LOCALAPPDATA%\\DesksideRadio\\profile" "%PROFILE%"/.test(s),
      f + ' does not carry the old profile across, so renaming it would lose the stations');
  });
  /* And the uninstaller has to know about every one of them, or an
     uninstall leaves settings behind that reinstalling picks up again. */
  const un = read('Win - Uninstall Deskside Radio.cmd');
  ['profile', 'profile-chrome', 'profile-edge', 'profile-firefox'].forEach(function (name) {
    assert.ok(new RegExp('PROFILES=[^\\n]*\\b' + name + '\\b').test(un),
      'the uninstaller does not know about ' + name);
  });
});

test('arriving on the departures board turns the board', () => {
  /* setName flaps only when the words change, which is right: it is a new
     departure that turns the panels, and a theme switch leaves the same
     name standing. But arriving on the board is itself an arrival, and a
     split-flap sign that turns up already settled is the one thing a
     split-flap sign should never do.

     Only on the way in. A save that leaves the theme where it was turns
     nothing -- checked in a browser: switching to Departures and saving
     gave 28 distinct frames of the readout, saving again on the same theme
     gave one. */
  const js = read('tuner-ui.js');
  const app = read('app.js');

  assert.ok(/function flapName\(nameEl\)/.test(js), 'tuner-ui.js no longer offers flapName');
  assert.ok(/flapName: flapName/.test(js), 'flapName is not exported, so the drawer cannot ask for it');
  /* The two conditions live in flapName, so no caller has to remember
     that one theme has panels and that stillness may have been asked for. */
  const at = js.indexOf('function flapName');
  const fn = js.slice(at, js.indexOf('}', js.indexOf('flapReveal(nameEl);', at)));
  assert.ok(/themeOf\(nameEl\) !== 'departures'/.test(fn),
    'flapName no longer checks the theme, so it would scramble a readout with no panels');
  assert.ok(/prefers-reduced-motion: reduce/.test(fn),
    'flapName ignores reduced motion');

  assert.ok(/var lookWas = null;/.test(app), 'app.js no longer remembers the theme it was on');
  assert.ok(/if \(state\.theme === 'departures' && from && from !== 'departures'\)/.test(app),
    'the board turns on every save, or on none, rather than only on arriving');
  assert.ok(/TunerUI\.flapName\(el\.name\);/.test(app), 'nothing asks the board to turn');

  /* And it turns where it can be watched. The theme is applied the moment
     Save is pressed, but the drawer stays up for the whole Saved plate and
     then takes another .19s to leave -- so flapping on the spot spent the
     entire turn behind the modal and what you saw was a board that had
     already finished. It waits for the dialog's close event and then for
     display to reach none, which with allow-discrete is the end of the
     close transition and the one honest answer to "has it gone yet". */
  assert.ok(/function flapWhenClear\(\)/.test(app),
    'app.js no longer waits for the drawer before turning the board');
  assert.ok(/flapWhenClear\(\);/.test(app), 'the board is turned without waiting for the drawer');
  const wait = app.slice(app.indexOf('function flapWhenClear'), app.indexOf('function applyLook'));
  assert.ok(/addEventListener\('close'/.test(wait), 'the wait no longer keys off the dialog closing');
  assert.ok(/getComputedStyle\(dlg\)\.display === 'none'/.test(wait),
    'the wait no longer checks that the drawer has actually gone');
  assert.ok(/\+\+frames > 90/.test(wait),
    'the wait is uncapped, so a drawer that never reports closed would spin forever');
  /* The plate is what makes the wait necessary; if it went to nothing this
     would still be correct, but the comment above would be a lie. */
  assert.ok(/var SAVED_PLATE_MS = \d+;/.test(app), 'the Saved plate delay is gone');
});

test('the Saved plate and the drawer close on the same clock', () => {
  /* Two numbers in two files that have to agree. The plate plays out and
     the drawer leaves as it lands -- if the constant is the shorter, the
     drawer goes while the word is still on screen; if the stylesheet is,
     the drawer sits there after it has gone. Neither is visible in a diff
     of one file, and on the departures theme the cost compounds: the board
     cannot turn until the drawer has left. */
  const js = /var SAVED_PLATE_MS = (\d+);/.exec(read('app.js'));
  const css = /animation: save-msg-cycle ([\d.]+)s/.exec(read('app.css'));
  assert.ok(js, 'SAVED_PLATE_MS is gone from app.js');
  assert.ok(css, 'the save-msg-cycle duration is gone from app.css');
  assert.equal(Number(js[1]), Math.round(parseFloat(css[1]) * 1000),
    'SAVED_PLATE_MS is ' + js[1] + 'ms but save-msg-cycle runs for ' + css[1] + 's');
});

/* ------------------------------------------------------------------ *
   The installer runs the published installer, not itself.

   This file ships inside the zip, so after the first install a copy sits
   in the app folder and every update replaces it -- and that copy is
   always one release behind the thing it is about to install. A fix made
   to installing can therefore never reach the run that needs it: whoever
   has the bug has the old script, and the old script is what executes.
 * ------------------------------------------------------------------ */
test('the installer hands over to the published copy of itself', () => {
  const src = read(INSTALLER);

  assert.ok(src.indexOf('releases/latest/download/Win-Install-or-Update-Deskside-Radio.cmd') !== -1,
    INSTALLER + ' does not fetch the published installer, or has pinned it to a version');
  assert.equal(/CMDURL=[^\n]*releases\/download\/v/.test(src), false,
    INSTALLER + ' pins the installer URL to one release, which freezes every future update');

  /* Exactly one hand-over. Without the guard this is a script that
     downloads itself and runs itself, for ever. */
  assert.ok(/if defined DESKSIDE_FRESH goto :newest/.test(src),
    INSTALLER + ' has no guard against handing over to itself again');
  assert.ok(/set "DESKSIDE_FRESH=1"/.test(src) && /call "%NEWCMD%"/.test(src),
    INSTALLER + ' never actually runs the newer copy');
  assert.ok(/fc\.exe" \/b "%NEWCMD%" "%~f0"/.test(src),
    INSTALLER + ' does not compare the published installer with itself, so it would hand over every time');
  /* The child runs from %TEMP%, where the "am I inside an install" rule
     gives a different answer, so it is told where to install. */
  assert.ok(/call "%NEWCMD%" "%APPROOT%"/.test(src),
    INSTALLER + ' hands over without saying where to install, so the child would pick the default');
});

/* After a run of releases cut on one version number there was no way to
   tell from the installer's own window whether what had landed was the
   build you wanted. It says so now -- read out of the zip already on this
   disk, so it costs no request and describes the files actually about to
   be written rather than whatever the release page claims. */
test('an update clears the manual under its old name', () => {
  /* tar writes what the archive carries and leaves the rest alone, which is
     what lets a settings seed survive an update -- and what would leave
     README.html sitting beside User Reference Guide.html for ever on any
     folder installed before 1.5.1 renamed it. Two manuals, one of them
     describing a version nobody is running.

     Guarded on the new file being there, so an unpack that went wrong
     leaves the old manual rather than none. */
  const cmd = read(INSTALLER);
  const i = cmd.indexOf('del /q "%APPDIR%README.html"');
  assert.ok(i !== -1, INSTALLER + ' no longer clears the manual under its old name');

  const guard = cmd.slice(Math.max(0, i - 220), i);
  assert.ok(guard.indexOf('if exist "%APPDIR%User Reference Guide.html"') !== -1,
    'the old manual is deleted without checking the new one arrived, so a failed unpack leaves none');

  /* And the app has to be able to read either, because the folder is only
     tidied by an update that gets that far. */
  const app = read('app.js');
  const names = app.slice(app.indexOf('var README_NAMES'), app.indexOf('var README_NAMES') + 160);
  assert.ok(names.indexOf("'User Reference Guide.html'") < names.indexOf("'README.html'"),
    'the old manual name is tried first, so a tidied folder opens the stale one');
});
test('the installer says which version it is installing', () => {
  const src = read(INSTALLER);

  assert.ok(/"%TAR%" -xOf "%ZIP%" assets\/version\.txt/.test(src),
    INSTALLER + ' does not read the version out of the downloaded archive');
  /* version.json is not in the download, and the number the app shows is
     inlined into a single 240 KB line of index.html. Neither is readable
     from a batch file, which is why the build writes one line. */
  assert.equal(/-xOf "%ZIP%" version\.json/.test(src), false,
    INSTALLER + ' reads version.json out of the zip, which has never been in it');
  assert.ok(read('tools/build-dist.js').indexOf("ASSETS, 'version.txt'") !== -1,
    'the build does not write assets/version.txt, so the installer has nothing to read');
  assert.ok(/set "MSG=Version %NEWVER%, replacing %OLDVER%"/.test(src),
    INSTALLER + ' does not say which version it is replacing on an update');
  assert.ok(/set "MSG=Version %NEWVER%"/.test(src),
    INSTALLER + ' does not say which version a fresh install is getting');
  /* Before the unpack, because the unpack overwrites the file it reads. */
  assert.ok(src.indexOf('set "OLDVER="') < src.indexOf('"%TAR%" -xf "%ZIP%" -C "%APPROOT%"'),
    INSTALLER + ' reads the installed version after unpacking over it, so it can only ever report the new one');
});

/* A .lnk holds the full path to the app folder, so an install that moved
   leaves every shortcut aimed at where the folder used to be. That is not
   hypothetical: a Startup entry made from a copy unzipped into Downloads
   went on opening file:///C:/Users/.../Downloads/deskside-radio/index.html
   at every sign-in, long after that folder was gone. */
test('the installer rewrites the shortcuts that exist, and asks when there are none', () => {
  const src = read(INSTALLER);

  ['Deskside Radio.lnk', 'Deskside Radio (Edge).lnk', 'Deskside Radio (Firefox).lnk'].forEach(function (lnk) {
    assert.ok(src.indexOf(lnk) !== -1, INSTALLER + ' does not look for ' + lnk);
  });
  assert.ok(/set \/p "PICK=/.test(src), INSTALLER + ' never asks which browser to use');
  assert.ok(/if defined WANT goto :haveshortcut/.test(src),
    INSTALLER + ' asks the question even when there is already a shortcut to refresh');
  ['Chrome', 'Edge', 'Firefox'].forEach(function (b) {
    assert.ok(src.indexOf('call :shortcut "Win - Create Desktop Shortcut (' + b + ').cmd"') !== -1,
      INSTALLER + ' cannot make the ' + b + ' shortcut');
  });
  /* And the Startup entry, which nothing else ever rewrites. */
  assert.ok(/Startup\\Deskside Radio\.lnk/.test(src) && /Win - Start with Windows \(On-Off\)\.cmd/.test(src),
    INSTALLER + ' leaves a stale Startup entry pointing at the old folder');

  /* Every one of those is called quietly, or the installer's own account
     of what it did arrives in pieces around three other banners. */
  ['Win - Create Desktop Shortcut (Edge).cmd', 'Win - Create Desktop Shortcut (Firefox).cmd',
   'Win - Start with Windows (On-Off).cmd'].forEach(function (f) {
    const s = read(f);
    assert.ok(/if not defined DESKSIDE_NOPAUSE pause/.test(s),
      f + ' pauses even when the installer is calling it, so an install stops dead waiting for a keypress');
    assert.ok(/if not defined DESKSIDE_NOPAUSE \(/.test(s),
      f + ' prints its own banner in the middle of the installer output');
  });
});

/* The trim is the one thing here that deletes anything of the listener's,
   so what it can reach is written out by hand and tested by name. */
test('trimming the profile cannot reach the settings', () => {
  const src = read('assets/trim-profile.ps1');

  /* Where the stations, the schedule and the theme actually are. */
  assert.equal(/Local Storage|Local State|leveldb/i.test(src.replace(/^#.*$/gm, '')), false,
    'trim-profile.ps1 names the storage the settings live in; it must never be able to reach it');
  /* Under the app's own folder, and nowhere else. */
  assert.ok(/Join-Path \$env:LOCALAPPDATA 'DesksideRadio'/.test(src),
    'trim-profile.ps1 does not root itself at the app\'s own folder');
  assert.equal(/Remove-Item[^\n]*\$root\b/.test(src), false,
    'trim-profile.ps1 can remove the whole folder rather than named parts of it');
  /* The list is a list, not a pattern. A wildcard here would delete
     whatever Chrome invents next, sight unseen. */
  assert.ok(/\$junk = @\(/.test(src), 'trim-profile.ps1 no longer keeps an explicit list of what it may delete');
  assert.equal(/Get-ChildItem[^\n]*-Directory/.test(src), false,
    'trim-profile.ps1 deletes by listing the folder rather than by name');
  /* Preferences is the browser's own file. Kept, before it is rewritten. */
  assert.ok(/Copy-Item -LiteralPath \$prefs -Destination \(\$prefs \+ '\.dsr-bak'\)/.test(src),
    'trim-profile.ps1 rewrites Preferences without keeping the original');
  assert.ok(/ConvertTo-Json -Depth 100/.test(src),
    'trim-profile.ps1 rewrites Preferences at the default depth, which flattens most of it into strings');

  assert.ok(read('tools/build-dist.js').indexOf('ps1') !== -1,
    'trim-profile.ps1 is not in the build, so the installer would call a file that is not there');
});

/* Each shortcut opens its own browser profile and no profile can read
   another's storage. The settings file beside index.html is the only thing
   all three can see, so where a download lands decides whether settings can
   cross between them at all. Landing in Downloads, they cannot. */
test('an export lands beside index.html, where the other browsers can read it', () => {
  ['Win - Create Desktop Shortcut (Chrome).cmd', 'Win - Create Desktop Shortcut (Edge).cmd'].forEach(function (f) {
    const s = read(f);
    assert.ok(/default_directory = \$env:APPROOT/.test(s),
      f + ' does not point the profile\'s downloads at the app folder');
    assert.ok(/prompt_for_download = \$false/.test(s),
      f + ' leaves the browser asking where to save, so an export can still land anywhere');
    /* Only on a profile that has none. One already in use has a
       Preferences file full of its own state, and the installer is what
       edits one of those. */
    assert.ok(/if \(-not \(Test-Path -LiteralPath \$f\)\) \{/.test(s),
      f + ' overwrites an existing Preferences file every time it runs');
  });

  const ff = read('Win - Create Desktop Shortcut (Firefox).cmd');
  assert.ok(/browser\.download\.folderList", 2/.test(ff),
    'the Firefox profile still saves downloads wherever Firefox defaults to');
  assert.ok(/browser\.download\.dir/.test(ff), 'the Firefox profile is not told which folder to save into');
});

/* ------------------------------------------------------------------ *
   The settings file: what it carries, and who reads it.
 * ------------------------------------------------------------------ */

/* An export that leaves a setting out is a backup that quietly changes it.
   The schedule switch was written into the file and thrown away on the way
   back in, so a schedule exported switched on came back switched off and
   the drawer looked as though it had forgotten. The level and the tone
   travelled the same way. */
test('an export carries every setting, and an import reads every one back', () => {
  const src = read('app.js');
  const exp = src.match(/window\.DESKSIDE_SEED = ' \+ JSON\.stringify\(\{[^}]*\}/);
  assert.ok(exp, 'the export payload has moved; this test can no longer see it');

  ['schedulerEnabled', 'volume', 'bass', 'treble', 'theme', 'stations', 'schedule',
   'scheduleEnds', 'autoplay'].forEach(function (k) {
    assert.ok(exp[0].indexOf(k + ':') !== -1, 'an export no longer carries ' + k);
  });

  /* And the reader takes them. Exported-but-never-imported is the exact
     shape of the bug this is here for. */
  const imp = src.slice(src.indexOf('function importSettingsInto'), src.indexOf('function parseExport'));
  ['schedulerEnabled', 'volume', 'bass', 'treble'].forEach(function (k) {
    assert.ok(imp.indexOf('data.' + k) !== -1, 'importSettingsInto ignores ' + k + ', so an export loses it');
  });
  /* The drawer is where an import lands, so the draft has to carry them
     too, or the Save that follows writes the old values back. */
  const snap = src.slice(src.indexOf('function draftSnapshot'), src.indexOf('function draftIsDirty'));
  ['schedulerEnabled', 'volume', 'bass', 'treble'].forEach(function (k) {
    assert.ok(snap.indexOf(k) !== -1, 'the draft does not carry ' + k + ', so importing one changes nothing');
  });

  /* An empty schedule cannot run, whichever door the settings came in by. */
  assert.ok(/if \(!target\.schedule\.weekday\.length && !target\.schedule\.weekend\.length\) target\.schedulerEnabled = false;/.test(src),
    'an import can switch the schedule on with no slots in it');
});

/* Which version wrote a file, and when. Every older format is read and
   brought forward without asking -- what cannot be brought forward is the
   listener's memory of which file they just picked. */
test('an export says what wrote it and when', () => {
  const src = read('app.js');

  assert.ok(/var SEED_APP = 'deskside-radio';/.test(src), 'exports no longer carry a name of their own');
  assert.ok(/appVersion: APP_VERSION/.test(src), 'exports no longer say which version wrote them');
  assert.ok(/exportedAt: stampNow\(\)/.test(src), 'exports no longer carry the time they were written');
  /* Local time, to the second: this is read by somebody deciding which of
     two files on their desktop is the one they meant. */
  assert.ok(/pad\(d\.getHours\(\)\) \+ ':' \+ pad\(d\.getMinutes\(\)\) \+ ':' \+ pad\(d\.getSeconds\(\)\)/.test(src),
    'the export stamp no longer records the time to the second in local time');

  /* Unstamped files are older exports and are accepted. Somebody else's
     JSON, which says plainly it is not ours, is not. */
  assert.ok(/if \(data\.app && data\.app !== SEED_APP\) throw/.test(src),
    'an import reads any file with a stations array in it');
  assert.ok(/Imported from v' \+ from/.test(src), 'an import no longer says which version the file came from');
  assert.ok(/older than v1\.4\.8/.test(src), 'an import says nothing about a file too old to carry a version');
});

/* Each shortcut opens its own browser profile and no profile can read
   another's storage, so the file beside index.html is the only thing all
   of them can see. Read once per profile, "export from Chrome" changed
   nothing in Edge no matter how many times it was done. */
test('the settings file is read at every launch, once per version of it', () => {
  const src = read('app.js');

  assert.ok(/^  seedSettings\(boot\);$/m.test(src),
    'the settings file is read only when storage is empty again, so it cannot carry settings between browsers');
  assert.equal(/if \(stored === null\) seedSettings\(boot\); else boot\(\);/.test(src), false,
    'the first-run-only seed is back');

  /* The stamp is what stops it fighting the drawer: a file that has not
     changed is not read back over settings changed since. */
  assert.ok(/function stampOf\(text\)/.test(src), 'there is no fingerprint, so the file would be imported at every launch');
  assert.ok(/if \(stored === null \|\| state\.seedStamp !== stamp\)/.test(src),
    'the seed is taken without checking whether this profile has already taken it');

  /* A used profile keeps what is not in the file -- where its window is,
     whether it checks for updates -- so the import goes into the state
     rather than over it. */
  assert.ok(/var into = stored === null \? clone\(DEFAULTS\) : state;/.test(src),
    'a seed on a used profile resets everything, including the things the file does not carry');

  /* And a reset must not be undone by the next launch reading the same
     file straight back over the defaults. */
  const reset = src.slice(src.indexOf('function resetEverything'), src.indexOf('var resetAnim;'));
  assert.ok(/state\.seedStamp = seenSeed;/.test(reset),
    'resetting forgets which settings file was read, so the next launch imports it again');
});

/* Three things can be about to happen and the chip named two of them. A
   gap in the middle of the day is not the end of the day: the setting that
   can turn the radio off does not apply and whatever is on keeps playing.
   Calling that "Free play" -- the name of the other setting, word for word
   -- made a five-minute gap between two slots look like the drawer lying
   about being set to turn off. */
test('the next-up chip does not call a gap free play', () => {
  const src = read('app.js');
  const fn = src.slice(src.indexOf('function renderNext'), src.indexOf("el.schedToggle.addEventListener('click'"));

  assert.ok(/' · radio stays on'/.test(fn),
    'a mid-day gap no longer says the radio keeps playing when nothing follows it');

  /* A gap names the station, because it is minutes away and is the
     next thing that will be heard. The end of the day names only the
     time: it is often tomorrow, the station is a detail by then, and
     the chip has about thirty-five characters before it cuts words in
     half. */
  assert.ok(/back\.name \+ ' at ' \+ rt \+ rday/.test(fn),
    'a gap no longer names the station the schedule comes back with');
  assert.ok(/' · back ' \+ rt \+ rday/.test(fn),
    'the end of the day no longer says when the schedule picks up');

  /* And what comes after it. Saying only what stops leaves the obvious
     question unanswered -- and then what? -- which meant opening the
     drawer to find out when the schedule picks up again. The answer is
     one more step along the same walk: the change after this one. */
  assert.ok(/var after = Scheduler\.nextChange\(state\.schedule, n\.at\);/.test(fn),
    'the chip no longer looks past the gap to the slot that follows it');
  /* A day named only when it is not the day the gap starts on, so an
     evening off says Mon and a lunchtime gap does not. */
  assert.ok(/rday = after\.at\.toDateString\(\) === n\.at\.toDateString\(\) \? ''/.test(fn),
    'the resuming slot names its day even when it is the same day');

  /* And the chip is wide enough to hold it. */
  const cap = read('app.css').match(/width: var\(--next-w, (\d+)ch\); max-width: (\d+)ch;/);
  assert.ok(cap, 'the next-up chip has lost its width cap');
  assert.equal(cap[1], cap[2], 'the chip default width and its cap disagree');
  /* Four more characters than it used to need: "Radio off" is six
     longer than "Gap", and a gap now says it when the setting says so. */
  assert.ok(Number(cap[2]) >= 40,
    'the chip caps at ' + cap[2] + 'ch, which cuts the station name out of the longer wording');
  assert.ok(/var over = Scheduler\.dayIsOver\(state\.schedule, n\.at\);/.test(fn),
    'the chip no longer tells a gap from the end of the day');

  /* The setting picks the first word for both cases now that it governs
     both. Free play is still said only when the day has ended and the
     setting is Keep playing -- calling a gap that, when the gap is five
     minutes and the words are the name of the other setting, is what made
     the drawer look like it was lying. */
  assert.ok(/head = ends\[group\] === 'off' \? 'Radio off' : \(over \? 'Free play' : 'Gap'\)/.test(fn),
    'the wording no longer follows the setting');

  /* The default was a dead letter: absent was read as "keep playing" on
     the way in, so a profile that had never touched the setting was handed
     the opposite of what DEFAULTS said. */
  assert.ok(/return DEFAULTS\.scheduleEnds\[g\];/.test(src),
    'a missing scheduleEnds is read as a value again rather than as the default');
});

/* The directory has no city field -- only a region and a country, which are
   too coarse to tell two stations in the same province apart. The city that
   was searched for is the one worth printing. */
test('a found station is labelled format, bitrate, city', () => {
  const D = require('../radio-directory.js');

  assert.equal(D.taglineFor({ codec: 'AAC+', bitrate: 48, state: 'Ontario', country: 'Canada' }, 'Toronto'),
    'AAC+ · 48 kbps · Toronto');
  /* Searching by name alone has no city, so it falls back rather than
     saying nothing. */
  assert.equal(D.taglineFor({ codec: 'MP3', bitrate: 128, state: 'Ontario', country: 'Canada' }, ''),
    'MP3 · 128 kbps · Ontario');
  assert.equal(D.taglineFor({ codec: 'MP3', bitrate: 128, country: 'Canada' }, ''), 'MP3 · 128 kbps · Canada');
  /* Unknown is what the directory says when it does not know, and it is
     not a format. Empty parts are dropped, not left as gaps. */
  assert.equal(D.taglineFor({ codec: 'UNKNOWN', bitrate: 0 }, 'Toronto'), 'Toronto');
  assert.equal(D.taglineFor({}, ''), '');
  assert.equal(D.taglineFor(null, 'Toronto'), 'Toronto');

  assert.ok(/opts\.cityName = finder\.city\.name \|\|/.test(read('app.js')),
    'the city the listener searched for is not handed to the directory, so it cannot reach the tagline');
});

/* A placeholder shows the shape of the answer; a tooltip says what the box
   is for. Every box somebody types into gets both, except the two whose
   shape the browser draws itself. */
test('nothing is left showing the browser own tooltip', () => {
  /* The app draws its own now: .tip in app.css, the tooltip block in app.js.
     A title attribute left anywhere would put the grey system rectangle up
     as well -- on its own delay, in its own font, saying the same thing
     twice. The two cannot be told apart by looking at one screenshot, which
     is exactly why this is a test. */
  ['index.html', 'app.js'].forEach(function (f) {
    const src = read(f);
    assert.equal(/\stitle="/.test(src), false, f + ' still sets a native title somewhere');
  });

  const app = read('app.js');
  assert.ok(app.indexOf("'[data-tip]'") !== -1,
    'nothing looks for data-tip, so no tooltip would ever be shown');
  /* Without the popover it is an ordinary child of .tuner, which sets
     overflow: hidden -- and every tooltip in the top bar is cut off. */
  assert.ok(app.indexOf("setAttribute('popover'") !== -1,
    'the tooltip is no longer a popover, so the cabinet will clip it');
  assert.ok(read('app.css').indexOf('.tip:popover-open') !== -1,
    'the sheet has no rule for an open tooltip');
});
test('every box in the drawer says what it is for', () => {
  const app = read('app.js');
  const html = read('index.html');

  [['name', 'Station name'], ['band', '1010 AM'], ['url', 'https://stream.example.com/live.mp3'],
   ['tag', 'AAC+']].forEach(function (pair) {
    const re = new RegExp('data-k="' + pair[0] + '"[^>]*placeholder="' + pair[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    assert.ok(re.test(app), 'the ' + pair[0] + ' box has lost its placeholder');
  });
  ['name', 'band', 'url', 'tag', 'color', 'start', 'end'].forEach(function (k) {
    const i = app.indexOf('data-k="' + k + '"');
    assert.ok(i !== -1, 'the ' + k + ' box is gone');
    assert.ok(app.slice(i, i + 400).indexOf('data-tip="') !== -1,
      'the ' + k + ' box has no tooltip saying what it is for');
  });
  ['cityInput', 'stationInput'].forEach(function (id) {
    const i = html.indexOf('id="' + id + '"');
    assert.ok(i !== -1, id + ' is gone');
    assert.ok(html.slice(i - 200, i + 300).indexOf('data-tip="') !== -1, id + ' has no tooltip');
    assert.ok(html.slice(i - 200, i + 300).indexOf('placeholder="') !== -1, id + ' has no placeholder');
  });
});

/* Every release page opens with the same block: download this one file,
   double-click it, and what to do instead on a Mac or on Linux. It is the
   first thing anyone arriving at the page needs, and 1.4.8 went out
   without it -- the body was built from version.json alone, which holds
   what changed and nothing about how to get it. Composing the body from
   both is what stops that being a thing anyone has to remember. */
test('a release page always opens with how to install it', () => {
  const header = read('docs/release-header.md');

  /* The two audiences the block exists to serve. */
  assert.ok(header.indexOf(INSTALLER) !== -1,
    'the release header no longer names the file to download');
  assert.ok(/macOS/.test(header) && /Linux/.test(header),
    'the release header no longer tells a Mac or Linux reader what to take instead');
  assert.ok(header.indexOf('deskside-radio.zip') !== -1,
    'the release header no longer names the archive for the platforms the installer cannot serve');
  /* It is the top of the page, so it ends before the notes begin. */
  assert.equal(/^---$/m.test(header), false,
    'the release header carries its own divider; release-notes.js adds one and there would be two');

  /* And the body is built from it rather than typed out again. */
  const tool = read('tools/release-notes.js');
  assert.ok(tool.indexOf("read('docs/release-header.md')") !== -1,
    'tools/release-notes.js no longer reads the header, so a release could go out without it');
  assert.ok(/JSON\.parse\(read\('version\.json'\)\)\.notes/.test(tool),
    'tools/release-notes.js no longer takes the notes from version.json, so the page and the app could disagree');
});

/* What changed, in points. The notes are read on a release page by
   somebody deciding whether to bother updating, and a single unbroken
   paragraph of prose is not something anybody reads standing up. */
test('the release notes are concise, and in point form', () => {
  const notes = JSON.parse(read('version.json')).notes;
  const lines = notes.split('\n').filter(function (l) { return l.trim(); });

  const points = lines.filter(function (l) { return l.indexOf('- ') === 0; });
  const heads = lines.filter(function (l) { return l.indexOf('#') === 0; });
  assert.ok(points.length >= 3, 'the release notes are not in point form');
  assert.equal(points.length + heads.length, lines.length,
    'the release notes carry loose prose outside the points and headings');

  /* Two lists, and the reader picks the one they came for: what is new, or
     what was broken. Every release page is built this way, back to 1.0.0,
     so the headings are fixed rather than invented per release. A release
     that is all fixes simply has no features list. */
  const ALLOWED = ['## New features & enhancements', '## Bug fixes'];
  assert.ok(heads.length >= 1, 'the release notes have no section heading');
  heads.forEach(function (h) {
    assert.ok(ALLOWED.indexOf(h.trim()) !== -1,
      'unexpected release-note heading ' + JSON.stringify(h.trim())
        + '; the two are ' + JSON.stringify(ALLOWED));
  });
  /* And in that order where both are there: what is new leads. */
  if (heads.length === 2) {
    assert.equal(heads[0].trim(), ALLOWED[0], 'the bug fixes are listed before the new features');
  }

  /* Concise means a point, not a paragraph folded into a bullet. 320
     characters is the aim and 350 is the limit: the difference is there so
     a point that genuinely needs one more clause can have it, rather than
     being split into two bullets that read worse than the one. Past 350 it
     has stopped being a point. */
  points.forEach(function (p) {
    assert.ok(p.length <= 350,
      'this point has become a paragraph at ' + p.length + ' characters (aim for 320, 350 at the outside): '
        + p.slice(0, 60) + '...');
  });
  /* And the whole thing stays readable on one screen. */
  assert.ok(notes.length <= 3000, 'the release notes have grown back into an essay (' + notes.length + ' chars)');
});

/* A height only means anything alongside the face it was measured against:
   the console theme sits at 700 and the dial wants 744 (both measured). So
   a box carries the theme it was taken under.

   This was not reachable until the settings file began to be read at every
   launch. That file names a theme, it is read before the window is put
   back, and the box being put back belonged to the theme being left -- so
   the radio came up one launch later wearing a scrollbar. */
test('a remembered window size knows which theme it was measured against', () => {
  const app = read('app.js');

  const remember = app.slice(app.indexOf('function rememberBox'), app.indexOf('function restoreBox'));
  assert.ok(/t: state\.theme/.test(remember), 'the saved box no longer records its theme');
  assert.ok(/had\.t === box\.t/.test(remember),
    'the box is compared without its theme, so a theme change alone would never be written');
  /* The drawer grows the window and gives it back; a timer landing in
     between must not keep the borrowed height. */
  assert.ok(/if \(borrowedBox\) return;/.test(remember),
    'the size can be saved while Settings has the window on loan');

  const restore = app.slice(app.indexOf('function restoreBox'), app.indexOf('function fitWindow'));
  assert.ok(/box\.t == null \|\| box\.t === state\.theme/.test(restore),
    'a size measured against another theme is restored again');
  /* The position is not the size. Where the window sits is the listener's
     whatever it is showing. */
  assert.ok(/window\.moveTo\(x, y\)/.test(restore),
    'the restore no longer puts the window back where it was');

  /* And the net under all of it, which has to catch a box that is wrong
     in either direction.

     Too small was always caught: the page overruns and there is a
     scrollbar down the side of the cabinet. Too big was caught by nothing,
     and was the worse of the two, because nothing could undo it -- the box
     is written on a timer whether or not the window was ever fitted, so a
     launch that never got as far as fitting wrote its own wrong size down,
     the next launch restored it and kept it (the page fits inside a window
     that is too big), and wrote it down again. Measured: a window left
     279px taller than the radio, permanently, with a band of dead space
     above and below it. */
  const size = app.slice(app.indexOf('function sizeWindow'), app.indexOf('function sizeWindow') + 2400);
  assert.ok(/scrollHeight > window\.innerHeight \+ 1/.test(size),
    'nothing checks whether the restored box is too small for the radio');
  assert.ok(/window\.outerHeight - wantedBox\(\)\.h > BOX_SLACK/.test(size),
    'nothing checks whether the restored box is too big for the radio, which nothing else can undo');
  assert.ok(/keepBox = false;\s*\n\s*fitWindow\(\);/.test(size),
    'a window that does not match the radio is never refitted');

  /* One piece of arithmetic, not two. They used to have a copy each and
     the copies asked different questions -- what the window should be, and
     merely whether the page overran -- which is how a window left too big
     satisfied one and was never handed to the other. */
  assert.ok(/function wantedBox\(\)/.test(app),
    'the wanted size is worked out in more than one place again');
  const fit = app.slice(app.indexOf('function fitWindow'), app.indexOf('function fitWindow') + 1200);
  assert.ok(/var want = wantedBox\(\);/.test(fit),
    'fitWindow measures the window itself instead of asking wantedBox');
  assert.equal(/getComputedStyle\(document\.body\)/.test(fit), false,
    'fitWindow has its own copy of the measurement again');
});

/* The tone belongs to the station, and was only ever loaded by tune() --
   which runs when the radio is playing. Choosing a station on a stopped
   set takes a different path entirely, so the sliders went on showing the
   station before it. That reading was wrong, and acting on it was worse:
   rememberTone writes both values through to the current station, so one
   nudge of the bass copied the previous station's treble onto this one. */
test('the tone controls follow the station, playing or stopped', () => {
  const app = read('app.js');
  const render = app.slice(app.indexOf('function renderStation'), app.indexOf('function renderPresets'));
  assert.ok(/loadTone\(st\);/.test(render),
    'renderStation no longer loads the station tone, so a stopped set keeps the previous tone');

  /* rememberTone writes to whichever station is current, which is only
     safe while the sliders are known to be showing that station. */
  const remember = app.slice(app.indexOf('function rememberTone'), app.indexOf('function loadTone'));
  assert.ok(/st\.bass = state\.bass;/.test(remember) && /st\.treble = state\.treble;/.test(remember),
    'the tone is no longer written through to the station it belongs to');

  /* And the level is saved, debounced, rather than per input event. */
  assert.ok(/volumeSaveTimer = setTimeout\(save, 250\);/.test(app),
    'the volume is no longer written to storage after a drag settles');
  assert.ok(/window\.addEventListener\('pagehide', rememberBox\);/.test(app),
    'the window box is no longer written on the way out');
});

/* A handover fades the sound down and back up, and the control it belongs
   to should be seen doing it -- sound going away with nothing on screen
   accounting for it reads as a fault rather than as a changeover.

   This was written once and only half worked. It set --turn, which is the
   number a theme drawn as a knob turns its cap by, and left the value
   alone -- so the knob themes moved and every theme whose fader is an
   ordinary slider did not, because a range input's thumb is placed by its
   value. Reported as "I don't see this happening", which it mostly was. */
test('the volume control moves with a scheduled fade', () => {
  const app = read('app.js');
  const paint = app.slice(app.indexOf('function paintFade'), app.indexOf('/* Ramped on a timer'));

  assert.ok(/state\.volume \* fadeMul/.test(paint),
    'the fader is no longer drawn at the level being heard');
  assert.ok(/input\.value = shown/.test(paint),
    'paintFade sets a custom property but never moves the control, so a slider theme shows nothing');
  /* --turn is what a knob theme rotates its cap by, and --lit-x is which
     lamp the 8-bit face lights. Both come from markFader, and paintFade has
     to go through it rather than keep a copy: when it kept its own turn the
     knobs followed a fade and the lamps did not. */
  assert.ok(/markFader\(input\)/.test(paint),
    'paintFade works out the mark itself again, so only some faces follow a fade');
  const mark = app.slice(app.indexOf('function markFader'), app.indexOf('function markFader') + 1400);
  assert.ok(/setProperty\('--turn'/.test(mark),
    'the knob themes have lost the number they turn their cap by');
  assert.ok(/setProperty\('--lit-x'/.test(mark),
    'the lamp faces have lost the position of the lit lamp');

  /* The setting is not the fade. What is stored, and what comes back, is
     where the listener left it. */
  const setv = app.slice(app.indexOf('function setVolume'), app.indexOf('function markFader'));
  assert.equal(/el\.volume\.value = v;/.test(setv), false,
    'setVolume writes the control again, which stamps the setting over a fade in progress');
  assert.ok(/state\.volume = v;/.test(setv), 'setVolume no longer records the setting');

  /* And a finger on the fader wins while it is there. */
  assert.ok(/var draggingFader = false;/.test(app), 'nothing tracks a drag, so a fade would fight the thumb');
  assert.ok(/if \(!draggingFader\) \{/.test(paint),
    'a fade can move the thumb out from under a drag');
  assert.ok(/'pointerup', 'pointercancel'/.test(app),
    'a drag that ends off the control would leave the fader stuck to the pointer');
});

/* The installer closes the radio before it writes, and opens it again
   after. Unpacking over a running radio mostly works -- Chrome reads
   index.html at load and does not hold it -- but Windows will not move a
   folder a running browser sits in, so the profile rename failed silently
   and the next launch started an empty profile: the radio came up with
   none of the listener's stations. That is the outcome this prevents.

   What it may close is the narrow thing, and the narrowness is the whole
   safety argument: three browser names, and only where the process's own
   command line names this app's profile folder. Measured on a machine
   with 37 browser processes running: 10 selected (the radio and its own
   children), 27 ordinary Chrome left alone. */
test('the installer closes the radio, and nothing else', () => {
  const src = read(INSTALLER);
  const block = src.slice(src.indexOf('close the radio first'), src.indexOf('put it in place'));

  assert.ok(/Stop-Process -Id \$p\.ProcessId -Force/.test(block), 'the installer no longer closes the radio');
  /* By name AND by profile path. Either alone is wrong: the name alone
     closes somebody's browser, and the path alone would match anything
     that happened to mention the folder -- this script included, which is
     why it is a .cmd and not one of these three. */
  assert.ok(/'chrome\.exe', 'msedge\.exe', 'firefox\.exe'/.test(block),
    'the set of things that may be closed is no longer three browsers');
  assert.ok(/\$names -contains \$_\.Name/.test(block) && /CommandLine -like '\*DesksideRadio.profile\*'/.test(block),
    'the installer no longer requires BOTH the browser name and this app\'s profile path');

  /* After the download, so a failed download never costs somebody the
     window they were listening to. */
  assert.ok(src.indexOf('close the radio first') > src.indexOf('Downloaded and checked'),
    'the radio is closed before the download is known to be good');

  /* And opened again, because closing it and leaving it closed is worse
     than not having closed it. */
  assert.ok(/call :reopen/.test(src) && /^:reopen$/m.test(src), 'a closed radio is never reopened');
  assert.ok(/Invoke-Item -LiteralPath \$p/.test(src),
    'the radio is reopened by some other route than its own shortcut');
  assert.ok(/if \/i "%CLOSEDB%"=="F" set "RELNK=Deskside Radio \(Firefox\).lnk"/.test(src),
    'a Firefox radio would come back in the wrong browser');

  /* Inside a quoted -Command line cmd does not process the caret, so ^|
     arrives at PowerShell as a literal caret and the block dies with
     "Unexpected token". That is what had the 1.4.2 uninstaller reporting
     success while removing nothing, and it would silently disable this. */
  const bad = src.match(/"[^"\n]*\^\|/g) || [];
  assert.equal(bad.length, 0,
    'a pipe is escaped as ^| inside a quoted -Command line: ' + JSON.stringify(bad[0] || ''));
});

/* And the other half: when the rename cannot happen anyway -- something
   still in the old folder, or a launch that never went through the
   installer -- the launcher keeps using the old profile rather than
   starting an empty one. An empty profile is the alarming outcome: the
   radio comes up with no stations and nothing says why. */
test('a profile that could not be renamed is still used', () => {
  ['Win - Open Deskside Radio.cmd', 'Win - Create Desktop Shortcut (Chrome).cmd',
   'Win - Start with Windows (On-Off).cmd'].forEach(function (f) {
    const s = read(f);
    assert.ok(/if not exist "%PROFILE%\\" if exist "%LOCALAPPDATA%\\DesksideRadio\\profile\\" set "PROFILE=%LOCALAPPDATA%\\DesksideRadio\\profile"/.test(s),
      f + ' starts an empty profile when the rename could not happen');
    /* The fallback has to come after the move, or it reads the old folder
       before the move has had its chance. */
    assert.ok(s.indexOf('move "%LOCALAPPDATA%') < s.lastIndexOf('set "PROFILE=%LOCALAPPDATA%\\DesksideRadio\\profile"'),
      f + ' falls back to the old profile before trying to rename it');
  });
});

/* An update replaces the files under a closed radio, so by the time
   anybody sees anything the installer's window has gone. The readout is
   the one place left to say which version is now running, and it says it
   once: five flashes, then back to the station.

   Traced in a browser from document-start: the text appears at 24ms, goes
   dark at 206, 572, 922, 1289 and 1656, and the station returns at 1839
   with the fade running. */
test('the readout says the version once, after an update', () => {
  const js = read('app.js');
  const css = read('app.css');

  /* Which version last ran here. Absent is a first install, which has
     nothing to announce -- the number is stamped quietly instead. */
  assert.ok(/ranVersion: null,/.test(js), 'nothing records which version last ran');
  const boot = js.slice(js.indexOf('var ranBefore = state.ranVersion;'), js.indexOf('var ranBefore = state.ranVersion;') + 320);
  /* An install that has been running for weeks has no version recorded if
     it last ran a build older than 1.4.12, because nothing before that
     wrote the field. Treating that as a first install is what swallowed
     the announcement on the first update that carried it. Empty storage is
     what a first install actually looks like. */
  assert.ok(/var wasHere = ranBefore \|\| stored !== null;/.test(boot),
    'a profile with settings but no recorded version is taken for a first install');
  assert.ok(/if \(wasHere\) announceVersion\(\);/.test(boot),
    'the announcement no longer follows that test');
  assert.ok(boot.indexOf('state.ranVersion = APP_VERSION;') < boot.indexOf('announceVersion'),
    'the version is announced before it is recorded, so a crash would repeat it for ever');

  /* The timings are in two files and have to agree: a flash count that
     disagrees with the animation is a readout that either goes dark or
     cuts itself off mid-word. */
  const flashes = js.match(/var ANNOUNCE_FLASHES = (\d+);/);
  const step = js.match(/var ANNOUNCE_STEP_MS = (\d+);/);
  assert.ok(flashes && step, 'the announcement timings are gone from app.js');
  const anim = css.match(/\.display-name\.is-announcing \{ animation: name-flash ([\d.]+)s linear (\d+); \}/);
  assert.ok(anim, 'the flash animation is gone from app.css');
  assert.equal(Number(flashes[1]) - 1, Number(anim[2]),
    'app.js blinks ' + flashes[1] + ' times, so the snap should run ' + (Number(flashes[1]) - 1)
      + ' and the last blink be the fade; the animation runs ' + anim[2]);

  /* That last blink: a fade out, held dark by forwards through the beat
     before the station arrives. */
  const out = css.match(/\.display-name\.is-fading \{ animation: name-fade-out ([\d.]+)s linear forwards; \}/);
  assert.ok(out, 'the last blink no longer goes out and stays out');
  /* Taken from the step rather than written out, so changing the blink
     rate carries the fade and the lit stretch with it. */
  assert.ok(/var ANNOUNCE_FADE_MS = Math\.round\(ANNOUNCE_STEP_MS \* 0\.05\);/.test(js),
    'the last blink no longer goes out at the same speed as the other four');
  const gapMs = js.match(/var ANNOUNCE_GAP_MS = (\d+);/);
  assert.ok(gapMs, 'the dark beat is gone from app.js');
  const fadeMs = [null, String(Math.round(Number(step[1]) * 0.05))];
  assert.ok(Number(gapMs[1]) >= Number(step[1]) * 0.5,
    'the pause is ' + gapMs[1] + 'ms, too short to read as the end of the announcement');

  /* And the fifth blink gets its own lit stretch before it goes out. A
     flash cycle ends lit -- its last 5% ramps the text back up for the
     next one -- so starting the fade the moment the fourth cycle ends
     showed the fifth blink for 65ms and took it away again. A stutter,
     reported off a screen recording. */
  assert.ok(/var ANNOUNCE_ON_MS = Math\.round\(ANNOUNCE_STEP_MS \* 0\.45\);/.test(js),
    'the lit part of a blink is no longer taken from the step');
  assert.ok(/ANNOUNCE_MS = \(ANNOUNCE_FLASHES - 1\) \* ANNOUNCE_STEP_MS \+ ANNOUNCE_ON_MS;/.test(js),
    'the last blink is cut off the instant the fourth cycle ends, which is the stutter');
  assert.equal(Math.round(parseFloat(out[1]) * 1000), Number(fadeMs[1]),
    'the fade-out animation is ' + out[1] + 's and app.js waits ' + fadeMs[1] + 'ms');
  assert.ok(Number(gapMs[1]) > 0, 'there is no dark beat between the announcement and the station');

  /* And the readout is never seen at full between the two: the classes are
     exchanged in one go rather than over two frames. */
  const backFn = js.slice(js.indexOf('var back = function () {'), js.indexOf('var leave = function () {'));
  assert.ok(backFn.indexOf("remove('is-fading')") < backFn.indexOf("add('is-returning')"),
    'the fade-out is dropped after the return is added');
  assert.equal(/void el\.name\.offsetWidth;/.test(backFn), false,
    'the hand-back forces a reflow between the two classes, which shows one frame of the name at full');
  assert.equal(Number(step[1]), Math.round(parseFloat(anim[1]) * 1000),
    'app.js steps every ' + step[1] + 'ms and the animation is ' + anim[1] + 's');

  /* Capitals, like every other alert on the front. Set in the string and
     not with text-transform: two themes build the readout a character at a
     time -- the departures board out of flaps, the console out of segment
     cells -- and both read the text itself rather than what CSS would have
     painted. */
  const said = js.match(/TunerUI\.setName\(el\.name, '([^']+)' \+ APP_VERSION\)/);
  assert.ok(said, 'the announcement no longer names the version');
  assert.equal(said[1], said[1].toUpperCase(), 'the announcement is not in capitals: ' + said[1]);
  const pvSaid = read('previews/update-notice.html').match(/write\(n, '(UPDATED[^']*)'\)/);
  assert.ok(pvSaid, 'the preview no longer shows the announcement in capitals');

  /* Back at the speed the pill arrives at: the two are the only things on
     the face that announce themselves. */
  const back = css.match(/\.display-name\.is-returning \{ animation: name-return ([\d.]+)s ease-out; \}/);
  const pill = css.match(/\.update-pill \{ animation: update-pill-in ([\d.]+)s ease-out; \}/);
  assert.ok(back && pill, 'the return fade or the pill fade is gone');
  assert.equal(back[1], pill[1], 'the readout and the pill no longer arrive at the same speed');

  /* One way in to the readout. Guarding renderStation alone was not
     enough: applyLook sets the name too, and replaced the announcement
     three milliseconds after it appeared. */
  assert.ok(/function showName\(text\) \{\s*\n\s*if \(announcing\) return;/.test(js),
    'the readout has no single guarded way in');
  const direct = js.match(/TunerUI\.setName\(el\.name,/g) || [];
  assert.equal(direct.length, 3,
    'there are ' + direct.length + ' direct writes to the readout; only three may exist -- showName itself,'
      + ' the announcement, and the hand-back that ends it');

  /* And the preview shows it, on the same numbers. */
  const preview = read('previews/update-notice.html');
  assert.ok(/id="annName"/.test(preview), 'the preview page no longer shows the announcement');
  /* Read off the app rather than written out here, or slowing the flash
     down means editing four files and remembering the fourth. */
  const pv = preview.match(/STEP = (\d+), FLASHES = (\d+)/);
  assert.ok(pv, 'the preview no longer runs the announcement');
  assert.equal(pv[1], step[1],
    'the preview flashes every ' + pv[1] + 'ms and the app every ' + step[1]);
  assert.equal(pv[2], flashes[1],
    'the preview flashes ' + pv[2] + ' times and the app ' + flashes[1]);

  /* The preview has a second copy of the timing, in its own stylesheet,
     and changing only the script left the page blinking at the old rate
     while its timer waited for the new one. Both halves, or neither. */
  const pvCss = preview.match(/\.ann-name\.is-announcing \{ animation: ann-flash ([\d.]+)s linear (\d+); \}/);
  assert.ok(pvCss, 'the preview flash animation is gone');
  assert.equal(Math.round(parseFloat(pvCss[1]) * 1000), Number(step[1]),
    'the preview animates every ' + pvCss[1] + 's while its script steps every ' + step[1] + 'ms');
  assert.equal(Number(pvCss[2]), Number(flashes[1]) - 1,
    'the preview animation runs ' + pvCss[2] + ' times; it should snap ' + (Number(flashes[1]) - 1)
      + ' times and fade the last');
  assert.ok(/\.ann-name\.is-fading \{ animation: ann-fade-out/.test(preview),
    'the preview no longer takes the last blink out and leaves it out');
  assert.ok(/\}, STEP \* \(FLASHES - 1\) \+ ON\);/.test(preview),
    'the preview cuts the last blink short, which is the stutter');
  /* Read off the app, not written out here: the dark beat has already been
     lengthened once and a hardcoded number means editing this file to do
     it, which is how the preview fell behind the app before. */
  const pvGap = preview.match(/FADE = (\d+), GAP = (\d+)/);
  assert.ok(pvGap, 'the preview no longer runs the fade-out and the beat');
  assert.equal(pvGap[1], fadeMs[1],
    'the preview fades out over ' + pvGap[1] + 'ms and the app over ' + fadeMs[1]);
  assert.equal(pvGap[2], gapMs[1], 'the preview holds dark for ' + pvGap[2] + 'ms and the app for ' + gapMs[1]);
});


/* ---- the radio keeping itself up to date ------------------------------

   All of this runs unattended, in a console nobody can see, on somebody
   else's machine, at most once a day. Every one of these guards is a thing
   that was wrong at some point in an afternoon of measuring it. */

test('the launcher is gone before the extract can reach the launcher', () => {
  /* The measured failure, and the reason the hand-over exists.

     The zip carries the opener, so extracting replaces the file that is
     running. cmd reads a batch file a line at a time, by byte offset, out
     of whatever is on disk when it wants the next line -- so the opener
     carried on at its old offset inside a different, shorter file, hit the
     end, and stopped. It never wrote its stamp, so every launch after that
     went out and checked again. The same offset landing mid-line in a
     LONGER file runs whatever the rest of that line happens to say.

     So: the work is handed to a script in %TEMP%, which the extract does
     not reach, and the opener ends with `exit` and not `exit /b`. `exit /b`
     returns to the line after the call, and finding that line means reading
     this file again. `exit` ends cmd where it stands. */
  const cmd = read('Win - Open Deskside Radio.cmd');

  const step = /set "STEP=%TEMP%\\[^"]+\.cmd"/.test(cmd);
  assert.ok(step, 'the update step is no longer written to %TEMP%');

  const start = cmd.indexOf('start "" /b');
  assert.ok(start !== -1, 'the launcher no longer starts the update detached');
  assert.ok(/start "" \/b [^\n]*cmd\.exe" \/c "%STEP%"\s*\r?\nexit\s*$/m.test(cmd),
    'the line after the hand-over is not a bare `exit` -- `exit /b`, or anything ' +
    'else at all, means reading this file after the extract has replaced it');

  assert.equal(/call "%RUNNER%"/.test(cmd.slice(start)), false,
    'the launcher calls the installer itself again instead of handing it over');
});

test('the launcher looks at every launch, with nothing that can decline', () => {
  /* There was a daily stamp here and it had to go, because of what it did
     on the one day it mattered. The app notices a release at noon; the
     listener clicks the notice, is offered "close the radio and open it
     again to apply the update", does exactly that -- and nothing happens,
     because the launcher looked this morning and considers the day done.
     An offer that quietly declines is worse than no offer.

     So: no stamp, no interval, nothing that remembers having asked. It
     costs about a kilobyte per launch and is self-limiting anyway, since
     once the update is in there is nothing left to fetch. */
  const cmd = read('Win - Open Deskside Radio.cmd');
  assert.equal(/STAMP|last-update-check/.test(cmd), false,
    'the launcher remembers having checked again -- which makes the dialog\'s ' +
    'offer to close the radio a thing that sometimes does nothing');
  assert.equal(/--retry/.test(cmd), false,
    'the fetch retries within a launch, when the next launch is already the retry');
});

test('the update lock is read where its value can be compared', () => {
  /* Measured: two radios open, both updated. cmd expands %LOCKDAY% when it
     PARSES the block, which is before any line inside the block has run --
     so the read filled the variable and the comparison was still looking at
     the empty string it held a moment earlier. The read has to sit on its
     own line. The stamp check above it never had the bug because it was
     never wrapped in a block, which is exactly why this pins the shape. */
  const cmd = read('Win - Open Deskside Radio.cmd');
  assert.ok(/^if exist "%LOCK%" set \/p LOCKDAY=<"%LOCK%"$/m.test(cmd),
    'LOCKDAY is not read on a line of its own -- inside a parenthesised block its ' +
    'value is expanded before the read that fills it, and the comparison is ' +
    'always against nothing');
  assert.ok(/^if "%LOCKDAY%"=="%TODAY%" exit \/b 0$/m.test(cmd),
    'the lock is no longer compared against today, so a crash wedges it shut for good');
});

test('every way the update can fail ends quietly, not at a stop', () => {
  /* The radio is already open and playing. Offline, behind a proxy, a
     read-only folder, GitHub down, a version string that will not parse:
     every one of them is a reason to go quiet and try again tomorrow, and
     none of them is a reason to put something on the screen. */
  const cmd = read('Win - Open Deskside Radio.cmd');
  const block = cmd.slice(cmd.indexOf(':autoupdate'));

  assert.equal(/^\s*(echo|pause)\b/m.test(block.replace(/^\s*echo %TODAY%$/gm, '')), false,
    'the auto-update block says something out loud, in a console nobody opened');

  const fails = block.match(/goto :nothingtodo/g) || [];
  assert.ok(fails.length >= 5,
    'only ' + fails.length + ' failure paths reach the quiet exit -- one that does ' +
    'not leaves the lock behind, and the lock is dated, so nothing updates again today');
  assert.ok(/^:nothingtodo$[\s\S]*?del \/q "%LOCK%"/m.test(block),
    'the quiet exit no longer drops the lock, so one failure blocks the rest of the day');
});

test('the unattended install asks nothing and opens nothing', () => {
  /* Quiet mode is one variable, so the thing that runs unattended is the
     same script that has been run by hand for months. What it must not do
     is anything that waits for a person who is not there, or that touches
     the radio somebody is listening to. */
  const cmd = read('Win-Install-or-Update-Deskside-Radio.cmd');

  assert.ok(/if defined DESKSIDE_QUIET set "DESKSIDE_NOPAUSE=1"/.test(cmd),
    'quiet mode no longer implies no pausing');
  assert.ok(/if defined DESKSIDE_QUIET goto :radioleftalone/.test(cmd),
    'the unattended update closes the radio somebody is listening to');
  assert.ok(/if defined DESKSIDE_QUIET goto :haveshortcut/.test(cmd),
    'the unattended update stops to ask which browser, with nobody there');
  assert.ok(/if not defined DESKSIDE_QUIET pause/.test(cmd),
    'the unattended update waits for a keypress at the end');

  /* And it does not go and fetch a different installer. Self-refresh is
     right when somebody is watching -- it lets a years-old copy still do
     the newest thing -- and wrong when nobody is: what comes back may be
     OLDER than this file, and an installer older than auto-update knows
     nothing of quiet mode. It would print a banner, close the playing
     radio and stop at a pause, in a window started hidden that cannot be
     answered or even found. */
  const refresh = cmd.indexOf('set "NEWCMD=');
  const guard = cmd.indexOf('if defined DESKSIDE_QUIET goto :newest');
  assert.ok(guard !== -1 && guard < refresh,
    'quiet mode can still replace itself with whatever is published, which may be ' +
    'an installer that pauses in a console nobody can see');
});

test('the unattended install still checks the archive before it writes', () => {
  /* The one thing quiet mode must NOT skip. A truncated download has to be
     nothing having happened, not half an app -- and there is nobody there
     to notice which. */
  const cmd = read('Win-Install-or-Update-Deskside-Radio.cmd');
  const list = cmd.indexOf('-tf');
  const extract = cmd.indexOf('-xf');
  assert.ok(list !== -1, 'the installer no longer lists the archive before extracting it');
  assert.ok(list < extract, 'the archive is extracted before it is checked');
  assert.equal(/if defined DESKSIDE_QUIET[^\n]*(-tf|:extract)/.test(cmd), false,
    'quiet mode skips the archive check');
});

test('the switch the launcher reads is the file the switch script writes', () => {
  /* Two files, one string, and nothing to make them agree. The switch is a
     marker in the app folder rather than a setting in the app because the
     app's settings live in the browser's storage, which a batch file has no
     way to read -- so a typo in either name is a switch that silently does
     nothing. */
  const opener = read('Win - Open Deskside Radio.cmd');
  const script = read('Win - Automatic Updates.cmd');
  const MARK = 'assets\\auto-update-off.txt';

  assert.ok(opener.indexOf(MARK) !== -1, 'the launcher no longer looks for ' + MARK);
  assert.ok(script.indexOf(MARK) !== -1, 'the switch script no longer writes ' + MARK);
  assert.ok(/if exist "%APPDIR%assets\\auto-update-off\.txt" exit \/b 0/.test(opener),
    'the launcher finds the marker and carries on updating anyway');

  /* Read before anything else in the block, so off costs one Test-Path and
     not a network request. */
  const off = opener.indexOf('auto-update-off.txt');
  const feed = opener.indexOf('set "FEED=');
  assert.ok(off !== -1 && feed !== -1 && off < feed,
    'the switch is read after the fetch is set up, so off still goes to the network');

  /* Both directions, and neither of them installs anything. */
  assert.ok(/:turnoff/.test(script) && /:turnon/.test(script), 'the switch only goes one way');
  assert.equal(/reg(\.exe)? +add|schtasks/i.test(script), false,
    'the switch writes to the registry or makes a scheduled task');
});

test('nothing in the update path installs anything that outlives it', () => {
  /* The promise both readmes make, in those words, and the reason option C
     was turned down in the plan: no service, no scheduled task, no Run key,
     nothing left running. The opener does one more thing on its way past
     and exits, which is what a scheduled task would have been for, without
     being one -- and without being the textbook shape of persistence
     malware, which is blocked on managed machines and deserves to be. */
  ['Win - Open Deskside Radio.cmd', 'Win - Automatic Updates.cmd'].forEach(function (f) {
    const src = read(f);
    assert.equal(/schtasks|Register-ScheduledTask/i.test(src), false, f + ' makes a scheduled task');
    assert.equal(/CurrentVersion\\Run/i.test(src), false, f + ' writes a Run key');
  });
});

test('the readmes describe updating as it now happens', () => {
  /* It used to promise, in bold, that nothing was downloaded or replaced
     until you asked for it. That promise is gone, and going quiet about it
     would be worse than having made it. */
  ['README.md', 'User Reference Guide.html'].forEach(function (f) {
    const doc = read(f);
    assert.equal(/Nothing is downloaded or replaced until you ask for it/.test(doc), false,
      f + ' still makes a promise the radio no longer keeps');
    assert.ok(/Nothing is installed to make that happen/.test(doc),
      f + ' does not say what is still true: that nothing is installed to do the updating');
    assert.ok(/Win - Automatic Updates\.cmd/.test(doc),
      f + ' does not say how to turn the updating off');
  });
});


test('the page can read what is on disk, which is not what is running', () => {
  /* The one thing the notice could not know before, and the thing that
     decides what it should say. The launcher fetches a new version while
     the radio plays, so the files on disk run ahead of the page reading
     them until the radio is opened again.

     file:// blocks fetch and XHR and allows a script tag -- the same door
     the settings seed comes through -- so the build writes the number as
     JavaScript as well as the text line the batch file reads. Both, from
     one source, or they drift and the dialog starts lying in the other
     direction. */
  const build = read('tools/build-dist.js');
  assert.ok(/version\.js/.test(build), 'the build no longer writes assets/version.js');
  assert.ok(/window\.DESKSIDE_ON_DISK = /.test(build),
    'the probe no longer sets the global the page reads');

  const both = build.match(/JSON\.parse\(read\('version\.json'\)\)\.version/g) || [];
  assert.ok(both.length >= 2,
    'version.txt and version.js no longer come from the same place, so they can drift');

  const app = read('app.js');
  assert.ok(/s\.src = 'assets\/version\.js\?' \+ Date\.now\(\)/.test(app),
    'the probe is no longer read fresh -- a cached read reports the version this ' +
    'window loaded with, which is the one case it exists to tell apart');
  assert.ok(/s\.onerror = function \(\) \{ s\.remove\(\); res\(null\); \}/.test(app),
    'a folder with no version.js throws instead of reading as nothing pending');
});

test('the update dialog says a different thing in each of its two states', () => {
  /* Pending on this machine and published but not yet fetched need
     different answers, and giving both the same one is what the dialog was
     built to stop. */
  const app = read('app.js');
  const html = read('index.html');

  assert.ok(/id="updateReady"/.test(html), 'the update dialog is gone');
  assert.ok(/update is pending on this machine/.test(app),
    'the pending wording is gone');
  assert.ok(/has been published on GitHub/.test(app),
    'the not-yet-fetched wording is gone');
  /* The launch-later part is the one that reads as a fault unless it is
     accounted for, and it is accounted for as a picture rather than a
     sentence: published, fetched next launch, running the launch after. */
  assert.ok(/id="updateSteps"/.test(html),
    'the dialog no longer shows why the new version runs a launch later, which ' +
    'reads as a fault rather than a design');
  assert.ok(/\.update-steps\[hidden\] \{ display: none; \}/.test(read('app.css')),
    'the steps set display in an author rule with nothing to restore hidden, so ' +
    'they are drawn in the state that has no steps to show');
  assert.ok(/\$\('updateSteps'\)\.hidden = true;/.test(app) &&
            /\$\('updateSteps'\)\.hidden = false;/.test(app),
    'the steps are not turned off again for the already-on-this-machine state, ' +
    'where there is nothing left to wait for');

  /* The button only appears where closing the radio actually achieves
     something. */
  const at = app.indexOf('function openUpdateNotice');
  const fn = app.slice(at, app.indexOf('\n  }\n', at));
  assert.ok(/go\.value = 'close'/.test(fn) && /go\.value = 'ok'/.test(fn),
    'both states offer the same button, so one of them offers to close the radio ' +
    'for an update that has not been downloaded');
  assert.ok(/cancel\.hidden = true/.test(fn),
    'the not-yet-fetched state still offers a Cancel beside a button that does nothing');

  /* And only on Windows, where a launcher is actually fetching. */
  assert.ok(/if \(!onWindows\(\)\) return;/.test(app),
    'the dialog opens off Windows, where nothing fetches anything and the releases ' +
    'page is the whole answer');
  assert.ok(/if \(this\.returnValue !== 'close'\) return;\s*\n\s*window\.close\(\);/.test(app),
    'the dialog no longer closes the radio on the one value that asks for it');
});


test('the preview draws the dialog the app actually shows', () => {
  /* This page has drifted from the app more than once, always the same
     way: a value is tuned in one of them and read back from the other.
     So the guard is not "the preview has a dialog in it" -- it is that
     every sentence and every number in the drawing is the one the app
     uses, taken from the app and looked for in the preview.

     The dialog's palette is the drawer's, which is one fixed light set in
     all eight themes, so unlike the theme bars further up that page there
     is nothing here that is allowed to differ. */
  const app = read('app.js');
  const css = read('app.css');
  const preview = read('previews/update-notice.html');

  /* Both sentences, lifted out of the app rather than typed again here. */
  const said = [
    /'Version ' \+ disk \+ ' (update is pending on this machine\. )'/,
    /'(Close the radio and open it again to apply the update\.)'/,
    /' (has been published on GitHub\. )'/,
    /'(The radio app fetches it by itself the next time you open it, and runs )'/,
    /'(it the time after\. Nothing to do\.)'/
  ].map(function (re) {
    const m = re.exec(app);
    assert.ok(m, 'the app no longer says ' + re + ' -- if the wording changed, the ' +
      'preview and this test change with it');
    return m[1].trim();
  });
  said.forEach(function (line) {
    assert.ok(preview.indexOf(line) !== -1,
      'the preview does not say "' + line + '" -- it is drawing wording the app dropped');
  });

  /* The three stops, and which one is lit. */
  ['Published', 'Next time you open it', 'The time after',
   'it downloads while you listen'].forEach(function (label) {
    assert.ok(read('index.html').indexOf(label) !== -1, 'the app dropped the step "' + label + '"');
    assert.ok(preview.indexOf(label) !== -1, 'the preview dropped the step "' + label + '"');
  });
  assert.ok(/class="is-next"/.test(preview) && /class="is-next"/.test(read('index.html')),
    'the preview and the app no longer agree on which stop is the live one');

  /* And the numbers behind the ground it sits on. Read out of app.css,
     looked for in the preview, so tuning one and not the other fails here
     rather than being noticed in a screenshot weeks later. */
  const dim = /#updateReady::backdrop \{\s*background: (rgba\([^)]*\));/.exec(css);
  assert.ok(dim, 'the dialog no longer sets its own backdrop');
  assert.ok(preview.indexOf(dim[1].replace(/\s+/g, ' ')) !== -1,
    'the preview dims to something other than ' + dim[1]);

  const blur = /#updateReady::backdrop[\s\S]*?[^-]backdrop-filter: (blur\([^)]*\))/.exec(css);
  assert.ok(blur, 'the dialog no longer blurs what is behind it');
  assert.ok(preview.indexOf(blur[1]) !== -1,
    'the preview blurs by something other than ' + blur[1]);

  /* Solid Cancel, dashed aside. The difference is the whole point of it. */
  assert.ok(/#updateReadyCancel \{ border-style: solid; \}/.test(css),
    'the dialog Cancel went back to the dashed outline the asides use');
  assert.ok(/\.dlg-cancel \{[\s\S]*?border: 1px solid/.test(preview),
    'the preview Cancel is not drawn solid');
  assert.ok(/\.dlg-link \{[\s\S]*?border: 1px dashed/.test(preview),
    'the preview aside is not drawn dashed');
});


test('no cell glow reaches the character next to it', () => {
  /* The console readout is drawn one span per character so a single grid
     can stumble without the rest being repainted. The cost, which took a
     while to see: an inline box paints its shadow and then its glyph, so
     each cell's shadow lands on top of every glyph to its left. With a
     fall reaching 72px that is thirteen washes of amber over every
     character, and the whole readout goes soft and pale -- measured
     against the same words as one text run, which is what it used to be.

     So the near layers stay on the cells, where they dim with the grid,
     and the wide falls live on the readout as a filter, which paints once
     from the finished result and sits behind all of it.

     The number that matters is the widest blur on a cell. Anything much
     past the width of a character is on its neighbour. */
  const css = read('app.css');

  const cell = /\[data-theme="console"\] \.display-name \.vfd-ch \{[\s\S]*?\n\}/.exec(css);
  assert.ok(cell, 'the console cell rule has moved or gone');
  const blurs = (cell[0].match(/0 0 (\d+)px/g) || []).map(function (m) {
    return parseInt(/(\d+)px/.exec(m)[1], 10);
  });
  assert.ok(blurs.length, 'the cells have no glow at all');
  const widest = Math.max.apply(null, blurs);
  assert.ok(widest <= 12,
    'a cell glow blurs by ' + widest + 'px, which reaches the characters either ' +
    'side of it and paints over them -- that is what made the readout look soft ' +
    'and pale. The wide fall belongs on .display-name as a filter.');

  /* And it is actually there, rather than having been dropped, which
     would leave the readout crisp but flat -- type on black instead of
     something behind glass. */
  const name = /\[data-theme="console"\] \.display-name \{[\s\S]*?\n\}/.exec(css);
  assert.ok(name, 'the console readout rule has moved or gone');
  const falls = (name[0].match(/drop-shadow\(/g) || []).length;
  assert.ok(/filter:/.test(name[0]) && falls >= 2,
    'the two wide falls are gone from the readout -- the cells are crisp but the ' +
    'glass has stopped glowing');
});


test('the scripts only ever read the registry, and only ever delete from it', () => {
  /* The promise both readmes make, in those words: nothing goes in the
     registry. It is kept by there being no code that could break it --
     every reg.exe in the repository is a query, against HKLM App Paths,
     asking where a browser was installed.

     The sweeps added to the installer and the uninstaller do not change
     that. They remove and never write, and this is what says so. A future
     edit that adds a `reg add`, or a Set-ItemProperty, or a New-Item
     against a registry path, fails here -- which is the point, because
     that edit would also quietly make both readmes wrong. */
  const fs2 = require('node:fs');
  fs2.readdirSync(ROOT)
    .filter(function (f) { return /\.cmd$/i.test(f); })
    .forEach(function (f) {
      const src = read(f);
      assert.equal(/reg(\.exe)?\s+add\b/i.test(src), false, f + ' writes a registry key with reg add');
      assert.equal(/New-ItemProperty[^\n]*HK/i.test(src), false, f + ' writes a registry value');
      assert.equal(/Set-ItemProperty[^\n]*HK/i.test(src), false, f + ' sets a registry value');
      assert.equal(/New-Item[^\n]*HKCU:/i.test(src), false, f + ' creates a registry key');
      /* reg.exe is only ever asked a question. */
      src.split('\n')
        .filter(function (ln) { return !/^\s*rem\b/i.test(ln) && /reg\.exe/i.test(ln); })
        .forEach(function (ln) {
          assert.ok(/\bquery\b/.test(ln),
            f + ' uses reg.exe for something other than a query: ' + ln.trim());
        });
    });
});

test('the uninstaller takes this app out of the registry, and nothing else', () => {
  /* An uninstall is the one moment the app can promise to leave nothing
     behind, and "we are fairly sure we never wrote one" is not that
     promise. Four things could put a key there without a line of this
     repository changing: a build that once did, an experiment on somebody's
     machine, a protocol handler registered by hand to make the update
     notice clickable -- proposed, and turned down, for breaking the
     readmes' promise -- and Windows itself, which records the path of
     every script it is asked to run.

     What matters far more than the sweep existing is what it matches on.
     A fragment would be a disaster: "desk" reaches somebody's docking
     software, and a registry delete is not a thing to be approximately
     right about. Verified against planted keys and against decoys named
     DeskDock and Desktop Goose, which survived. */
  const un = read('Win - Uninstall Deskside Radio.cmd');

  assert.ok(/HKCU:\\Software\\Classes\\deskside'/.test(un),
    'the uninstaller no longer removes the protocol handler');
  ['CurrentVersion\\\\Run', 'CurrentVersion\\\\Uninstall', 'MuiCache', 'Compatibility Assistant']
    .forEach(function (where) {
      assert.ok(new RegExp(where).test(un),
        'the uninstaller no longer looks in ' + where.replace(/\\\\/g, '\\'));
    });

  /* HKCU only. The per-user hive is the only one this app could have
     reached without an administrator, and it has never asked for one --
     so a sweep of HKLM could only ever delete somebody else's software,
     and would need a prompt to do it. */
  assert.equal(/HKLM:/.test(un), false,
    'the uninstaller reaches into the machine-wide hive, which this app never wrote to');

  /* Matched on the whole name or on this install's own path. Never on a
     fragment of either. */
  assert.ok(/\$name = 'Deskside Radio'/.test(un),
    'the uninstaller matches on something other than the full app name');
  assert.equal(/'[Dd]eskside'\s*\)/.test(un.replace(/Classes\\deskside'/g, '')), false,
    'the uninstaller matches a bare fragment of the name somewhere');
});


test('a registry sweep never touches what is not this app', () => {
  /* The standing rule, and the two ways the first draft of these sweeps
     broke it. Both were caught by reading the code against the rule rather
     than by anything failing, which is why they are pinned here.

     One: the protocol key was removed on its name alone. No version of
     this software has ever registered one -- it was proposed to make the
     update notice a real button and turned down for breaking the promise
     that nothing goes in the registry -- so a key sitting at that name was
     put there by somebody else. "Deskside" is also a word other people
     use; Dell has sold Deskside workstations for twenty years. The key now
     has to say what it opens, and that has to name this app.

     Two: the match used the install folder as a needle without checking
     it was a folder. An app installed at a drive root makes it "C:", and
     every path on the machine contains that -- one degenerate variable
     turning a careful match into a wildcard. Measured against a real hive:
     129 MuiCache values would have gone. The same shape of bug as the
     unset variable in a del /q that once emptied this project's own root. */
  const sweeps = {
    'Win - Uninstall Deskside Radio.cmd': true,
    'Win-Install-or-Update-Deskside-Radio.cmd': true
  };

  Object.keys(sweeps).forEach(function (f) {
    const src = read(f);
    if (!/Classes\\deskside/.test(src)) return;   // no sweep in this one

    /* The key is read before it is removed, and what it says decides. */
    const looks = src.indexOf('shell\\open\\command');
    const kills = src.indexOf('Remove-Item -LiteralPath $p -Recurse');
    assert.ok(looks !== -1,
      f + ' removes the protocol key without reading what it opens -- on that name ' +
      'alone it is somebody else\'s software');
    assert.ok(looks < kills,
      f + ' removes the protocol key before checking whose it is');
    assert.ok(/if \(-not \(Named \$says\)\) \{ continue \}/.test(src) ||
              /if \(-not \(\$says -and \$says\.Contains\(\$name\)\)\) \{ continue \}/.test(src),
      f + ' does not require the protocol key to name this app before removing it');
  });

  /* And the folder path is refused unless it is a real path with a folder
     in it. Only the uninstaller matches on the path at all. */
  const un = read('Win - Uninstall Deskside Radio.cmd');
  assert.ok(/\$root -match '\^\[A-Za-z\]:/.test(un),
    'the uninstaller uses the install folder as a search needle without checking ' +
    'it is a real path -- at a drive root that matches every path on the machine');
  const guard = un.indexOf("$root -match");
  const uses = un.indexOf('$root.ToLower()');
  assert.ok(guard !== -1 && guard < uses,
    'the install folder is used as a needle before it has been checked');
});


test('nothing scheduled and set to off means off, gap or not', () => {
  /* It used to mean it only at the end of the day. A gap in the middle of
     one went on playing whatever was on, whatever the setting said -- so
     two slots with two minutes between them faded out at the first end and
     faded straight back in on the same station, which is indistinguishable
     from a fault. The option reads "turn the radio off until the next
     slot", and in a gap the next slot is the thing two minutes away.

     The pane said both things at once, too: its opening paragraph promised
     the switch covered gaps while the line under the switch said a gap in
     the middle of the day is not the end of it. */
  const src = read('app.js');
  const html = read('index.html');

  const at = src.indexOf('if (!slot && !first && state.intendedPlaying)');
  assert.ok(at !== -1, 'the branch that handles nothing being scheduled has moved');
  const branch = src.slice(at, src.indexOf('if (slot && !first', at));

  assert.ok(/if \(ends\[groupOfSlot\(ended\)\] === 'off'\)/.test(branch),
    'the setting is gated on something again -- it applies whenever nothing is scheduled');
  assert.equal(/dayIsOver/.test(branch), false,
    'the end of the day decides this again, so a gap ignores the setting');

  /* Which group's setting applies is the group of the slot that just
     ended, not of the day it ended on: a Friday night slot running into
     Saturday morning is a weekday slot. */
  assert.ok(/groupOfSlot\(ended\)/.test(branch),
    'the group is taken from the day rather than from the slot that ended');

  /* And no pointless dip. The fade exists so a change of station is a
     segue; a gap that keeps playing changes nothing, so fading down and
     back up only made a slot ending sound like a fault. */
  const hand = src.slice(src.indexOf('function updateHandover'), src.indexOf('function tick()'));
  assert.ok(/var staysOn = !n\.slot &&/.test(hand),
    'the handover fades into a gap that carries on, dipping a station that never changed');
  assert.ok(/status === 'live' && !staysOn/.test(hand),
    'the fade no longer checks whether anything is actually changing');

  /* The two sentences that disagreed. */
  assert.equal(/A gap in the middle of the day is not the end of it/.test(html), false,
    'the drawer still says a gap is exempt, which it no longer is');
  assert.ok(/nothing follows it/.test(html),
    'the control still says it is about the day\'s last slot only');
});

/* ---------------------------------------------------------------------
   Start with Windows, from the page

   The radio is a file:// page. It can be told things -- the launcher
   writes them down -- but it cannot act, so the switch in Settings goes
   out through a registered protocol and comes back in through a script.
   Four links in that chain, and a break in any one of them is silent.
   --------------------------------------------------------------------- */
const PROTOVBS = 'Win - Deskside Radio Protocol.vbs';

test('the launcher writes down whether the radio starts with Windows', () => {
  const src = read(OPENER);
  assert.ok(/DESKSIDE_STARTS_WITH_WINDOWS/.test(src),
    OPENER + ' never tells the page whether the Startup entry exists, so the switch cannot show it');

  /* And into a file of its own, which is the whole fix for a bug that
     shipped in 1.5.3: the fact lived in shortcut.js, which only the launcher
     writes and only at start. Flipping the switch removed the entry, nothing
     rewrote the file, the answer from launch came back, and the switch put
     itself back on and said Windows had refused.

     So the rule is the round trip, not either half of it: the file the page
     reads after a flip must be one the script that does the flipping writes.
     A test for only one side would have passed on the broken version. */
  const onoff = read('Win - Start with Windows (On-Off).cmd');
  const app = read('app.js');

  assert.ok(/startup\.js/.test(src), OPENER + ' does not write the start-up state file');
  assert.ok(/startup\.js/.test(onoff),
    'the on-off script changes the Startup entry without writing down that it did, so the switch cannot see its own work');
  assert.ok(/assets\/startup\.js/.test(app),
    'the switch reads some other file, which nothing rewrites when the entry changes');

  /* Both paths. Turning it off and not saying so is the exact shape of the
     bug, and the remove path is the one that had no writer. */
  assert.ok((onoff.match(/call :writestate/g) || []).length >= 2,
    'only one of the on-off script\'s two paths writes the state down');

  /* Not the shortcut file. That one describes the Desktop and is written at
     launch; putting a fact that changes mid-session into it is what broke. */
  const probe = app.slice(app.indexOf('function reReadStartup'),
                          app.indexOf('function reReadStartup') + 400);
  assert.equal(/shortcut\.js/.test(probe), false,
    'the switch is reading the launcher-written shortcut file again, which cannot know about a flip');
  /* By its exact name. The Desktop one is a wildcard because Edge and
     Firefox carry the browser in brackets; this one is written by a single
     script and always called the same thing, so a wildcard here would only
     let somebody else's shortcut answer for ours. */
  assert.ok(src.indexOf("'Deskside Radio.lnk'") !== -1,
    OPENER + ' looks for the Startup entry by a pattern rather than by name');
});

test('the protocol handler takes two words and nothing else', () => {
  const src = read(PROTOVBS);

  assert.ok(/desksideradio:/.test(src), PROTOVBS + ' does not check the scheme');
  assert.ok(/startup-on/.test(src) && /startup-off/.test(src),
    PROTOVBS + ' no longer understands both directions');

  /* The property the whole thing rests on. Anything a website can reach
     must not be able to choose what runs, so the verb selects one of two
     constants and is then finished with. If this ever becomes
     sh.Run(... & verb & ...) the app has handed every page on the internet
     a way to run programs. */
  const run = src.slice(src.indexOf('sh.Run'));
  assert.equal(/verb/.test(run), false,
    PROTOVBS + ' builds the command line out of the URL, which lets any website choose what runs');
  assert.equal(/url/.test(run), false,
    PROTOVBS + ' passes the URL through to what it runs');
  assert.ok(/arg = "on"/.test(src) && /arg = "off"/.test(src),
    PROTOVBS + ' no longer reduces the URL to one of two constants');

  /* Anything else leaves without a sound. */
  assert.ok(/WScript\.Quit 0/.test(src),
    PROTOVBS + ' does not simply stop on input it does not recognise');

  /* And it is the installed folder's own copy that runs, not whichever
     one the registry was last pointed at. */
  assert.ok(/ScriptFullName/.test(src),
    PROTOVBS + ' does not work out its own folder, so a moved app folder breaks the switch');
});

test('the installer registers the handler and the uninstaller takes it away', () => {
  const inst = read(INSTALLER);
  assert.ok(/HKCU:.Software.Classes.desksideradio/.test(inst),
    INSTALLER + ' never registers the handler, so the Settings switch does nothing');
  assert.ok(/URL Protocol/.test(inst),
    INSTALLER + ' writes the key without the value that makes Windows treat it as a protocol');
  /* Rewritten every run, because the path inside it is this folder's and a
     moved app folder leaves it behind. */
  assert.ok(inst.indexOf(PROTOVBS) !== -1,
    INSTALLER + ' registers something other than the handler script');

  /* The full name, never the fragment: a key called deskside cannot be
     proved to be ours, so it could never be swept up again. */
  assert.equal(/Classes.deskside'/.test(inst.slice(inst.indexOf('New-Item -Path'))), false,
    INSTALLER + ' registers under a name too short to be safely removed later');

  const un = read(UNINSTALLER);
  assert.ok(/Classes.desksideradio/.test(un),
    UNINSTALLER + ' leaves the protocol handler behind');
});

test('the switch is wired to the handler, and never saved as a setting', () => {
  const html = read('index.html');
  const src = read('app.js');

  assert.ok(/id="startWithWindows"/.test(html), 'Settings has no start-with-Windows switch');
  assert.ok(/id="startupBlock"/.test(html), 'Settings has no start-when-you-sign-in pane');

  /* The pane is shown on every platform, because starting at login is
     possible on every platform and this is where somebody comes to ask.
     What is Windows-only is the switch, which has nothing to talk to
     elsewhere -- so the pane has to answer for the others in words. */
  const pane = html.slice(html.indexOf('id="startupBlock"'),
                          html.indexOf('<h3>Updates</h3>'));
  assert.ok(/os-win/.test(pane) && /os-other/.test(pane),
    'the sign-in pane says the same thing on Windows as on macOS, where the switch cannot work');
  assert.equal(/id="startupBlock" hidden/.test(pane), false,
    'the sign-in pane is hidden outright off Windows, which tells a Mac listener the answer is no');

  /* And the row itself is taken away there. By attribute, which needs a rule:
     display: flex is an author rule and beats the browser's on [hidden]. */
  assert.ok(/\.switch-row\[hidden\]/.test(read('app.css')),
    'a hidden switch row is drawn anyway, because .switch-row sets its own display');
  assert.ok(/#startupBlock \.switch-row/.test(src),
    'the switch is offered on macOS and Linux, where nothing can answer it');

  assert.ok(/desksideradio:startup-/.test(src),
    'the switch never asks Windows for anything');

  /* On or off is a fact about the machine, not a preference. Remembering it
     would mean the app giving an answer it is not entitled to give: the
     shortcut can be deleted by hand at any moment and the setting is then a
     lie. So the value shown comes from the file and from nowhere else.

     One thing may be remembered, and only one: whether the round trip has
     ever worked. That is a fact about this app rather than about the machine,
     and it is what decides whether the control is a button or a switch. */
  const mod = src.slice(src.indexOf('function showStartupState'),
                        src.indexOf('function reReadStartup'));
  const remembered = (mod.match(/state\.[A-Za-z]+/g) || []);
  remembered.forEach(function (r) {
    assert.equal(r, 'state.startupUsed',
      'the switch remembers ' + r + ', and the only thing it may remember is whether it has ever worked');
  });
  assert.ok(/box\.checked = on;/.test(mod) && /startupIsOn\(\)/.test(mod),
    'the switch is set from something other than what the launcher wrote down');
  assert.ok(/DESKSIDE_STARTS_WITH_WINDOWS/.test(src),
    'the switch never reads what the launcher wrote, so it cannot show the truth');

  /* A button until it has worked once, and a switch after.

     A toggle is the wrong shape for an action that leaves the page and asks
     the browser for permission: it moves on click, before anything has
     happened, so it is already wrong while the dialog is still up. */
  assert.ok(/id="startupGo"/.test(html) && /id="startupSwitch"/.test(html),
    'there is only one control, so the first use has a toggle that lies while the permission dialog is open');
  assert.ok(/go\.hidden = used/.test(src) && /sw\.hidden = !used/.test(src),
    'nothing swaps the button for the switch once it has worked');

  /* And the switch puts itself back on click. The browser moved it; nothing
     has happened yet. It moves for real only when a read agrees. */
  const at = src.indexOf("$('startWithWindows').addEventListener('change'");
  const onchange = src.slice(at, at + 300);
  assert.ok(/this\.checked = startupIsOn\(\)/.test(onchange),
    'the switch stays where the click put it, which is a state nothing has confirmed');

  /* The wait has to outlast a person reading a permission dialog and finding
     the checkbox in it. It was 1200ms, which reported a refusal against a
     question that had not been answered yet. */
  const budget = /STARTUP_WAIT = (\d+)/.exec(src);
  assert.ok(budget && Number(budget[1]) >= 20000,
    'the app gives up on Windows sooner than somebody can read the dialog it just opened');
});

test('the header row stays one row, and the next-up text is what gives', () => {
  const css = read('app.css');

  /* Wrapping is the wrong failure here. The items that do not fit are the
     last in the markup -- the pin and the settings buttons -- and a second
     line makes the panel taller, which pushes the controls row under the
     bottom of a window that is a fixed 1133x741 and cannot be resized. */
  const bar = /\.tuner-bar\s*{[^}]*}/.exec(css);
  assert.ok(bar, 'the header row has no rule of its own any more');
  assert.ok(/flex-wrap:\s*nowrap/.test(bar[0]),
    'the header row wraps, so a long station name or one more button puts the settings button on a second line and clips the controls');

  /* One thing in the row may be squeezed, and it is the only one whose
     length is not fixed. min-width: 0 is the whole trick: a flex item will
     not shrink below its min-content until it is told it may. */
  const next = /\.sched-next\s*{[^}]*}/.exec(css);
  assert.ok(next, 'the next-up text has no rule of its own any more');
  assert.ok(/min-width:\s*0/.test(next[0]),
    'the next-up text cannot shrink, so the row has nothing to give and overflows instead');
  assert.ok(/text-overflow:\s*ellipsis/.test(next[0]),
    'a cut station name stops mid-word with nothing to say it was cut');

  /* And the rest hold their size. Flex items shrink by default, and these
     have nothing to shrink into -- fixed buttons, tabular time, set text. */
  [['.icon-btn', 'the top-bar buttons'],
   ['.clock', 'the clock'],
   ['.brand', 'the wordmark'],
   ['.update-pill', 'the update pill']].forEach(function (pair) {
    const rule = new RegExp('\\' + pair[0] + '\\s*{[^}]*}').exec(css);
    assert.ok(rule, pair[1] + ' has no rule of its own any more');
    assert.ok(/flex:\s*none/.test(rule[0]),
      pair[1] + ' can be squeezed out of shape before the one thing in the row that can afford it');
  });
});

test('a theme that draws a Settings button keeps the dot in its corner', () => {
  const css = read('app.css');

  /* The dot sits close to the glyph by default, because most of the work of
     a theme is colour and several of them draw no button at all -- and in
     the button's corner is only a place to be when there is a button to be
     in the corner of. A theme that draws one opts out.

     Written that way round so a new theme is right by default. The cost is
     that forgetting is silent: the dot is a few pixels adrift on one face
     and nobody sees it until all eight are side by side. Hence this. */
  assert.ok(/top: var\(--dot-inset, 10%\); right: var\(--dot-inset, 10%\);/.test(css),
    'the update dot no longer reads --dot-inset, so the per-theme contract below means nothing');

  const rules = css.match(/\[data-theme="[a-z]+"\][^{]*\.icon-btn[^{]*\{[^}]*\}/g) || [];
  assert.ok(rules.length >= 5, 'only ' + rules.length + ' per-theme button rules found; the sweep is not finding them');

  rules.forEach(function (rule) {
    /* Hover states do not count. Retro draws its edge only under the
       pointer, and a dot that moved on hover would be worse than one that
       sat still in the wrong place. */
    if (/:hover|:focus|:active/.test(rule)) return;

    const body = rule.slice(rule.indexOf('{'));
    /* The three ways a face draws a button. border-radius is not one of
       them -- every face sets it, and none of them is a visible edge. */
    const draws = /(^|[\s;{])border\s*:/.test(body)
      || /box-shadow\s*:/.test(body)
      || /(^|[\s;{])background\s*:\s*(?!none)/.test(body);
    if (!draws) return;

    const theme = /data-theme="([a-z]+)"/.exec(rule)[1];
    assert.ok(/--dot-inset\s*:/.test(body),
      theme + ' draws a button round the Settings glyph but does not set --dot-inset,'
        + ' so its update dot is pulled in as though there were nothing drawn there');
  });
});

test('every mini-radio visualisation has something to draw', () => {
  const src = read('app.js');

  const list = /var VIZ = \[([^\]]+)\]/.exec(src);
  assert.ok(list, 'the mini radio no longer has a list of visualisations');
  const names = list[1].match(/'([a-z]+)'/g).map(function (n) { return n.replace(/'/g, ''); });
  assert.ok(names.length >= 2, 'there is only one visualisation, so the click cycles nothing');

  /* Each needs a box in the markup and a rule that shows it. Miss either
     and the click lands on an empty 46x20 -- silent, and only on every
     fourth press, which is the kind of fault that ships. */
  /* The strip's stylesheet is a JS array of strings, so every quote in it is
     backslash-escaped on disk. Unescape before looking for a selector. */
  const flat = src.replace(/\\"/g, '"');
  names.forEach(function (n) {
    assert.ok(flat.indexOf('data-viz="' + n + '"]') !== -1,
      'the ' + n + ' visualisation has no rule showing it, so choosing it shows nothing');
  });

  /* And the level still goes to one element, whichever is showing. The
     whole design is one custom property per frame into a second document. */
  assert.ok(/strip\.viz\.style\.setProperty\('--dr-vu'/.test(src),
    'the level is no longer written once to the element the four inherit it from');
});

test('the Edge shortcut goes through the opener, into its own profile', () => {
  /* It aimed straight at msedge.exe until 1.5.7, so on a machine that used
     it nothing of ours ran at launch: no grip taken off, no watcher for the
     mini radio, no note about the Desktop shortcut, no update check. Found on
     a work PC as three unrelated-looking faults with one cause. */
  const edge = read('Win - Create Desktop Shortcut (Edge).cmd');
  assert.ok(/Win - Open Deskside Radio\.vbs/.test(edge) && /\$env:WSCRIPT/.test(edge),
    'the Edge shortcut aims straight at the browser, so the opener never runs on machines that use it');
  assert.ok(/profile-edge'/.test(edge),
    'the Edge shortcut does not tell the opener which profile, so it opens profile-chrome and the radio comes up empty');

  /* And the opener honours it -- but only after the legacy migration, which
     moves an old unnamed profile into PROFILE when PROFILE is missing.
     Pointed at profile-edge first, it would carry Chrome stations into Edge. */
  const op = read('Win - Open Deskside Radio.cmd');
  const pick = op.indexOf('"%~2"=="profile-edge"');
  const migrate = op.indexOf('An empty profile is the alarming outcome');
  assert.ok(pick !== -1, 'the opener ignores the profile it is handed');
  assert.ok(migrate !== -1 && pick > migrate,
    'the opener picks the Edge profile before the legacy migration, which can move Chrome stations into it');
});
