/* The early weekend: one seasonal theme offered ahead of its own month,
   from six on the Friday evening before Canadian Thanksgiving to the last
   second of the holiday Monday, to listeners in Canada only. */
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../scheduler.js');

const on = (y, m, d, h = 12, min = 0, sec = 0, ms = 0) => new Date(y, m - 1, d, h, min, sec, ms);

afterEach(() => S.setRegion(null));

test('Thanksgiving is the second Monday in October, worked out for any year', () => {
  // Checked against the calendar, including both ends of the range it can fall in.
  const known = { 2024: 14, 2025: 13, 2026: 12, 2027: 11, 2028: 9, 2029: 8, 2030: 14, 2031: 13, 2032: 11, 2033: 10 };
  Object.keys(known).forEach((y) => {
    const d = S.thanksgiving(+y);
    assert.equal(d.getMonth(), 9, y + ' is not in October');
    assert.equal(d.getDay(), 1, y + ' is not a Monday');
    assert.equal(d.getDate(), known[y], y + ' landed on the ' + d.getDate());
  });
  // Every year for a century is a Monday between the 8th and the 14th.
  for (let y = 2000; y < 2100; y++) {
    const d = S.thanksgiving(y);
    assert.ok(d.getDay() === 1 && d.getDate() >= 8 && d.getDate() <= 14, String(y));
  }
});

test('in Canada, the autumn face opens at 6 pm on the Friday and closes after the Monday', () => {
  S.setRegion('CA');
  // 2026: Thanksgiving is Monday 12 October, so Friday is the 9th.
  assert.equal(S.inSeason('harvest', on(2026, 10, 9, 17, 59, 59)), false, 'a second before six on Friday');
  assert.equal(S.inSeason('harvest', on(2026, 10, 9, 18, 0, 0)), true, 'six on Friday');
  assert.equal(S.inSeason('harvest', on(2026, 10, 10, 12)), true, 'Saturday');
  assert.equal(S.inSeason('harvest', on(2026, 10, 11, 3)), true, 'Sunday');
  assert.equal(S.inSeason('harvest', on(2026, 10, 12, 23, 59, 59, 999)), true, 'the last moment of the Monday');
  assert.equal(S.inSeason('harvest', on(2026, 10, 13, 0, 0, 0)), false, 'Tuesday midnight');
  // A different year finds its own weekend: 2027 is Monday 11 October.
  assert.equal(S.inSeason('harvest', on(2027, 10, 8, 18, 0)), true);
  assert.equal(S.inSeason('harvest', on(2027, 10, 12, 0, 0)), false);
});

test('outside Canada, or with no idea where, the weekend does not exist', () => {
  [null, 'US', 'GB', 'FR', ''].forEach((r) => {
    S.setRegion(r);
    assert.equal(S.inSeason('harvest', on(2026, 10, 10, 12)), false, 'region ' + JSON.stringify(r));
  });
});

test('only the autumn face gets a weekend, and its own month is untouched', () => {
  S.setRegion('CA');
  ['christmas', 'spring'].forEach((k) => assert.equal(S.inSeason(k, on(2026, 10, 10, 12)), false, k));
  // October is still October's.
  assert.equal(S.inSeason('halloween', on(2026, 10, 10, 12)), true);
  // And November is still the autumn face's whole month, anywhere.
  S.setRegion(null);
  assert.equal(S.inSeason('harvest', on(2026, 11, 15)), true);
});

test('the picker is told it is the weekend only, and when it ends', () => {
  S.setRegion('CA');
  const sat = on(2026, 10, 10, 12);
  assert.equal(S.earlyOnly('harvest', sat), true);
  assert.equal(S.earlyOnly('halloween', sat), false, 'in its own month, not early');
  const end = S.seasonEnd('harvest', sat);
  assert.equal(end.getDate(), 12);
  assert.equal(end.getHours(), 23);
  // In its own month it is the ordinary end of the month again.
  assert.equal(S.earlyOnly('harvest', on(2026, 11, 3)), false);
  assert.equal(S.seasonEnd('harvest', on(2026, 11, 3)).getDate(), 30);
});

test('the weekend is its own news, separate from the month', () => {
  S.setRegion('CA');
  const sat = on(2026, 10, 10, 12);
  assert.equal(S.seasonTag('harvest', sat), 'harvest-early-2026');
  assert.equal(S.seasonTag('harvest', on(2026, 11, 3)), 'harvest-2026', 'November keeps its own mark');
  // October's own season first, then the weekend.
  assert.equal(S.unseenSeason([], sat), 'halloween');
  assert.equal(S.unseenSeason(['halloween-2026'], sat), 'harvest');
  assert.equal(S.unseenSeason(['halloween-2026', 'harvest-early-2026'], sat), null);
  // Having seen the weekend does not spend November's news.
  assert.equal(S.unseenSeason(['harvest-early-2026'], on(2026, 11, 3)), 'harvest');
});

test('when the weekend ends, the theme it replaced comes back', () => {
  S.setRegion('CA');
  const tue = on(2026, 10, 13, 0, 0);
  // Picked over an everyday theme.
  assert.equal(S.themeFor({ theme: 'harvest', themeBeforeEarly: 'tivoli', themeBeforeSeason: 'tivoli' }, tue), 'tivoli');
  // Picked over October's own seasonal theme: that one, still in its month, comes back.
  assert.equal(S.themeFor({ theme: 'harvest', themeBeforeEarly: 'halloween', themeBeforeSeason: 'dial' }, tue), 'halloween');
  // Still the weekend: it stays.
  assert.equal(S.themeFor({ theme: 'harvest', themeBeforeEarly: 'tivoli' }, on(2026, 10, 12, 22)), 'harvest');
  // Nothing recorded: the ordinary fallback.
  assert.equal(S.themeFor({ theme: 'harvest', themeBeforeSeason: 'marconi' }, tue), 'marconi');
  // A remembered theme that is itself now out of season is skipped.
  assert.equal(S.themeFor({ theme: 'harvest', themeBeforeEarly: 'christmas', themeBeforeSeason: 'rams' }, tue), 'rams');
});

/* The scarecrow carries a Canadian flag only on the Thanksgiving weekend.
   He asks earlyOnly, which is true inside the weekend and false for every
   moment of November, the face's own month -- so in November, in Canada
   or anywhere, he has no flag. */
test('the flag is the weekend only, never November', () => {
  S.setRegion('CA');
  assert.equal(S.earlyOnly('harvest', on(2026, 10, 10, 12)), true, 'Thanksgiving Saturday');
  for (let d = 1; d <= 30; d++) {
    [0, 12, 23].forEach((hr) => assert.equal(S.earlyOnly('harvest', on(2026, 11, d, hr)), false, 'November ' + d + ' at ' + hr));
  }
  // And the rest of October, outside the weekend.
  assert.equal(S.earlyOnly('harvest', on(2026, 10, 9, 17, 59)), false, 'Friday before six');
  assert.equal(S.earlyOnly('harvest', on(2026, 10, 13, 0, 0)), false, 'the Tuesday');
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'seasonal.js'), 'utf8');
  assert.ok(/flag = !!\(S_ && S_\.earlyOnly && S_\.earlyOnly\('harvest', new Date\(\)\)\)/.test(src),
    'the scarecrow no longer decides his flag by the weekend alone');
});
