const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../scheduler.js');

const on = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

test('seasonal themes are recognised, the everyday ones are not', () => {
  ['halloween', 'harvest', 'christmas', 'spring'].forEach(k => assert.equal(S.isSeasonal(k), true, k));
  ['dial', 'tivoli', 'marconi', '', undefined, 'toString', '__proto__'].forEach(k => assert.equal(S.isSeasonal(k), false, String(k)));
});

test('each seasonal theme is in season in its own month only', () => {
  assert.equal(S.inSeason('halloween', on(2026, 10, 1, 0, 0)), true);
  assert.equal(S.inSeason('halloween', on(2026, 10, 31, 23, 59)), true);
  assert.equal(S.inSeason('halloween', on(2026, 11, 1, 0, 0)), false);
  assert.equal(S.inSeason('harvest', on(2026, 11, 15)), true);
  assert.equal(S.inSeason('christmas', on(2026, 12, 31, 23, 59)), true);
  assert.equal(S.inSeason('christmas', on(2027, 1, 1, 0, 0)), false);
  assert.equal(S.inSeason('spring', on(2027, 4, 10)), true);
  assert.equal(S.inSeason('spring', on(2027, 5, 1)), false);
  // Everyday themes are always in season.
  assert.equal(S.inSeason('dial', on(2026, 3, 3)), true);
});

test('seasonOf names the month\'s theme, or null', () => {
  assert.equal(S.seasonOf(on(2026, 10, 5)), 'halloween');
  assert.equal(S.seasonOf(on(2026, 12, 5)), 'christmas');
  assert.equal(S.seasonOf(on(2026, 4, 5)), 'spring');
  assert.equal(S.seasonOf(on(2026, 9, 30)), null);
  assert.equal(S.seasonOf(on(2027, 1, 1)), null);
});

test('seasonEnd is the last day of the month', () => {
  assert.equal(S.seasonEnd('halloween', on(2026, 10, 3)).getDate(), 31);
  assert.equal(S.seasonEnd('harvest', on(2026, 11, 3)).getDate(), 30);
  assert.equal(S.seasonEnd('spring', on(2027, 4, 3)).getDate(), 30);
  assert.equal(S.seasonEnd('christmas', on(2026, 12, 3)).getMonth(), 11);
});

test('unseenSeason: news until seen, and news again next year', () => {
  assert.equal(S.unseenSeason([], on(2026, 10, 2)), 'halloween');
  assert.equal(S.unseenSeason(undefined, on(2026, 10, 2)), 'halloween');
  assert.equal(S.unseenSeason(['halloween-2026'], on(2026, 10, 2)), null);
  assert.equal(S.unseenSeason(['halloween-2026'], on(2027, 10, 2)), 'halloween');
  assert.equal(S.unseenSeason([], on(2026, 9, 2)), null);
});

test('themeFor keeps anything in season', () => {
  assert.equal(S.themeFor({ theme: 'tivoli' }, on(2026, 10, 2)), 'tivoli');
  assert.equal(S.themeFor({ theme: 'halloween', themeBeforeSeason: 'rams' }, on(2026, 10, 31, 23, 59)), 'halloween');
});

test('themeFor hands back the theme a season replaced when its month ends', () => {
  assert.equal(S.themeFor({ theme: 'halloween', themeBeforeSeason: 'rams' }, on(2026, 11, 1, 0, 0)), 'rams');
  assert.equal(S.themeFor({ theme: 'christmas', themeBeforeSeason: 'marconi' }, on(2027, 1, 1, 0, 0)), 'marconi');
});

test('themeFor falls back to the dial when there is nothing good to go back to', () => {
  assert.equal(S.themeFor({ theme: 'halloween' }, on(2026, 11, 1)), 'dial');
  assert.equal(S.themeFor({ theme: 'harvest', themeBeforeSeason: 'halloween' }, on(2026, 12, 1)), 'dial');
  assert.equal(S.themeFor({ theme: 'spring', themeBeforeSeason: 'nonsense' }, on(2026, 5, 1)), 'dial');
});

test('an out-of-season pick holds for the month it was picked in, then goes', () => {
  const st = { theme: 'christmas', themeBeforeSeason: 'console', seasonHold: S.monthTag(on(2026, 7, 14)) };
  assert.equal(S.themeFor(st, on(2026, 7, 31, 23, 59)), 'christmas');
  assert.equal(S.themeFor(st, on(2026, 8, 1, 0, 0)), 'console');
  // The same month a year on is not the month it was picked in.
  assert.equal(S.themeFor(st, on(2027, 7, 14)), 'console');
});

test('slotSettings imposes a seasonal theme only in its month', () => {
  const slot = { applyVolume: false, applyTheme: true, theme: 'halloween' };
  assert.equal(S.slotSettings(slot, on(2026, 10, 9)).theme, 'halloween');
  assert.equal(S.slotSettings(slot, on(2026, 3, 9)).theme, null);
  assert.equal(S.slotSettings({ applyTheme: true, theme: 'rams' }, on(2026, 3, 9)).theme, 'rams');
});
