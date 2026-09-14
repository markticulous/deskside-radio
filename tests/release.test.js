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
  const cmd = read('Create Desktop Shortcut.cmd');
  [
    '--app=',                                  // its own window, no browser furniture
    '--autoplay-policy=no-user-gesture-required',
    '--user-data-dir='                         // without this the flags are dropped
  ].forEach(function (flag) {
    assert.ok(cmd.indexOf(flag) !== -1, 'launcher no longer passes ' + flag);
  });
});

test('the launcher grants no file access, in either script', () => {
  /* This flag used to be passed so that the settings seed could be read
     off disk. It is not a permission to read one file: it lets every
     script on the page read anything the user can, for as long as the
     shortcut exists. The seed is a script tag now and needs no flag, so
     the only thing left to do about it is make sure it stays gone. */
  ['Create Desktop Shortcut.cmd', 'Start With Windows.cmd'].forEach(function (f) {
    assert.equal(read(f).indexOf('--allow-file-access-from-files'), -1,
      f + ' passes --allow-file-access-from-files again');
  });
});

test('both launchers name powershell and reg by their full paths', () => {
  /* A double-clicked .cmd runs with the app folder as its current
     directory, and a default Windows looks there before it looks along
     PATH. A bare `powershell` is therefore whatever sits next to the
     script, which on a shared or synced folder is not necessarily ours. */
  ['Create Desktop Shortcut.cmd', 'Start With Windows.cmd'].forEach(function (f) {
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
  const powershell = read('Create Desktop Shortcut.cmd')
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

test('the launcher still falls back when no browser is found', () => {
  const cmd = read('Create Desktop Shortcut.cmd');
  assert.ok(/if \(\$env:BROWSER\)/.test(cmd), 'no branch on a missing browser');
  assert.ok(/\$link\.TargetPath = \$env:TARGET;/.test(cmd),
    'the fallback should still point the shortcut at index.html');
});
