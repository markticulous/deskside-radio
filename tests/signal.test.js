const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../signal.js');

const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

// ---------- band parsing / needle position ----------

test('parseBand reads the frequency and band out of a label', () => {
  assert.deepEqual(S.parseBand('1010 AM'), { kind: 'am', value: 1010 });
  assert.deepEqual(S.parseBand('92.5 FM'), { kind: 'fm', value: 92.5 });
  assert.deepEqual(S.parseBand('  99.9  fm '), { kind: 'fm', value: 99.9 });
  assert.equal(S.parseBand('Internet only'), null);
  assert.equal(S.parseBand(''), null);
  assert.equal(S.parseBand(undefined), null);
});

test('dialPercent places a frequency on the printed scale', () => {
  // AM band runs 530-1700 kHz.
  near(S.dialPercent('am', 530), 0);
  near(S.dialPercent('am', 1700), 100);
  near(S.dialPercent('am', 1010), 41.03);
  // FM band runs 88-108 MHz.
  near(S.dialPercent('fm', 88), 0);
  near(S.dialPercent('fm', 108), 100);
  near(S.dialPercent('fm', 92.5), 22.5);
});

test('dialPercent clamps out-of-band values and rejects unknown bands', () => {
  assert.equal(S.dialPercent('am', 100), 0);
  assert.equal(S.dialPercent('fm', 200), 100);
  assert.equal(S.dialPercent('sw', 1010), null);
});

test('scaleTicks: AM ticks span the band and only majors carry labels', () => {
  const ticks = S.scaleTicks('am');
  assert.equal(ticks[0].pct, 0);
  assert.equal(ticks[ticks.length - 1].pct, 100);
  const labelled = ticks.filter(t => t.label !== null);
  assert.deepEqual(labelled.map(t => t.label), ['600', '700', '800', '900', '1000', '1100', '1200', '1300', '1400', '1500', '1600']);
  assert.ok(labelled.every(t => t.major));
  const six = labelled[0];
  near(six.pct, S.dialPercent('am', 600));
});

test('scaleTicks: FM majors sit every 2 MHz from 88 to 108', () => {
  const labelled = S.scaleTicks('fm').filter(t => t.label !== null);
  assert.deepEqual(labelled.map(t => t.label), ['88', '90', '92', '94', '96', '98', '100', '102', '104', '106', '108']);
  near(labelled[0].pct, 0);
  near(labelled[labelled.length - 1].pct, 100);
});

test('scaleTicks: minor ticks are denser than majors and none escape the scale', () => {
  ['am', 'fm'].forEach(kind => {
    const ticks = S.scaleTicks(kind);
    assert.ok(ticks.filter(t => !t.major).length > ticks.filter(t => t.major).length);
    assert.ok(ticks.every(t => t.pct >= 0 && t.pct <= 100));
  });
});

test('scaleTicks rejects an unknown band', () => {
  assert.deepEqual(S.scaleTicks('sw'), []);
});

// ---------- VU metering ----------

test('rmsToVu: silence rests the needle at zero', () => {
  assert.equal(S.rmsToVu(0), 0);
  assert.equal(S.rmsToVu(-1), 0);
});

test('rmsToVu: 0 VU sits where the face prints it', () => {
  // 0 VU is referenced to -18 dBFS, and the face runs -20 VU to +3 VU.
  const zeroVuRms = Math.pow(10, -18 / 20);
  near(S.rmsToVu(zeroVuRms), 20 / 23, 0.005);
});

test('rmsToVu: full scale pins the needle at the top of the red', () => {
  assert.equal(S.rmsToVu(1), 1);
  assert.equal(S.rmsToVu(4), 1);
});

test('rmsToVu: quiet program sits low but off the stop, and rises with level', () => {
  const quiet = S.rmsToVu(Math.pow(10, -35 / 20));
  const loud = S.rmsToVu(Math.pow(10, -22 / 20));
  assert.ok(quiet > 0 && quiet < 0.3, 'quiet=' + quiet);
  assert.ok(loud > quiet && loud < 1, 'loud=' + loud);
});

test('vuBallistics: needle moves toward the target, never past it', () => {
  const up = S.vuBallistics(0, 1, 100);
  assert.ok(up > 0 && up < 1, 'up=' + up);
  const down = S.vuBallistics(1, 0, 100);
  assert.ok(down < 1 && down > 0, 'down=' + down);
});

test('vuBallistics: rise is quicker than fall, as a real VU movement is damped', () => {
  const rise = S.vuBallistics(0, 1, 120);
  const fall = 1 - S.vuBallistics(1, 0, 120);
  assert.ok(rise > fall, `rise=${rise} should outpace fall=${fall}`);
});

test('vuBallistics: settles onto the target and survives a stalled frame', () => {
  let v = 0;
  for (let i = 0; i < 40; i++) v = S.vuBallistics(v, 0.8, 50);
  near(v, 0.8, 0.01);
  assert.equal(S.vuBallistics(0.5, 0.5, 0), 0.5);
  assert.ok(S.vuBallistics(0, 1, 100000) <= 1);
});

// ---------- VU face geometry ----------

test('vuAngle sweeps the needle across the printed arc', () => {
  near(S.vuAngle(0), -52);
  near(S.vuAngle(1), 52);
  near(S.vuAngle(0.5), 0);
});

test('vuMarks: the face is labelled from -20 to +3 with 0 VU where it belongs', () => {
  const marks = S.vuMarks();
  assert.equal(marks[0].vu, -20);
  assert.equal(marks[marks.length - 1].vu, 3);
  const zero = marks.find(m => m.vu === 0);
  assert.ok(zero.major);
  // 0 VU is 20/23 of the way along the scale, so it sits right of centre.
  near(zero.angle, S.vuAngle(20 / 23));
  assert.ok(zero.angle > 30 && zero.angle < 45, 'zero at ' + zero.angle);
});

test('vuMarks: angles rise with level and stay inside the arc', () => {
  const marks = S.vuMarks();
  for (let i = 1; i < marks.length; i++) assert.ok(marks[i].angle > marks[i - 1].angle);
  assert.ok(marks.every(m => m.angle >= -52 && m.angle <= 52));
  assert.ok(marks.some(m => m.label !== null) && marks.some(m => m.label === null));
});

test('vuPoint puts a mark on the arc at the given angle and radius', () => {
  const top = S.vuPoint(0, 76);
  near(top.x, 100); near(top.y, 108 - 76);
  const right = S.vuPoint(90, 76);
  near(right.x, 176); near(right.y, 108);
});

// ---- station name layout ----

test('splitStationName puts a trailing frequency on its own line', () => {
  assert.deepEqual(S.splitStationName('NewsTalk 1010'), ['NewsTalk', '1010']);
  assert.deepEqual(S.splitStationName('KISS 92.5'), ['KISS', '92.5']);
  assert.deepEqual(S.splitStationName('Indie 88.1 FM'), ['Indie', '88.1 FM']);
});

test('splitStationName leaves a name with no trailing number alone', () => {
  assert.deepEqual(S.splitStationName('CBC Radio One'), ['CBC Radio One']);
  assert.deepEqual(S.splitStationName('Q107'), ['Q107']);
  assert.deepEqual(S.splitStationName(''), ['']);
});

test('splitStationName trims and tolerates extra spacing', () => {
  assert.deepEqual(S.splitStationName('  NewsTalk   1010  '), ['NewsTalk', '1010']);
});

// ---- volume taper ----

test('volumeToGain runs from silence to unity and never above it', () => {
  assert.equal(S.volumeToGain(0), 0);
  near(S.volumeToGain(100), 1, 1e-12);
  for (let v = 0; v <= 100; v++) assert.ok(S.volumeToGain(v) <= 1, "exceeds unity at " + v);
});

test('volumeToGain is linear in decibels, so every step of the fader is worth the same', () => {
  // Measured: a power-law fader spends its top third inside 1 dB on real
  // broadcast material. Constant dB per unit is what keeps climbing.
  const db = (v) => 20 * Math.log10(S.volumeToGain(v));
  for (let v = 10; v <= 90; v += 10) near(db(v + 10) - db(v), 6, 0.001);
});

test('volumeToGain leaves the top of the travel plenty to do', () => {
  const db = (v) => 20 * Math.log10(S.volumeToGain(v));
  near(db(100) - db(70), 18, 0.001);
  near(db(100) - db(95), 3, 0.001);
});

test('volumeToGain spans a usable range and rises monotonically', () => {
  const db = (v) => 20 * Math.log10(S.volumeToGain(v));
  near(db(100) - db(1), 59.4, 0.001);
  let prev = -1;
  for (let v = 0; v <= 100; v += 5) {
    const g = S.volumeToGain(v);
    assert.ok(g > prev, "not rising at " + v);
    prev = g;
  }
});

test('volumeToGain clamps out-of-range input', () => {
  assert.equal(S.volumeToGain(-20), 0);
  near(S.volumeToGain(400), 1, 1e-12);
});

// ---- waveform ----

test('peakOf returns the loudest excursion in the frame, either polarity', () => {
  near(S.peakOf([0, 0.2, -0.8, 0.3]), 0.8);
  near(S.peakOf([-1, 0.5]), 1);
  assert.equal(S.peakOf([0, 0, 0]), 0);
});

test('peakOf clamps and copes with an empty or missing frame', () => {
  assert.equal(S.peakOf([]), 0);
  assert.equal(S.peakOf(null), 0);
  assert.equal(S.peakOf([4, -9]), 1);
});

// ---- carrying a saved volume across the curve change ----

test('migrateVolume keeps the old setting at the same loudness', () => {
  // The old curve reached unity at 65 and was clamped there on the element path.
  assert.equal(S.migrateVolume(100), 100);
  assert.equal(S.migrateVolume(65), 100);
  assert.equal(S.migrateVolume(0), 0);
});

test('migrateVolume moves a mid setting up the new scale, not down', () => {
  // 60 was almost full volume under the old curve, so it must land near the top.
  const v = S.migrateVolume(60);
  assert.ok(v > 90 && v <= 100, 'got ' + v);
  assert.ok(S.migrateVolume(30) > 60, 'got ' + S.migrateVolume(30));
});

test('migrateVolume never goes backwards and stays in range', () => {
  let prev = -1;
  for (let v = 0; v <= 100; v += 5) {
    const out = S.migrateVolume(v);
    assert.ok(out >= prev, 'went backwards at ' + v);
    assert.ok(out >= 0 && out <= 100);
    prev = out;
  }
});
