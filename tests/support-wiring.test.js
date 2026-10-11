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

test('the support card carries the app brand: mark and wordmark', () => {
  const html = read('index.html');
  const card = html.slice(html.indexOf('id="supportCard"'), html.indexOf('</aside>', html.indexOf('id="supportCard"')));
  assert.ok(card.includes('class="support-card-brand"'), 'card has no brand column');
  assert.ok(card.includes('class="support-card-mark"'), 'card has no logo mark');
  assert.ok(/class="support-card-brand-name">Deskside Radio</.test(card), 'card has no Deskside Radio wordmark');
  assert.ok(card.indexOf('support-card-brand') < card.indexOf('id="supportCardText"'), 'brand must come before the text');
});

test('card brand sits at the top with a 2px gap; Support text is 1px higher; quiet buttons are centred', () => {
  const css = read('app.css');
  const brand = /\.support-card-brand \{([^}]*)\}/.exec(css)[1];
  assert.match(brand, /align-content:\s*start/); // content at the top of a full-height panel
  assert.match(brand, /align-self:\s*stretch/);
  assert.match(brand, /gap:\s*2px/);
  assert.match(brand, /background:\s*#f3f3f3/i, "panel fill matches the message boxes' button section");
  assert.match(brand, /border-right:\s*1px solid #e5e5e5/i);
  const go = /\.support-card-go \{([^}]*)\}/.exec(css)[1];
  assert.match(go, /padding:\s*4px 14px 6px/, 'Support label 1px up, same total height');
  assert.match(/\.support-card-row \{([^}]*)\}/.exec(css)[1], /align-items:\s*center/);
  assert.match(/\.support-card-quiet \{([^}]*)\}/.exec(css)[1], /align-self:\s*center/);
  assert.ok(!/\d\s*vw\b/.test(/\.confirm-head[^{]*\{[^}]*\}/.exec(css)[0]), 'no vw');
  assert.match(css, /#confirmSupportLast \.primary \{[^}]*background:\s*#0067c0[^}]*text-decoration:\s*none/, 'blue main answer, not underlined');
});

test('the last-chance dialog shows a circled heart beside the heading, and only that dialog', () => {
  const html = read('index.html');
  const start = html.indexOf('id="confirmSupportLast"');
  const dlg = html.slice(start, html.indexOf('</dialog>', start));
  assert.ok(dlg.includes('class="confirm-head"'));
  const svg = /<svg class="confirm-heart"[\s\S]*?<\/svg>/.exec(dlg);
  assert.ok(svg, 'heart svg missing');
  assert.match(svg[0], /viewBox="0 0 24 24" width="38" height="38"/);
  assert.match(svg[0], /stroke-width="1\.1"/);
  assert.ok(svg[0].includes('M12 17.6s-5.2-3.1-5.2-7.1a2.9 2.9 0 0 1 5.2-1.8 2.9 2.9 0 0 1 5.2 1.8c0 4-5.2 7.1-5.2 7.1z'));
  assert.ok(dlg.indexOf('confirm-heart') < dlg.indexOf('<h2>'), 'icon before heading');
  assert.equal((html.match(/confirm-heart/g) || []).length, 1, 'only one dialog has the icon');
  const css = read('app.css');
  assert.match(/\.confirm-head \{([^}]*)\}/.exec(css)[1], /display:\s*flex;\s*align-items:\s*center;\s*gap:\s*14px/);
  assert.match(css, /\.confirm-heart \{[^}]*var\(--ui-accent/);
  assert.match(css, /:root[^{]*\{[^}]*--ui-accent:/);
});

test('the #support-test switch is fenced by markers in source and absent from dist', () => {
  const app = read('app.js');
  assert.ok(app.includes('/* @dev-support-test begin */') && app.includes('/* @dev-support-test end */'));
  assert.ok(app.includes("'#support-test'"));
  const dist = path.join(ROOT, 'dist', 'index.html');
  if (fs.existsSync(dist)) assert.ok(!read('dist/index.html').includes('support-test'), 'dist carries the test switch');
});

test('build-dist cuts marked blocks, keeps the rest valid, and throws on an unmatched begin', () => {
  const src = read('tools/build-dist.js');
  const fn = /function stripDevBlocks\(js\) \{[\s\S]*?\n\}\n/.exec(src);
  assert.ok(fn, 'stripDevBlocks not found');
  const cut = new Function(fn[0] + '; return stripDevBlocks;')();
  const out = cut('var a=1;\n/* @dev-support-test begin */\nvar x=2;\n/* @dev-support-test end */\nvar b=3;');
  assert.ok(!out.includes('support-test') && !out.includes('x=2') && out.includes('a=1') && out.includes('b=3'));
  assert.throws(() => cut('a;\n/* @dev-support-test begin */\nb;'), /no matching end/);
  // The real app.js, stripped, still parses.
  new Function(require('../tools/strip.js').stripJs(cut(read('app.js'))));
});
