/* Guards on the two files that are edited by hand and break quietly:
   the version the app reports, and the launcher script's quoting. Neither
   is reachable from a unit test of the modules, so they are read as text. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('version.json matches the version the app reports', () => {
  const declared = /var APP_VERSION = '([^']+)'/.exec(read('app.js'));
  assert.ok(declared, 'APP_VERSION not found in app.js');
  const published = JSON.parse(read('version.json')).version;
  assert.equal(published, declared[1],
    'version.json says ' + published + ' but app.js says ' + declared[1] +
    ' — every running copy compares against version.json, so a mismatch either ' +
    'hides a release or claims one that does not exist.');
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

test('every Windows script is named for Windows, and every Linux one for Linux', () => {
  /* A folder of double-clickable scripts is the one place a filename has
     to say what it is for before anyone opens it -- there is no other
     signal, and running the wrong one does nothing useful. */
  fs.readdirSync(ROOT).forEach(function (f) {
    if (/\.cmd$/i.test(f)) {
      assert.ok(f.indexOf('Win - ') === 0, f + ' is a .cmd and should start with "Win - "');
    }
    if (/\.sh$/i.test(f)) {
      assert.ok(f.indexOf('Linux - ') === 0, f + ' is a .sh and should start with "Linux - "');
    }
  });
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
  ['Win - Create Desktop Shortcut (Chrome).cmd', 'Win - Start With Windows.cmd'].forEach(function (f) {
    assert.equal(read(f).indexOf('--allow-file-access-from-files'), -1,
      f + ' passes --allow-file-access-from-files again');
  });
});

test('both launchers name powershell and reg by their full paths', () => {
  /* A double-clicked .cmd runs with the app folder as its current
     directory, and a default Windows looks there before it looks along
     PATH. A bare `powershell` is therefore whatever sits next to the
     script, which on a shared or synced folder is not necessarily ours. */
  ['Win - Create Desktop Shortcut (Chrome).cmd', 'Win - Start With Windows.cmd'].forEach(function (f) {
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
const INSTALLER = 'Win - Install or Update Deskside Radio.cmd';

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
  assert.ok(read(owner).indexOf('if not defined DESKSIDE_NOPAUSE pause') !== -1,
    owner + ' no longer honours DESKSIDE_NOPAUSE, so the installer will stop halfway and wait');
});

test('the installer never deletes the folder it installs into', () => {
  /* It extracts over the top instead. tar replaces the files it carries and
     leaves the rest, which is the whole reason a settings seed sitting
     beside index.html survives an update without being saved and restored.
     A wipe would also turn a failed extraction into an empty app folder. */
  const cmd = read(INSTALLER);
  [/\brd\s+\/s/i, /\brmdir\s+\/s/i, /Remove-Item[^\n]*-Recurse/i].forEach(function (re) {
    assert.equal(re.test(cmd), false,
      INSTALLER + ' deletes a directory tree; it is meant to extract over the top');
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
  ['index.html', 'README.html'].forEach(function (f) {
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
