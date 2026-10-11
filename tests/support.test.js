const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../support.js');

const DAY = 86400000;
const START = Date.UTC(2026, 0, 1);
const at = (days) => new Date(START + days * DAY);
const iso = (days) => at(days).toISOString();
const eligible = () => ({ ...S.emptyState(), firstRunUtc: iso(0), milestoneHit: true });

test('eligible state shows card', () => {
  assert.equal(S.shouldShowCard(eligible(), at(20), false), true);
});

test('busy blocks', () => {
  assert.equal(S.shouldShowCard(eligible(), at(20), true), false);
});

test('no milestone, supporter, dismissed, unset first run all block', () => {
  assert.equal(S.shouldShowCard({ ...eligible(), milestoneHit: false }, at(20), false), false);
  assert.equal(S.shouldShowCard({ ...eligible(), supporter: true }, at(20), false), false);
  assert.equal(S.shouldShowCard({ ...eligible(), dismissedForever: true }, at(20), false), false);
  assert.equal(S.shouldShowCard({ ...eligible(), firstRunUtc: null }, at(20), false), false);
});

test('day 13 blocks, day 14 allows', () => {
  assert.equal(S.shouldShowCard(eligible(), at(13), false), false);
  assert.equal(S.shouldShowCard(eligible(), at(14), false), true);
});

test('ask gap is 90 days', () => {
  const asked = { ...eligible(), lastAskUtc: iso(20), askCount: 1 };
  assert.equal(S.shouldShowCard(asked, at(109), false), false);
  assert.equal(S.shouldShowCard(asked, at(110), false), true);
});

test('third ask is the last', () => {
  const two = { ...eligible(), lastAskUtc: iso(20), askCount: 2 };
  assert.equal(S.shouldShowCard(two, at(110), false), true);
  assert.equal(S.shouldShowCard({ ...two, askCount: 3 }, at(900), false), false);
});

test('clock before first run or last ask blocks', () => {
  assert.equal(S.shouldShowCard(eligible(), at(-1), false), false);
  const asked = { ...eligible(), lastAskUtc: iso(25), askCount: 1 };
  assert.equal(S.shouldShowCard(asked, at(20), false), false);
});

test('garbage dates block instead of throwing', () => {
  assert.equal(S.shouldShowCard({ ...eligible(), firstRunUtc: 'nope' }, at(20), false), false);
});

test('ensureFirstRun sets once', () => {
  const s = S.ensureFirstRun(S.emptyState(), at(0));
  assert.equal(s.firstRunUtc, iso(0));
  assert.equal(S.ensureFirstRun(s, at(5)).firstRunUtc, iso(0));
});

test('markMilestone, recordShown, recordNeverAsk, recordSupporter', () => {
  assert.equal(S.markMilestone(S.emptyState()).milestoneHit, true);
  const shown = S.recordShown(eligible(), at(20));
  assert.equal(shown.lastAskUtc, iso(20));
  assert.equal(shown.askCount, 1);
  assert.equal(S.shouldShowCard(shown, at(21), false), false);
  assert.equal(S.shouldShowCard(S.recordNeverAsk(eligible()), at(10000), false), false);
  const sup = S.recordSupporter(eligible());
  assert.equal(sup.supporter, true);
  assert.equal(S.shouldShowCard(sup, at(20), false), false);
});

test('functions do not mutate their input', () => {
  const s = eligible();
  S.recordShown(s, at(20));
  S.recordNeverAsk(s);
  assert.equal(s.askCount, 0);
  assert.equal(s.dismissedForever, false);
});

function fakeStorage(initial) {
  const m = new Map(initial ? [['markticulous.support', initial]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m };
}

test('load/save round-trip', () => {
  const st = fakeStorage();
  const s = S.markMilestone(S.ensureFirstRun(S.load(st), at(0)));
  S.save(st, s);
  assert.deepEqual(S.load(st), s);
});

test('load survives missing, corrupt and partial data', () => {
  assert.deepEqual(S.load(fakeStorage()), S.emptyState());
  assert.deepEqual(S.load(fakeStorage('{not json')), S.emptyState());
  assert.equal(S.load(fakeStorage('{"supporter":true}')).supporter, true);
  assert.equal(S.load(fakeStorage('{"supporter":true}')).askCount, 0);
});

test('load and save survive a throwing storage', () => {
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(S.load(bad), S.emptyState());
  assert.doesNotThrow(() => S.save(bad, S.emptyState()));
});
