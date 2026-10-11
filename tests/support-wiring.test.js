/* Guards on the donate wiring. app.js is one closed function and cannot
   be required, so -- as release.test.js does -- the files are read as
   text and the parts that would break quietly are checked by shape. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('support.js loads before app.js, in the page and in the build', () => {
  const html = read('index.html');
  const s = html.indexOf('<script src="support.js"></script>');
  const a = html.indexOf('<script src="app.js"></script>');
  assert.ok(s !== -1, 'index.html does not load support.js');
  assert.ok(s < a, 'support.js must load before app.js');

  const m = /const SCRIPTS = \[([^\]]*)\]/.exec(read('tools/build-dist.js'));
  const list = m[1].split(',').map((x) => x.trim().replace(/'/g, ''));
  assert.ok(list.indexOf('support.js') !== -1, 'build-dist does not inline support.js');
  assert.ok(list.indexOf('support.js') < list.indexOf('app.js'), 'build-dist order differs from the page');
});

test('the shipped support.js is the Support Kit file, unchanged', () => {
  /* The kit is the one place the rules are changed. A local edit here
     would make this radio ask on different terms from every other app.
     Skipped when the kit folder is not beside this repo (a fresh clone). */
  const kit = path.join(ROOT, '..', 'Support Markticulous Apps', 'kit', 'js', 'support.js');
  if (!fs.existsSync(kit)) return;
  const norm = (s) => s.replace(/\r\n/g, '\n');
  assert.equal(norm(read('support.js')), norm(fs.readFileSync(kit, 'utf8')));
});

test('the page carries every element the support code looks up', () => {
  const html = read('index.html');
  ['supportCard', 'supportCardText', 'supportCardGo', 'supportCardLater', 'supportCardNever',
   'supportCardDone', 'supportBlock', 'supporterMark', 'supportLink', 'supportHubLink',
   'supportDoneBtn', 'supportThanks'].forEach((id) => {
    assert.ok(html.includes('id="' + id + '"'), 'index.html is missing #' + id);
  });
});

test('app.js wires the support rules the way the kit says to', () => {
  const app = read('app.js');
  assert.match(app, /var KOFI_URL = 'https:\/\/ko-fi\.com\/markticulous';/);
  assert.match(app, /var HUB_URL = 'https:\/\/markticulous\.github\.io\/support\/\?app=deskside-radio';/);
  // The card is only ever shown through the rules, and never while busy.
  assert.match(app, /SUPPORT\.shouldShowCard\(support, new Date\(\), supportBusy\(\)\)/);
  // Showing it is what starts the 90-day wait, so it is recorded at once.
  assert.match(app, /support = SUPPORT\.recordShown\(support, new Date\(\)\)/);
  // Listening only counts while a station is actually playing.
  assert.match(app, /if \(status !== 'live'\) return;\s*support\.listenedSec/);
  // Kept apart from radio.v1, so Reset and Export never touch it.
  assert.doesNotMatch(app, /state\.supporter|state\.listenedSec/);
});

test("Don't ask again is honored at once, then offers one last chance", () => {
  const html = read('index.html');
  assert.ok(html.includes('<dialog class="confirm" id="confirmSupportLast">'), 'last-chance dialog is missing');
  ['supportLateGo', 'supportLateNo'].forEach((id) => {
    assert.ok(html.includes('id="' + id + '"'), 'index.html is missing #' + id);
  });
  assert.ok(html.includes("Sure, I'll support"), 'primary button text');
  assert.ok(html.includes('Not at this time'), 'secondary button text');

  const app = read('app.js');
  // The request is recorded before the dialog is offered, so it holds even if the dialog is dismissed any way at all.
  const h = /\$\('supportCardNever'\)\.addEventListener\('click', function \(\) \{([\s\S]*?)\n  \}\);/.exec(app);
  assert.ok(h, "Don't ask again handler not found");
  const body = h[1];
  assert.ok(body.indexOf('recordNeverAsk') !== -1 && body.indexOf('recordNeverAsk') < body.indexOf('showModal'),
    'recordNeverAsk must come before the last-chance dialog opens');
  // The last chance never changes the saved state: no way to un-ask by accident.
  assert.doesNotMatch(app, /confirmSupportLast[\s\S]{0,400}recordShown/);
});

test('the supporter adornment is wired, and the plate is never touched', () => {
  const html = read('index.html');
  ['adorn', 'adornPick', 'adornChips'].forEach((id) => {
    assert.ok(html.includes('id="' + id + '"'), 'index.html is missing #' + id);
  });
  ['coffee', 'heart', 'sparkle', 'star', 'daisy', 'paw', 'dog', 'cat', 'robot', 'bean', 'rocket'].forEach((n) => {
    assert.ok(html.includes('id="i-' + n + '"'), 'index.html is missing symbol i-' + n);
  });
  const app = read('app.js');
  assert.match(app, /recordSupporter\(support, new Date\(\)\)/);
  // The adornment sits beside the plate; nothing may re-skin the plate itself.
  assert.doesNotMatch(app, /data-byline['"]?\s*,|dataset\.byline\s*=/);
});
