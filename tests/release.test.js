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
  ['.gitignore', 'app.js', 'index.html', 'README.md', 'README.html'].forEach(function (f) {
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

test('the pill fades in over the span the dot fades out', () => {
  /* Both sixty milliseconds, opposite directions and opposite easings. An
     animation rather than a transition because the pill comes out of
     display: none, which no transition can start from. */
  const css = read('app.css');
  assert.ok(/@keyframes update-pill-in/.test(css), 'the pill appears with no fade');
  assert.ok(/\.update-pill\s*\{\s*animation: update-pill-in \.06s ease-out;\s*\}/.test(css),
    'the pill fade is not 60ms ease-out');
  assert.ok(/74%\s*\{ opacity: 1; animation-timing-function: ease-in; \}\s*\n\s*77%\s*\{ opacity: 0; \}/.test(css),
    'the dot fade is no longer the 60ms this is matched to');
});

test('taking an update is one link, and that link never goes stale', () => {
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
  const INSTALLER_CMD = 'Win-Install-or-Update-Deskside-Radio.cmd';
  const app = read('app.js');

  const url = /var UPDATER_URL = '([^']+)'/.exec(app);
  assert.ok(url, 'app.js no longer declares UPDATER_URL');
  assert.ok(url[1].indexOf('/releases/latest/download/' + INSTALLER_CMD) !== -1,
    'UPDATER_URL is ' + url[1] + ' -- it must stay on releases/latest/download or it freezes ' +
    'at whichever release happened to write it');
  assert.equal(/\/download\/v?\d+\.\d+/.test(url[1]), false,
    'UPDATER_URL is pinned to a version, so it would stop pointing at the newest installer');
  assert.ok(/'<a href="' \+ UPDATER_URL \+ '"[^\n]*download the updater/.test(app),
    'the Service line no longer offers the updater as a link');

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
  ['README.md', 'README.html'].forEach(function (f) {
    const doc = read(f);
    assert.ok(/On Windows/.test(doc), f + ' no longer marks the Windows-only update route');
    assert.ok(/On macOS and Linux/.test(doc), f + ' does not say how to update anywhere but Windows');
  });

  /* One route in that line, not three. The folder copy and the Start menu
     entry are cheaper -- no Mark of the Web, so no prompts -- but they
     belong in the readme, not in the sentence somebody reads when they
     want the new version and nothing else. */
  const at = app.indexOf('download the updater');
  const line = app.slice(at - 400, at + 400);
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
  ['app.js', 'index.html', 'README.md', 'README.html'].forEach(function (f) {
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
  assert.ok(/if \(restoreBox\(\)\) \{ keepBox = true; mayFit = true; return; \}/.test(app),
    'app.js no longer claims the restored box, so the window gets refitted over it');
});

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
  const OPENER = 'Win - Open Deskside Radio.cmd';
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

  /* Both shortcut writers go through it, minimised, and fall back to the
     browser if it is not beside them. */
  ['Win - Create Desktop Shortcut (Chrome).cmd', 'Win - Start With Windows.cmd'].forEach(function (f) {
    const s = read(f);
    assert.ok(s.indexOf('set "OPENER=%APPDIR%' + OPENER + '"') !== -1,
      f + ' no longer names the opener');
    assert.ok(/if not exist "%OPENER%" set "OPENER="/.test(s),
      f + ' would write a shortcut to an opener that is not there');
    assert.ok(/\$link\.TargetPath = \$env:OPENER;/.test(s), f + ' does not aim the shortcut at the opener');
    assert.ok(/\$link\.WindowStyle = 7;/.test(s),
      f + ' does not minimise the opener, so its console shows on screen at every launch');
    assert.ok(/\} elseif \(\$env:BROWSER\) \{/.test(s),
      f + ' has lost the fallback that aims straight at the browser');
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
});
