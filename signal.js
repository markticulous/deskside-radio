/* Deskside Radio — dial geometry and VU ballistics. Pure functions, no DOM.

   Dial scales use the real North American broadcast bands so a station's
   needle lands where a receiver would put it. VU metering follows the
   standard movement: 0 VU referenced to -18 dBFS, ~300 ms to settle. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Signal = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var BANDS = {
    am: { min: 530, max: 1700, minor: 10, major: 100, labelFrom: 600, labelTo: 1600 },
    fm: { min: 88, max: 108, minor: 0.2, major: 2, labelFrom: 88, labelTo: 108 }
  };

  /* 0 VU sits here on the digital scale.

     Measured rather than chosen: twelve seconds of each of two real
     stations, read off the needle. NewsTalk 1010 ran a median of -18.2
     dBFS, KISS 92.5 a median of -17.9 -- both, in other words, sitting
     almost exactly on the old -18 reference. That is a correctly
     calibrated VU meter and it looked wrong: with 0 VU printed at 20/23
     of the way up the face, program at 0 VU parks the needle at 87% of
     its travel and it appears to be pinned, which is what it was reported
     as.

     At -15 the same two stations read a median of about -3 VU, peaks
     touching 0 and the red kept for transients that genuinely are loud.
     The needle then uses the middle of its face, which is what a meter is
     for. Nothing about the scale itself moves; this is the gain in front
     of it. */
  var VU_REF_DBFS = -15;
  var VU_MIN = -20;        // leftmost mark printed on the face
  var VU_MAX = 3;          // rightmost mark, top of the red
  var RISE_MS = 150;
  var FALL_MS = 400;

  function round(n, places) { var f = Math.pow(10, places); return Math.round(n * f) / f; }
  function clamp(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; }

  /* The digit counts are a bound, not a fussy reading of the bands. An
     unbounded \d+ followed by an optional group backtracks quadratically
     when the text is all digits and no am/fm ever arrives: 40,000 of them
     took 830ms here, and a station name is whatever a settings file says
     it is. Four digits and two decimals hold every band there is. */
  function parseBand(text) {
    var m = /(\d{1,4}(?:\.\d{1,2})?)\s*(am|fm)\b/i.exec(text || '');
    if (!m) return null;
    return { kind: m[2].toLowerCase(), value: parseFloat(m[1]) };
  }

  function dialPercent(kind, value) {
    var b = BANDS[kind];
    if (!b) return null;
    return round(clamp((value - b.min) / (b.max - b.min) * 100, 0, 100), 4);
  }

  function scaleTicks(kind) {
    var b = BANDS[kind];
    if (!b) return [];
    var steps = Math.round((b.max - b.min) / b.minor);
    var ticks = [];
    for (var i = 0; i <= steps; i++) {
      var value = round(b.min + i * b.minor, 4);
      var major = Math.round(value / b.minor) % Math.round(b.major / b.minor) === 0;
      var labelled = major && value >= b.labelFrom && value <= b.labelTo;
      ticks.push({ value: value, pct: dialPercent(kind, value), major: major, label: labelled ? String(value) : null });
    }
    return ticks;
  }

  // Root-mean-square sample level (0..1) to needle travel across the face (0..1).
  function rmsToVu(rms) {
    if (!(rms > 0)) return 0;
    var vu = 20 * Math.log10(rms) - VU_REF_DBFS;
    return clamp((vu - VU_MIN) / (VU_MAX - VU_MIN), 0, 1);
  }

  // Station names read better with the frequency on its own line.
  // Split at the first token that begins with a digit, never at position zero.
  function splitStationName(text) {
    var t = String(text == null ? '' : text).trim().replace(/\s+/g, ' ');
    var parts = t.split(' ');
    for (var i = 1; i < parts.length; i++) {
      if (/^[0-9]/.test(parts[i])) return [parts.slice(0, i).join(' '), parts.slice(i).join(' ')];
    }
    return [t];
  }

  // ---- face geometry ----
  // The needle sweeps 104 degrees. Because 0 VU is 20/23 of the way up a
  // -20..+3 face, it lands right of centre with the red zone beyond it.
  var VU_SWEEP = 104;
  var VU_PIVOT = { x: 100, y: 108 };
  var VU_MARKS = [-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3];
  var VU_MAJOR = [-20, -10, -5, 0, 3];
  var VU_LABELLED = [-20, -10, 0, 3];

  function vuAngle(fraction) {
    return round(-VU_SWEEP / 2 + clamp(fraction, 0, 1) * VU_SWEEP, 4);
  }

  function vuFraction(vu) { return (vu - VU_MIN) / (VU_MAX - VU_MIN); }

  function vuPoint(angleDeg, radius) {
    var a = angleDeg * Math.PI / 180;
    return { x: round(VU_PIVOT.x + radius * Math.sin(a), 3), y: round(VU_PIVOT.y - radius * Math.cos(a), 3) };
  }

  function vuMarks() {
    return VU_MARKS.map(function (vu) {
      var major = VU_MAJOR.indexOf(vu) !== -1;
      return {
        vu: vu,
        major: major,
        angle: vuAngle(vuFraction(vu)),
        label: VU_LABELLED.indexOf(vu) !== -1 ? (vu > 0 ? '+' + vu : String(vu)) : null
      };
    });
  }

  /* Faders are heard in decibels, so they have to be built in decibels.

     Two earlier attempts used power laws. Both crowded the top of the
     travel: measured through the real graph, the last third was worth
     1.6 dB on typical broadcast material and 0.9 dB on a hot station,
     which is why it felt like it stopped working well before 100. This
     curve gives every unit the same 0.4 dB, so the fader keeps climbing
     the whole way, and it tops out at unity: the stream as broadcast,
     never amplified, so nothing downstream has to catch clipping.

     40 dB of it, not 60. At 60 the bottom third ran from -60 to -40, and
     broadcast programme already arrives at around -15 to -20 dBFS -- so
     that third came out at -55 to -60 absolute, which on a laptop speaker
     is nothing at all. The whole of it was travel nobody could hear, and
     the sound then seemed to ramp in around the middle: not the curve
     bending, but audibility arriving. Measured as a table before it was
     changed, and reported as exactly that. */
  var VOL_RANGE_DB = 40;   // silence to unity across the travel

  /* The width it used to be, kept for carrying saved settings across. */
  var OLD_RANGE_DB = 60;

  function volumeToGain(percent) {
    var v = clamp(Number(percent) || 0, 0, 100);
    if (v <= 0) return 0;
    return Math.pow(10, (v / 100 * VOL_RANGE_DB - VOL_RANGE_DB) / 20);
  }

  // Loudest excursion in a frame of samples, for the scrolling waveform.
  function peakOf(samples) {
    if (!samples || !samples.length) return 0;
    var peak = 0;
    for (var i = 0; i < samples.length; i++) {
      var v = samples[i] < 0 ? -samples[i] : samples[i];
      if (v > peak) peak = v;
    }
    return clamp(peak, 0, 1);
  }

  /* A volume saved under the old power-law curve means something different
     on this one: 60 used to be nearly full and is 24 dB down here. Carry the
     setting across at the loudness it used to produce, so the app sounds the
     same the first time it opens after the change. */
  function migrateVolume(oldPercent) {
    var v = clamp(Number(oldPercent) || 0, 0, 100);
    if (v <= 0) return 0;
    var oldGain = Math.min(1, 3 * Math.pow(v / 100, 2.5502));
    var db = 20 * Math.log10(oldGain);
    return toSlider(db);
  }

  /* A setting saved on the 60 dB fader, to the same loudness on this one.
     Without it every radio would come back 10 dB louder on update. */
  function migrateVolume60(oldPercent) {
    var v = clamp(Number(oldPercent) || 0, 0, 100);
    if (v <= 0) return 0;
    return toSlider(v / 100 * OLD_RANGE_DB - OLD_RANGE_DB);
  }

  /* A loudness in dB below unity to a slider position. Anything quieter than
     the range reaches lands on 1 and not 0: quiet is not muted, and a
     migration must never be what silences somebody's radio. */
  function toSlider(db) {
    return Math.round(clamp(100 + db / (VOL_RANGE_DB / 100), 1, 100));
  }

  // Damped movement: quick to rise, slow to fall, like a real meter.
  function vuBallistics(prev, target, dtMs) {
    if (!(dtMs > 0)) return prev;
    var tau = target > prev ? RISE_MS : FALL_MS;
    var alpha = 1 - Math.exp(-dtMs / tau);
    return clamp(prev + (target - prev) * alpha, 0, 1);
  }

  return {
    BANDS: BANDS,
    parseBand: parseBand,
    splitStationName: splitStationName,
    dialPercent: dialPercent,
    scaleTicks: scaleTicks,
    rmsToVu: rmsToVu,
    volumeToGain: volumeToGain,
    migrateVolume60: migrateVolume60,
    migrateVolume: migrateVolume,
    VOL_RANGE_DB: VOL_RANGE_DB,
    peakOf: peakOf,
    vuAngle: vuAngle,
    vuFraction: vuFraction,
    vuPoint: vuPoint,
    vuMarks: vuMarks,
    VU_PIVOT: VU_PIVOT,
    vuBallistics: vuBallistics
  };
});
