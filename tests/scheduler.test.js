const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../scheduler.js');

// Local-time helper. 2026-09-11 is a Friday, 12th Saturday, 13th Sunday, 14th Monday.
const at = (day, h, m) => new Date(2026, 8, day, h, m);
const FRI = 11, SAT = 12, SUN = 13, MON = 14;

const A = { start: '07:00', end: '10:00', stationId: 'cfrb', volume: 60 };
const B = { start: '10:00', end: '23:00', stationId: 'kiss', volume: 40 };
const schedule = { weekday: [A, B], weekend: [] };

test('dayGroup: Mon-Fri are weekday, Sat-Sun are weekend', () => {
  assert.equal(S.dayGroup(at(FRI, 12, 0)), 'weekday');
  assert.equal(S.dayGroup(at(MON, 12, 0)), 'weekday');
  assert.equal(S.dayGroup(at(SAT, 12, 0)), 'weekend');
  assert.equal(S.dayGroup(at(SUN, 12, 0)), 'weekend');
});

test('parseHHMM converts to minutes of day, null when malformed', () => {
  assert.equal(S.parseHHMM('07:00'), 420);
  assert.equal(S.parseHHMM('23:59'), 1439);
  assert.equal(S.parseHHMM('00:00'), 0);
  assert.equal(S.parseHHMM('24:00'), null);
  assert.equal(S.parseHHMM('7am'), null);
  assert.equal(S.parseHHMM(''), null);
});

test('activeSlot picks the slot containing now, end exclusive', () => {
  assert.equal(S.activeSlot(schedule, at(FRI, 9, 59)), A);
  assert.equal(S.activeSlot(schedule, at(FRI, 10, 0)), B);
  assert.equal(S.activeSlot(schedule, at(FRI, 22, 59)), B);
});

test('activeSlot returns null in gaps and for empty day groups', () => {
  assert.equal(S.activeSlot(schedule, at(FRI, 6, 59)), null);
  assert.equal(S.activeSlot(schedule, at(FRI, 23, 0)), null);
  assert.equal(S.activeSlot(schedule, at(SAT, 9, 0)), null);
  assert.equal(S.activeSlot({ weekday: [], weekend: [] }, at(FRI, 9, 0)), null);
});

test('activeSlot handles a slot that wraps past midnight within its day group', () => {
  const night = { start: '22:00', end: '02:00', stationId: 'kiss', volume: 20 };
  const sch = { weekday: [], weekend: [night] };
  assert.equal(S.activeSlot(sch, at(SAT, 23, 30)), night);
  assert.equal(S.activeSlot(sch, at(SAT, 1, 0)), night);
  assert.equal(S.activeSlot(sch, at(SAT, 2, 0)), null);
  assert.equal(S.activeSlot(sch, at(SAT, 12, 0)), null);
});

test('nextChange: inside a slot, the next boundary is the following slot start', () => {
  const n = S.nextChange(schedule, at(FRI, 8, 0));
  assert.deepEqual(n.at, at(FRI, 10, 0));
  assert.equal(n.slot, B);
});

test('nextChange: end of the last slot of the day is a change to nothing', () => {
  const n = S.nextChange(schedule, at(FRI, 12, 0));
  assert.deepEqual(n.at, at(FRI, 23, 0));
  assert.equal(n.slot, null);
});

test('nextChange: after the last slot, look forward across day groups', () => {
  const n = S.nextChange(schedule, at(FRI, 23, 30));
  assert.deepEqual(n.at, at(MON, 7, 0));
  assert.equal(n.slot, A);
});

test('nextChange: null when nothing is scheduled at all', () => {
  assert.equal(S.nextChange({ weekday: [], weekend: [] }, at(FRI, 9, 0)), null);
});

test('validateSlots: valid list yields no errors', () => {
  assert.deepEqual(S.validateSlots([A, B], ['cfrb', 'kiss']), []);
});

test('validateSlots: slots that meet at an edge are not an overlap', () => {
  // 07:00-10:00 followed by 10:00-17:00 is the ordinary case. The edge
  // belongs to the later slot, so exactly one is ever active and neither
  // is flagged. Widening overlaps() to >= would break both halves.
  const midday = { start: '10:00', end: '17:00', stationId: 'kiss', volume: 50 };
  assert.deepEqual(S.validateSlots([A, midday], ['cfrb', 'kiss']), []);
  assert.equal(S.activeSlot({ weekday: [A, midday], weekend: [] }, at(FRI, 9, 59)), A);
  assert.equal(S.activeSlot({ weekday: [A, midday], weekend: [] }, at(FRI, 10, 0)), midday);
});

test('validateSlots: flags overlap, zero length, unknown station, bad time', () => {
  const overlap = { start: '09:00', end: '11:00', stationId: 'kiss', volume: 50 };
  const zero = { start: '12:00', end: '12:00', stationId: 'kiss', volume: 50 };
  const ghost = { start: '13:00', end: '14:00', stationId: 'nope', volume: 50 };
  const bad = { start: '25:00', end: '14:00', stationId: 'kiss', volume: 50 };
  const errs = S.validateSlots([A, overlap, zero, ghost, bad], ['cfrb', 'kiss']);
  assert.ok(errs.some(e => e.index === 1 && /overlap/i.test(e.message)));
  assert.ok(errs.some(e => e.index === 2 && /same/i.test(e.message)));
  assert.ok(errs.some(e => e.index === 3 && /station/i.test(e.message)));
  assert.ok(errs.some(e => e.index === 4 && /time/i.test(e.message)));
});

test('validateSlots: a midnight-wrapping slot overlaps an early-morning slot', () => {
  const night = { start: '22:00', end: '02:00', stationId: 'kiss', volume: 20 };
  const early = { start: '01:00', end: '03:00', stationId: 'cfrb', volume: 20 };
  const errs = S.validateSlots([night, early], ['cfrb', 'kiss']);
  assert.ok(errs.some(e => /overlap/i.test(e.message)));
});

test('backoffMs doubles from 2 s and caps at 30 s', () => {
  assert.equal(S.backoffMs(1), 2000);
  assert.equal(S.backoffMs(2), 4000);
  assert.equal(S.backoffMs(4), 16000);
  assert.equal(S.backoffMs(5), 30000);
  assert.equal(S.backoffMs(12), 30000);
});

// ---- which station a press of Play should resume ----

const STATE = {
  stations: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  schedule: { weekday: [], weekend: [] },
  schedulerEnabled: true,
  currentStationId: 'c',
  volume: 55,
  lastGood: { stationId: 'b', volume: 30 }
};
const withState = (over) => Object.assign({}, STATE, over);

test('playTarget: Play resumes whatever is on the display, not the last good station', () => {
  // The bug: picking station 3, stopping, then pressing Play jumped back to 2.
  assert.deepEqual(S.playTarget(STATE, at(FRI, 12, 0), false), { stationId: 'c', volume: 55 });
});

test('playTarget: a live schedule slot outranks the displayed station', () => {
  const state = withState({ schedule: { weekday: [{ start: '07:00', end: '23:00', stationId: 'a', volume: 70 }], weekend: [] } });
  assert.deepEqual(S.playTarget(state, at(FRI, 12, 0), false), { stationId: 'a', volume: 70 });
});

test('playTarget: a disabled scheduler is ignored even inside a slot', () => {
  const state = withState({
    schedulerEnabled: false,
    schedule: { weekday: [{ start: '07:00', end: '23:00', stationId: 'a', volume: 70 }], weekend: [] }
  });
  assert.deepEqual(S.playTarget(state, at(FRI, 12, 0), false), { stationId: 'c', volume: 55 });
});

test('playTarget: recovery after a dropped stream returns to the last good station', () => {
  assert.deepEqual(S.playTarget(STATE, at(FRI, 12, 0), true), { stationId: 'b', volume: 30 });
});

test('playTarget: recovery still honours the schedule ahead of the last good station', () => {
  const state = withState({ schedule: { weekday: [{ start: '07:00', end: '23:00', stationId: 'a', volume: 70 }], weekend: [] } });
  assert.deepEqual(S.playTarget(state, at(FRI, 12, 0), true), { stationId: 'a', volume: 70 });
});

test('playTarget: a deleted station is never resumed', () => {
  const state = withState({ lastGood: { stationId: 'gone', volume: 30 } });
  assert.deepEqual(S.playTarget(state, at(FRI, 12, 0), true), { stationId: 'c', volume: 55 });
  const orphan = withState({ currentStationId: 'gone', lastGood: null });
  assert.deepEqual(S.playTarget(orphan, at(FRI, 12, 0), false), { stationId: 'a', volume: 55 });
});

test('playTarget: no stations means nothing to play', () => {
  assert.equal(S.playTarget(withState({ stations: [] }), at(FRI, 12, 0), false), null);
});

// ---- what plays the moment the app opens ----

test('bootTarget: nothing starts on its own unless play on launch is on', () => {
  assert.equal(S.bootTarget(STATE, at(FRI, 12, 0)), null);
  assert.equal(S.bootTarget(withState({ autoplay: false, autoplayStationId: 'a' }), at(FRI, 12, 0)), null);
});

test('bootTarget: play on launch starts the station chosen in Settings', () => {
  const state = withState({ autoplay: true, autoplayStationId: 'a' });
  assert.deepEqual(S.bootTarget(state, at(FRI, 12, 0)), { stationId: 'a', volume: 55 });
});

test('bootTarget: a live schedule slot outranks the launch station', () => {
  // The next tick would switch to the slot anyway, so start there.
  const state = withState({
    autoplay: true, autoplayStationId: 'a',
    schedule: { weekday: [{ start: '07:00', end: '23:00', stationId: 'b', volume: 70 }], weekend: [] }
  });
  assert.deepEqual(S.bootTarget(state, at(FRI, 12, 0)), { stationId: 'b', volume: 70 });
});

test('bootTarget: a disabled scheduler leaves the launch station alone', () => {
  const state = withState({
    autoplay: true, autoplayStationId: 'a', schedulerEnabled: false,
    schedule: { weekday: [{ start: '07:00', end: '23:00', stationId: 'b', volume: 70 }], weekend: [] }
  });
  assert.deepEqual(S.bootTarget(state, at(FRI, 12, 0)), { stationId: 'a', volume: 55 });
});

test('bootTarget: a deleted or unset launch station still starts something', () => {
  // Refusing to start because a station was removed is worse than starting
  // the one on the display, which is what the user last chose.
  assert.deepEqual(S.bootTarget(withState({ autoplay: true, autoplayStationId: 'gone' }), at(FRI, 12, 0)),
    { stationId: 'c', volume: 55 });
  assert.deepEqual(S.bootTarget(withState({ autoplay: true, autoplayStationId: null }), at(FRI, 12, 0)),
    { stationId: 'c', volume: 55 });
});

test('bootTarget: no stations means nothing to play', () => {
  assert.equal(S.bootTarget(withState({ autoplay: true, stations: [] }), at(FRI, 12, 0)), null);
});

// ---- what a triggered slot imposes ----

test('slotSettings: volume applies unless the slot says otherwise', () => {
  // Slots saved before the other three settings existed carry volume alone,
  // and they have always set it, so the absent flag has to mean yes.
  assert.equal(S.slotSettings({ volume: 60 }).volume, 60);
  assert.equal(S.slotSettings({ volume: 60, applyVolume: true }).volume, 60);
  assert.equal(S.slotSettings({ volume: 60, applyVolume: false }).volume, null);
});

test('slotSettings: tone and theme apply only when asked', () => {
  assert.deepEqual(S.slotSettings({ bass: 4, treble: -2, theme: 'rams' }),
    { volume: null, bass: null, treble: null, theme: null });
  assert.deepEqual(S.slotSettings({ applyVolume: false, bass: 4, applyBass: true, treble: -2, applyTreble: true, theme: 'rams', applyTheme: true }),
    { volume: null, bass: 4, treble: -2, theme: 'rams' });
});

test('slotSettings: out-of-range numbers are clamped, unknown themes dropped', () => {
  // An imported file should never be able to hand the audio graph a silly value.
  assert.equal(S.slotSettings({ volume: 400 }).volume, 100);
  assert.equal(S.slotSettings({ volume: -5 }).volume, 0);
  assert.equal(S.slotSettings({ bass: 99, applyBass: true }).bass, 12);
  assert.equal(S.slotSettings({ treble: -99, applyTreble: true }).treble, -12);
  assert.equal(S.slotSettings({ theme: 'sparkle', applyTheme: true }).theme, null);
  assert.equal(S.slotSettings({ applyBass: true }).bass, null);
});

test('slotSettings: no slot imposes nothing', () => {
  assert.deepEqual(S.slotSettings(null), { volume: null, bass: null, treble: null, theme: null });
});

test('playTarget: a slot that does not apply volume leaves the fader alone', () => {
  const state = withState({
    schedule: { weekday: [{ start: '07:00', end: '23:00', stationId: 'a', volume: 70, applyVolume: false }], weekend: [] }
  });
  assert.deepEqual(S.playTarget(state, at(FRI, 12, 0), false), { stationId: 'a', volume: 55 });
});

test('bootTarget: a slot that does not apply volume leaves the fader alone', () => {
  const state = withState({
    autoplay: true, autoplayStationId: 'b',
    schedule: { weekday: [{ start: '07:00', end: '23:00', stationId: 'a', volume: 70, applyVolume: false }], weekend: [] }
  });
  assert.deepEqual(S.bootTarget(state, at(FRI, 12, 0)), { stationId: 'a', volume: 55 });
});
