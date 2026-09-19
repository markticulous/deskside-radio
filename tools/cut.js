/* Cutting a release, done by something that cannot forget a step.

   The version lives in four files, and the build writes it into four more.
   Every one of them has been wrong at some point: index.html carried
   v1.0.0 through nine releases and then v1.4.7 through six more, and a
   published zip once held shortcut scripts from before a rename. None of
   that is the kind of mistake anybody catches by looking, because the
   stale copy is always the one nobody opens.

   So:

     node tools/cut.js              what the version is in every place,
                                    and whether they agree. Writes nothing.
     node tools/cut.js 1.4.14       set it everywhere, rebuild, run the
                                    tests, check the build agrees.
     node tools/cut.js --verify     after pushing and releasing: does the
                                    published thing match what was cut.

   The exit code is the answer, so it can gate the rest of a release. */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));

/* The four files a person edits. Each pattern has exactly one capture
   group, and that group is the version. Adding a fifth place means adding
   a line here -- and the test suite reads this same list, so forgetting to
   is a failing test rather than a stale number nobody sees. */
const SOURCES = [
  { file: 'app.js', re: /var APP_VERSION = '([0-9][0-9.]*)'/, what: 'APP_VERSION' },
  { file: 'version.json', re: /"version":\s*"([0-9][0-9.]*)"/, what: 'version' },
  { file: 'README.html', re: /<span class="ver" id="verChip">v([0-9][0-9.]*)<\/span>/, what: 'verChip' },
  { file: 'index.html', re: /<span id="appVersion">v([0-9][0-9.]*)<\/span>/, what: 'appVersion' }
];

/* What the build writes. Checked after building, never edited by hand. */
const BUILT = [
  { file: 'dist/README.html', re: /<span class="ver" id="verChip">v([0-9][0-9.]*)<\/span>/, what: 'manual chip' },
  { file: 'dist/assets/version.txt', re: /^([0-9][0-9.]*)/, what: 'what the launcher reads' },
  { file: 'dist/assets/version.js', re: /DESKSIDE_ON_DISK = "([0-9][0-9.]*)"/, what: 'what the page reads' }
];

function readAll(list) {
  return list.map(function (s) {
    if (!exists(s.file)) return Object.assign({ found: null, missing: true }, s);
    const m = s.re.exec(read(s.file));
    return Object.assign({ found: m ? m[1] : null }, s);
  });
}

function table(rows, want) {
  const w = Math.max.apply(null, rows.map(function (r) { return r.file.length; }));
  rows.forEach(function (r) {
    const mark = r.missing ? '  ?' : (r.found === want ? '  .' : ' !!');
    console.log(mark + '  ' + r.file.padEnd(w) + '  ' + (r.found || (r.missing ? '(not built)' : '(no match)')) + '   ' + r.what);
  });
}

function agree(rows, want) {
  return rows.every(function (r) { return !r.missing && r.found === want; });
}

// ---------------------------------------------------------------- look
function look() {
  const rows = readAll(SOURCES);
  const want = rows[0].found;
  console.log('\nthe version, where a person writes it\n');
  table(rows, want);
  const ok = agree(rows, want);
  console.log('\n' + (ok ? 'all four agree on ' + want : 'THEY DO NOT AGREE') + '\n');
  return ok ? 0 : 1;
}

// ----------------------------------------------------------------- cut
function cut(version) {
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) {
    console.log('\n  "' + version + '" is not a version. Three numbers, dots between.\n');
    return 2;
  }
  console.log('\nsetting the version to ' + version + '\n');
  SOURCES.forEach(function (s) {
    const src = read(s.file);
    const m = s.re.exec(src);
    if (!m) { console.log(' !!  ' + s.file + '  -- no ' + s.what + ' to set'); process.exitCode = 1; return; }
    if (m[1] === version) { console.log('  .  ' + s.file + '  already ' + version); return; }
    const out = src.slice(0, m.index + m[0].indexOf(m[1])) + version +
      src.slice(m.index + m[0].indexOf(m[1]) + m[1].length);
    fs.writeFileSync(path.join(ROOT, s.file), out);
    console.log('  .  ' + s.file + '  ' + m[1] + ' -> ' + version + '   (' + s.what + ')');
  });
  if (process.exitCode) return 1;

  /* The release date goes with it. It is read by nothing, and it is the
     first thing anybody looks at to work out when something changed. */
  const vj = path.join(ROOT, 'version.json');
  const j = JSON.parse(fs.readFileSync(vj, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  if (j.released !== today) {
    j.released = today;
    fs.writeFileSync(vj, JSON.stringify(j, null, 2) + '\n');
    console.log('  .  version.json  released -> ' + today);
  }

  console.log('\nbuilding\n');
  const build = spawnSync(process.execPath, [path.join('tools', 'build-dist.js')],
    { cwd: ROOT, encoding: 'utf8' });
  process.stdout.write(build.stdout || '');
  if (build.status !== 0) { process.stderr.write(build.stderr || ''); return 1; }

  console.log('\nwhat the build wrote\n');
  const built = readAll(BUILT);
  table(built, version);
  const zip = 'deskside-radio-' + version + '.zip';
  const hasZip = exists(zip);
  console.log((hasZip ? '  .  ' : ' !!  ') + zip + (hasZip ? '' : '   -- not there'));

  console.log('\nrunning the tests\n');
  /* Named one by one. The shell is what expands tests/*.test.js, and
     there is no shell here -- handed the directory instead, the runner
     reports one failing test and says nothing about which. */
  const testFiles = fs.readdirSync(path.join(ROOT, 'tests'))
    .filter(function (f) { return /\.test\.js$/.test(f); })
    .map(function (f) { return 'tests/' + f; });
  const t = spawnSync(process.execPath, ['--test'].concat(testFiles), { cwd: ROOT, encoding: 'utf8' });
  const tail = (t.stdout || '').split('\n').filter(function (l) { return /^. (tests|pass|fail)/.test(l); });
  console.log(tail.join('\n'));
  const testsOk = t.status === 0;

  const ok = agree(built, version) && hasZip && testsOk;
  console.log('\n' + (ok
    ? 'everything is aligned on ' + version + '. commit, push, then: node tools/cut.js --verify'
    : 'SOMETHING IS OUT OF LINE -- do not release') + '\n');
  return ok ? 0 : 1;
}

// -------------------------------------------------------------- verify
async function verify() {
  const want = /"version":\s*"([0-9][0-9.]*)"/.exec(read('version.json'))[1];
  console.log('\nchecking what is actually published, against ' + want + '\n');
  let bad = 0;
  const say = (ok, label, detail) => {
    console.log((ok ? '  .  ' : ' !!  ') + label.padEnd(48) + (detail || ''));
    if (!ok) bad++;
  };

  /* The file every running copy asks about, from the branch it asks. This
     is the one that decides whether anybody is told there is an update. */
  try {
    const r = await fetch('https://raw.githubusercontent.com/markticulous/deskside-radio/main/version.json',
      { cache: 'no-store' });
    const live = (await r.json()).version;
    say(live === want, 'version.json on main', live);
  } catch (e) { say(false, 'version.json on main', 'could not fetch: ' + e.message); }

  /* The tag, which is what the release hangs off. */
  try {
    const tags = execFileSync('git', ['tag', '--sort=-v:refname'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter(Boolean);
    say(tags[0] === 'v' + want, 'newest git tag', tags[0]);
  } catch (e) { say(false, 'newest git tag', e.message); }

  /* The two addresses that are written into the scripts and must never go
     stale, because both are fetched by name at every check. */
  for (const name of ['deskside-radio.zip', 'Win-Install-or-Update-Deskside-Radio.cmd']) {
    const url = 'https://github.com/markticulous/deskside-radio/releases/latest/download/' + name;
    try {
      const r = await fetch(url, { redirect: 'follow' });
      say(r.ok, 'asset ' + name, r.status);
    } catch (e) { say(false, 'asset ' + name, e.message); }
  }

  /* And the manual inside the published zip, which is the artefact people
     actually get. dist/ agreeing proves nothing about what was uploaded. */
  try {
    const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'dscut-'));
    const r = await fetch('https://github.com/markticulous/deskside-radio/releases/latest/download/deskside-radio.zip');
    fs.writeFileSync(path.join(tmp, 'z.zip'), Buffer.from(await r.arrayBuffer()));
    execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'),
      ['-xf', 'z.zip', 'README.html', 'assets/version.txt'], { cwd: tmp });
    const chip = /<span class="ver" id="verChip">v([0-9][0-9.]*)<\/span>/
      .exec(fs.readFileSync(path.join(tmp, 'README.html'), 'utf8'));
    say(chip && chip[1] === want, 'manual chip inside the published zip', chip && chip[1]);
    const vt = fs.readFileSync(path.join(tmp, 'assets', 'version.txt'), 'utf8').trim();
    say(vt === want, 'version.txt inside the published zip', vt);
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e) { say(false, 'the published zip', e.message); }

  console.log('\n' + (bad === 0
    ? 'the published release is ' + want + ', all the way down'
    : bad + ' thing(s) do not match what was cut') + '\n');
  return bad === 0 ? 0 : 1;
}

// ----------------------------------------------------------------- run
const arg = process.argv[2];
if (arg === '--verify') verify().then(function (c) { process.exit(c); });
else if (!arg) process.exit(look());
else process.exit(cut(arg));
