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
   'supportDoneBtn', 'supportThanks', 'plateBlock'].forEach((id) => {
    assert.ok(html.includes('id="' + id + '"'), 'index.html is missing #' + id);
  });
  ['plate', 'seal', 'rule', 'callsign', 'tag'].forEach((v) => {
    assert.ok(html.includes('name="byline" value="' + v + '"'), 'plate picker is missing ' + v);
  });
});
