/* Deskside Radio — schedule resolution. Pure functions, no DOM.
   Slots: { start: "HH:MM", end: "HH:MM", stationId, volume }.
   Slot end is exclusive. A slot with start > end wraps past midnight and
   only matches within its own day group. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Scheduler = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var DAY = 1440;

  function dayGroup(date) {
    var d = date.getDay();
    return d === 0 || d === 6 ? 'weekend' : 'weekday';
  }

  function parseHHMM(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(s || '');
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  function minutesOfDay(date) {
    return date.getHours() * 60 + date.getMinutes();
  }

  function contains(slot, minute) {
    var s = parseHHMM(slot.start), e = parseHHMM(slot.end);
    if (s === null || e === null || s === e) return false;
    return s < e ? (minute >= s && minute < e) : (minute >= s || minute < e);
  }

  function activeSlot(schedule, date) {
    var slots = schedule[dayGroup(date)] || [];
    for (var i = 0; i < slots.length; i++) if (contains(slots[i], minutesOfDay(date))) return slots[i];
    return null;
  }

  // Next moment the active slot changes, searching up to 7 days ahead.
  function nextChange(schedule, date) {
    var now = minutesOfDay(date);
    for (var day = 0; day < 8; day++) {
      var d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + day);
      var slots = schedule[dayGroup(d)] || [];
      var floor = day === 0 ? now : -1;
      var best = null;
      for (var i = 0; i < slots.length; i++) {
        var s = parseHHMM(slots[i].start), e = parseHHMM(slots[i].end);
        if (s === null || e === null || s === e) continue;
        var edges = [{ t: s, slot: slots[i] }, { t: e, slot: null }];
        for (var k = 0; k < edges.length; k++) {
          if (edges[k].t > floor && (best === null || edges[k].t < best.t)) best = edges[k];
        }
      }
      if (best) {
        var at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, best.t);
        // An end edge only counts as a change if nothing else starts there.
        return { at: at, slot: best.slot || activeSlot(schedule, at) };
      }
    }
    return null;
  }

  function intervals(slot) {
    var s = parseHHMM(slot.start), e = parseHHMM(slot.end);
    return s < e ? [[s, e]] : [[s, DAY], [0, e]];
  }

  function overlaps(a, b) {
    var ia = intervals(a), ib = intervals(b);
    for (var i = 0; i < ia.length; i++) for (var j = 0; j < ib.length; j++) {
      if (ia[i][0] < ib[j][1] && ib[j][0] < ia[i][1]) return true;
    }
    return false;
  }

  function validateSlots(slots, stationIds) {
    var errors = [];
    var ok = [];
    slots.forEach(function (slot, i) {
      var s = parseHHMM(slot.start), e = parseHHMM(slot.end);
      if (s === null || e === null) { errors.push({ index: i, message: 'Time must be HH:MM (00:00–23:59).' }); return; }
      if (s === e) { errors.push({ index: i, message: 'Start and end are the same time.' }); return; }
      if (stationIds.indexOf(slot.stationId) === -1) { errors.push({ index: i, message: 'Pick a station.' }); return; }
      ok.push(i);
    });
    for (var a = 0; a < ok.length; a++) for (var b = a + 1; b < ok.length; b++) {
      if (overlaps(slots[ok[a]], slots[ok[b]])) {
        errors.push({ index: ok[b], message: 'Overlaps slot ' + (ok[a] + 1) + '.' });
      }
    }
    return errors;
  }

  /* What should be playing right now?

     A schedule slot always wins. After that the two callers want different
     things: pressing Play resumes whatever the display shows, while
     recovering from a dropped stream returns to the last configuration
     known to work. Letting Play consult lastGood was a bug: a station
     played for under ten seconds never became lastGood, so stopping and
     starting jumped back to the station before it. */
  var THEMES = ['dial', 'console', 'rams', 'editorial', 'retro', 'departures', 'marconi'];

  function clampNum(v, lo, hi) {
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return Math.max(lo, Math.min(hi, Math.round(v)));
  }

  /* What a slot imposes the moment it becomes the active one. Each setting
     is opt-in except volume, which every slot has always carried and always
     applied, so an absent flag there has to keep meaning yes. A null says
     leave that setting exactly as the listener has it. */
  function slotSettings(slot) {
    var out = { volume: null, bass: null, treble: null, theme: null };
    if (!slot) return out;
    if (slot.applyVolume !== false) out.volume = clampNum(slot.volume, 0, 100);
    if (slot.applyBass) out.bass = clampNum(slot.bass, -12, 12);
    if (slot.applyTreble) out.treble = clampNum(slot.treble, -12, 12);
    if (slot.applyTheme && THEMES.indexOf(slot.theme) !== -1) out.theme = slot.theme;
    return out;
  }

  function hasStation(stations, id) {
    for (var i = 0; i < stations.length; i++) if (stations[i].id === id) return true;
    return false;
  }

  function playTarget(state, now, forRecovery) {
    var stations = (state && state.stations) || [];
    if (!stations.length) return null;
    var has = function (id) { return hasStation(stations, id); };

    if (state.schedulerEnabled) {
      var slot = activeSlot(state.schedule || {}, now);
      if (slot && has(slot.stationId)) {
        var want = slotSettings(slot).volume;
        return { stationId: slot.stationId, volume: want === null ? state.volume : want };
      }
    }
    if (forRecovery && state.lastGood && has(state.lastGood.stationId)) {
      return { stationId: state.lastGood.stationId, volume: state.lastGood.volume };
    }
    var current = has(state.currentStationId) ? state.currentStationId : stations[0].id;
    return { stationId: current, volume: state.volume };
  }

  /* What, if anything, should start playing the moment the app opens.
     An active schedule slot outranks the launch station, because the
     schedule is there to decide what plays at a given time and the next
     tick would switch to it a few seconds later anyway. A launch station
     that has since been deleted falls back to whatever is on the display:
     starting the wrong station beats refusing to start at all. */
  function bootTarget(state, now) {
    if (!state || !state.autoplay) return null;
    var stations = state.stations || [];
    if (!stations.length) return null;

    if (state.schedulerEnabled) {
      var slot = activeSlot(state.schedule || {}, now);
      if (slot && hasStation(stations, slot.stationId)) {
        var want = slotSettings(slot).volume;
        return { stationId: slot.stationId, volume: want === null ? state.volume : want };
      }
    }
    if (hasStation(stations, state.autoplayStationId)) {
      return { stationId: state.autoplayStationId, volume: state.volume };
    }
    var fallback = hasStation(stations, state.currentStationId) ? state.currentStationId : stations[0].id;
    return { stationId: fallback, volume: state.volume };
  }

  function backoffMs(attempt) {
    return Math.min(2000 * Math.pow(2, Math.max(0, attempt - 1)), 30000);
  }

  return { playTarget: playTarget, bootTarget: bootTarget, slotSettings: slotSettings, backoffMs: backoffMs, dayGroup: dayGroup, parseHHMM: parseHHMM, minutesOfDay: minutesOfDay, activeSlot: activeSlot, nextChange: nextChange, validateSlots: validateSlots };
});
