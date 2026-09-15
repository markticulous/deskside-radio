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

test('activeSlot: a wrapping slot runs into the next morning, not its own', () => {
  /* It belongs to the day it starts on. Saturday 22:00 runs into Sunday's
     small hours; Saturday's own 01:00 belongs to Friday night, and Friday
     is a weekday, so an empty weekday list means nothing is on. */
  const night = { start: '22:00', end: '02:00', stationId: 'kiss', volume: 20 };
  const sch = { weekday: [], weekend: [night] };
  assert.equal(S.activeSlot(sch, at(SAT, 23, 30)), night);
  assert.equal(S.activeSlot(sch, at(SUN, 1, 0)), night);
  assert.equal(S.activeSlot(sch, at(SAT, 1, 0)), null);
  assert.equal(S.activeSlot(sch, at(SUN, 2, 0)), null);
  assert.equal(S.activeSlot(sch, at(SAT, 12, 0)), null);
});

test('activeSlot: a Friday night slot covers Saturday, and not Monday', () => {
  /* The case that was wrong before: the tail used to be looked for in the
     group of the day it landed on, so Saturday saw nothing and Monday
     morning got a night it was never given. */
  const night = { start: '23:00', end: '01:00', stationId: 'kiss', volume: 20 };
  const sch = { weekday: [night], weekend: [] };
  assert.equal(S.activeSlot(sch, at(FRI, 23, 30)), night);
  assert.equal(S.activeSlot(sch, at(SAT, 0, 30)), night);
  assert.equal(S.activeSlot(sch, at(MON, 0, 30)), null);
});

test('activeSlot: a running tail beats the next day first slot', () => {
  const night = { start: '23:00', end: '01:00', stationId: 'kiss', volume: 20 };
  const early = { start: '00:00', end: '06:00', stationId: 'cfrb', volume: 30 };
  const sch = { weekday: [night], weekend: [early] };
  assert.equal(S.activeSlot(sch, at(SAT, 0, 30)), night, 'the tail is still playing');
  assert.equal(S.activeSlot(sch, at(SAT, 1, 0)), early, 'and hands over when it ends');
});

test('activeSlot: equal times mean all day', () => {
  const allDay = { start: '08:00', end: '08:00', stationId: 'kiss', volume: 40 };
  const sch = { weekday: [allDay], weekend: [] };
  assert.equal(S.activeSlot(sch, at(MON, 8, 0)), allDay);
  assert.equal(S.activeSlot(sch, at(MON, 3, 0)), allDay);
  assert.equal(S.activeSlot(sch, at(MON, 23, 59)), allDay);
  assert.equal(S.activeSlot(sch, at(SAT, 12, 0)), null, 'and only in its own group');
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

test('validateSlots: flags overlap, unknown station, bad time', () => {
  const overlap = { start: '09:00', end: '11:00', stationId: 'kiss', volume: 50 };
  const ghost = { start: '13:00', end: '14:00', stationId: 'nope', volume: 50 };
  const bad = { start: '25:00', end: '14:00', stationId: 'kiss', volume: 50 };
  const errs = S.validateSlots([A, overlap, ghost, bad], ['cfrb', 'kiss']);
  assert.ok(errs.some(e => e.index === 1 && /overlap/i.test(e.message)));
  assert.ok(errs.some(e => e.index === 2 && /station/i.test(e.message)));
  assert.ok(errs.some(e => e.index === 3 && /time/i.test(e.message)));
});

test('validateSlots: equal times are an all-day slot, not an error', () => {
  const allDay = { start: '12:00', end: '12:00', stationId: 'kiss', volume: 50 };
  assert.deepEqual(S.validateSlots([allDay], ['kiss']), []);
});

test('validateSlots: an all-day slot overlaps everything else', () => {
  const allDay = { start: '12:00', end: '12:00', stationId: 'kiss', volume: 50 };
  const errs = S.validateSlots([allDay, A], ['cfrb', 'kiss']);
  assert.ok(errs.some(e => /overlap/i.test(e.message)));
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

// ---------- the midnight rule, seen through nextChange ----------

test('nextChange: a wrapping slot ends on the next day, not its own', () => {
  const night = { start: '23:00', end: '01:00', stationId: 'kiss', volume: 20 };
  const sch = { weekday: [night], weekend: [] };
  const n = S.nextChange(sch, at(FRI, 23, 30));
  assert.equal(n.at.getTime(), at(SAT, 1, 0).getTime());
  assert.equal(n.slot, null);
});

test('nextChange: a start under a running tail is not a change', () => {
  /* Saturday 00:00 is when the weekend slot would begin, but Friday night
     is still playing, so nothing changes until the tail runs out. */
  const night = { start: '23:00', end: '01:00', stationId: 'kiss', volume: 20 };
  const early = { start: '00:00', end: '06:00', stationId: 'cfrb', volume: 30 };
  const sch = { weekday: [night], weekend: [early] };
  const n = S.nextChange(sch, at(FRI, 23, 30));
  assert.equal(n.at.getTime(), at(SAT, 1, 0).getTime());
  assert.equal(n.slot, early);
});

test('nextChange: an all-day slot never changes', () => {
  const allDay = { start: '08:00', end: '08:00', stationId: 'kiss', volume: 40 };
  assert.equal(S.nextChange({ weekday: [allDay], weekend: [allDay] }, at(MON, 12, 0)), null);
});

// ---------- dayIsOver ----------

test('dayIsOver: true after the last slot, false in a gap before another', () => {
  const morning = { start: '07:00', end: '10:00', stationId: 'cfrb', volume: 60 };
  const evening = { start: '18:00', end: '22:00', stationId: 'kiss', volume: 40 };
  const sch = { weekday: [morning, evening], weekend: [] };
  assert.equal(S.dayIsOver(sch, at(MON, 12, 0)), false, 'the evening slot is still to come');
  assert.equal(S.dayIsOver(sch, at(MON, 22, 30)), true, 'nothing else today');
});

test('dayIsOver: true when nothing is scheduled at all', () => {
  assert.equal(S.dayIsOver({ weekday: [], weekend: [] }, at(MON, 12, 0)), true);
});

// ---------- settle: the one gate ----------

const stations = [{ id: 'cfrb', name: 'NewsTalk 1010' }, { id: 'kiss', name: 'KISS 92.5' }];
const slot = (start, end, stationId) => ({ start, end, stationId: stationId || 'cfrb', volume: 50 });
const times = list => list.map(x => x.start + '-' + x.end);

test('settle: sorts by start and keeps the very same objects', () => {
  const late = slot('18:00', '20:00'), early = slot('07:00', '09:00');
  const r = S.settle([late, early], stations, null);
  assert.deepEqual(times(r.slots), ['07:00-09:00', '18:00-20:00']);
  assert.equal(r.slots[0], early, 'identity survives, so the drawer keeps its open card');
  assert.equal(r.slots[1], late);
  assert.deepEqual(r.changes, []);
});

test('settle: what you just set stays, and the neighbour starts later', () => {
  const morning = slot('07:00', '11:00');          // stretched over the next one
  const rest = slot('10:00', '23:00', 'kiss');
  const r = S.settle([morning, rest], stations, morning);
  assert.deepEqual(times(r.slots), ['07:00-11:00', '11:00-23:00']);
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0].kind, 'trimmed');
  assert.equal(r.changes[0].text, 'Shortened KISS 92.5 to start 11:00 to make room.');
});

test('settle: a neighbour reached from the other side ends earlier', () => {
  const evening = slot('13:00', '23:00', 'kiss');
  const stretched = slot('12:00', '18:00');
  const r = S.settle([evening, stretched], stations, stretched);
  assert.deepEqual(times(r.slots), ['12:00-18:00', '18:00-23:00']);
  assert.equal(r.changes[0].text, 'Shortened KISS 92.5 to start 18:00 to make room.');
});

test('settle: a slot covered end to end is removed', () => {
  const small = slot('10:00', '11:00', 'kiss');
  const big = slot('09:00', '13:00');
  const r = S.settle([small, big], stations, big);
  assert.deepEqual(times(r.slots), ['09:00-13:00']);
  assert.equal(r.changes[0].kind, 'removed');
  assert.equal(r.changes[0].why, 'overlap');
  assert.equal(r.changes[0].text, 'Removed KISS 92.5, 10:00 to 11:00, to make room.');
});

test('settle: a slot landed on in the middle keeps its first part', () => {
  /* D1: the remainder after the newcomer is dropped rather than becoming a
     second slot, so one edit never grows the list behind the user. */
  const host = slot('10:00', '14:00', 'kiss');
  const guest = slot('11:00', '12:00');
  const r = S.settle([host, guest], stations, guest);
  assert.deepEqual(times(r.slots), ['10:00-11:00', '11:00-12:00']);
  assert.equal(r.changes[0].text, 'Shortened KISS 92.5 to end 11:00 to make room.');
});

test('settle: a wrapping anchor trims the morning after it', () => {
  const night = slot('23:00', '02:00');
  const early = slot('00:30', '06:00', 'kiss');
  const r = S.settle([night, early], stations, night);
  assert.deepEqual(times(r.slots), ['02:00-06:00', '23:00-02:00']);
  assert.equal(r.changes[0].text, 'Shortened KISS 92.5 to start 02:00 to make room.');
});

test('settle: a wrapping neighbour is cut where the anchor begins', () => {
  const night = slot('22:00', '02:00', 'kiss');
  const evening = slot('20:00', '23:00');
  const r = S.settle([night, evening], stations, evening);
  assert.deepEqual(times(r.slots), ['20:00-23:00', '23:00-02:00']);
  assert.equal(r.changes[0].text, 'Shortened KISS 92.5 to start 23:00 to make room.');
});

test('settle: an all-day anchor clears the day', () => {
  const allDay = slot('08:00', '08:00');
  const other = slot('10:00', '12:00', 'kiss');
  const r = S.settle([allDay, other], stations, allDay);
  assert.deepEqual(times(r.slots), ['08:00-08:00']);
  assert.equal(r.changes[0].kind, 'removed');
});

test('settle: an all-day slot cannot squeeze in beside another', () => {
  const other = slot('10:00', '12:00', 'kiss');
  const allDay = slot('08:00', '08:00');
  const r = S.settle([other, allDay], stations, other);
  assert.deepEqual(times(r.slots), ['10:00-12:00']);
  assert.equal(r.changes[0].kind, 'removed');
});

test('settle: with no anchor the earlier start wins', () => {
  const a = slot('07:00', '12:00');
  const b = slot('10:00', '14:00', 'kiss');
  const r = S.settle([b, a], stations, null);
  assert.deepEqual(times(r.slots), ['07:00-12:00', '12:00-14:00']);
});

test('settle: a slot whose station is gone is re-pointed, not dropped', () => {
  const orphan = slot('09:00', '10:00', 'vanished');
  const r = S.settle([orphan], stations, null);
  assert.equal(r.slots.length, 1);
  assert.equal(r.slots[0].stationId, 'cfrb');
  assert.equal(r.changes[0].kind, 'repointed');
  assert.equal(r.changes[0].text, '09:00 to 10:00 now plays NewsTalk 1010.');
});

test('settle: with no stations at all an orphan is dropped', () => {
  const r = S.settle([slot('09:00', '10:00', 'vanished')], [], null);
  assert.deepEqual(r.slots, []);
  assert.equal(r.changes[0].text, 'Removed 09:00 to 10:00: its station is gone.');
});

test('settle: a slot with unreadable times is dropped', () => {
  const r = S.settle([slot('25:00', '10:00'), slot('07:00', '09:00')], stations, null);
  assert.deepEqual(times(r.slots), ['07:00-09:00']);
  assert.equal(r.changes[0].text, 'Removed a slot with no valid time.');
});

test('settle: running it again changes nothing', () => {
  const once = S.settle([slot('07:00', '11:00'), slot('10:00', '23:00', 'kiss')], stations, null);
  const twice = S.settle(once.slots, stations, null);
  assert.deepEqual(twice.changes, []);
  assert.deepEqual(times(twice.slots), times(once.slots));
});

test('settle: whatever goes in, what comes out passes validateSlots', () => {
  /* The property the whole design rests on. A small deterministic
     generator, so a failure is reproducible from the seed. */
  let seed = 20260914;
  const rnd = n => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
  const ids = ['cfrb', 'kiss', 'ghost', ''];
  const stamp = () => rnd(2) ? pad(rnd(24)) + ':' + pad(rnd(60)) : ['25:00', '7am', '', ':30'][rnd(4)];
  const pad = n => (n < 10 ? '0' : '') + n;

  for (let run = 0; run < 200; run++) {
    const list = [];
    for (let i = 0, n = 1 + rnd(6); i < n; i++) {
      list.push({ start: stamp(), end: stamp(), stationId: ids[rnd(ids.length)], volume: 50 });
    }
    const anchor = rnd(2) ? list[rnd(list.length)] : null;
    const r = S.settle(list, stations, anchor);
    const errs = S.validateSlots(r.slots, ['cfrb', 'kiss']);
    assert.deepEqual(errs, [], 'run ' + run + ' left ' + JSON.stringify(times(r.slots)));
    assert.deepEqual(S.settle(r.slots, stations, null).changes, [], 'run ' + run + ' was not settled');
  }
});

test('settle: the anchor is never the one that gives way', () => {
  let seed = 7;
  const rnd = n => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
  const pad = n => (n < 10 ? '0' : '') + n;
  const stamp = () => pad(rnd(24)) + ':' + pad(rnd(60));

  for (let run = 0; run < 100; run++) {
    const list = [];
    for (let i = 0, n = 2 + rnd(4); i < n; i++) list.push(slot(stamp(), stamp()));
    const anchor = list[rnd(list.length)];
    const was = { start: anchor.start, end: anchor.end };
    const r = S.settle(list, stations, anchor);
    if (S.shapeOf(was)) {
      assert.equal(anchor.start, was.start, 'run ' + run);
      assert.equal(anchor.end, was.end, 'run ' + run);
      assert.ok(r.slots.indexOf(anchor) !== -1, 'run ' + run + ': the anchor survived');
    }
  }
});

// ---------- suggestSlot ----------

test('suggestSlot: an empty day opens at seven', () => {
  assert.deepEqual(S.suggestSlot([]), { start: '07:00', end: '10:00' });
});

test('suggestSlot: the rest of the day, stopping at eleven at night', () => {
  assert.deepEqual(S.suggestSlot([slot('07:00', '10:00')]), { start: '10:00', end: '23:00' });
});

test('suggestSlot: a gap in the middle is filled exactly', () => {
  assert.deepEqual(S.suggestSlot([slot('07:00', '10:00'), slot('14:00', '23:00')]),
    { start: '10:00', end: '14:00' });
});

test('suggestSlot: with the day taken, the night is what is left', () => {
  const day = [slot('07:00', '10:00'), slot('10:00', '14:00'), slot('14:00', '23:00')];
  assert.deepEqual(S.suggestSlot(day), { start: '23:00', end: '07:00' });
});

test('suggestSlot: nothing to offer on a full day', () => {
  assert.equal(S.suggestSlot([slot('08:00', '08:00')]), null);
});

test('suggestSlot: what it offers never collides', () => {
  const day = [slot('07:00', '10:00'), slot('14:00', '23:00')];
  const home = S.suggestSlot(day);
  const r = S.settle(day.concat([slot(home.start, home.end)]), stations, null);
  assert.deepEqual(r.changes, [], 'the suggestion needed no trimming');
  assert.equal(r.slots.length, 3);
});
