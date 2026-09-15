/* Deskside Radio — schedule resolution. Pure functions, no DOM.

   A slot is { id, start: "HH:MM", end: "HH:MM", stationId, volume,
   applyVolume, bass, applyBass, treble, applyTreble, theme, applyTheme }.
   Ends are exclusive, so 07:00-10:00 stops at the first instant of 10:00
   and an adjacent slot starting there picks it up cleanly.

   Three shapes, by how start compares to end:

     start < end   an ordinary span within one day
     start > end   runs past midnight
     start = end   all day

   A slot belongs to the day it starts on. That is the whole of the
   midnight rule, and it decides the case that used to be wrong: a weekday
   slot running 23:00 to 01:00 covers Saturday's small hours, because it
   began on Friday, and does not reappear on Monday morning. Where the tail
   of one day's slot meets the head of the next day's, the tail wins --
   something already playing finishes before anything new starts.

   An all-day slot covers every minute of its own group's day and does not
   spill into the next; the times on it are a formality. It used to mean
   the opposite, matching nothing at all, which is why app.js drops
   equal-time slots once on upgrade. See scheduleV there.

   settle() is the gate every write goes through. Whatever comes out of it
   satisfies validateSlots, so nothing downstream has to cope with an
   overlapping, unsorted or dangling schedule. */
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

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(min) { var m = ((min % DAY) + DAY) % DAY; return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); }

  /* What shape a slot is, or null when its times do not parse. Everything
     that has to reason about midnight goes through this rather than
     comparing start against end for itself. */
  function shapeOf(slot) {
    if (!slot) return null;
    var s = parseHHMM(slot.start), e = parseHHMM(slot.end);
    if (s === null || e === null) return null;
    if (s === e) return { kind: 'all', s: s, e: e, len: DAY };
    if (s < e) return { kind: 'plain', s: s, e: e, len: e - s };
    return { kind: 'wrap', s: s, e: e, len: DAY - s + e };
  }

  /* Within the slot's own day. The tail of a wrapping slot belongs to the
     next day and is asked for separately, by activeSlot. */
  function contains(slot, minute) {
    var k = shapeOf(slot);
    if (!k) return false;
    if (k.kind === 'all') return true;
    return k.kind === 'plain' ? (minute >= k.s && minute < k.e) : (minute >= k.s || minute < k.e);
  }

  /* Yesterday's group is consulted first, and only for the tail of a slot
     that ran past midnight. That is what makes a slot belong to the day it
     starts on, and it settles the collision at 00:00 in favour of whatever
     is already playing. Every Saturday and every Monday is a day whose
     group differs from yesterday's, which is where this shows. */
  function activeSlot(schedule, date) {
    var minute = minutesOfDay(date);

    var y = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
    var tails = schedule[dayGroup(y)] || [];
    for (var i = 0; i < tails.length; i++) {
      var t = shapeOf(tails[i]);
      if (t && t.kind === 'wrap' && minute < t.e) return tails[i];
    }

    var slots = schedule[dayGroup(date)] || [];
    for (var j = 0; j < slots.length; j++) {
      var k = shapeOf(slots[j]);
      if (!k) continue;
      if (k.kind === 'all') return slots[j];
      if (k.kind === 'plain' && minute >= k.s && minute < k.e) return slots[j];
      if (k.kind === 'wrap' && minute >= k.s) return slots[j];
    }
    return null;
  }

  /* Every minute on a given day at which the answer could differ from the
     minute before: midnight, because the day group may have changed and a
     tail may have run out; both edges of every slot in that day's group;
     and the end of any of yesterday's slots that ran past midnight. */
  function edgeMinutes(schedule, d) {
    var out = [0], seen = { 0: true };
    function add(m) { if (!seen[m]) { seen[m] = true; out.push(m); } }

    var slots = schedule[dayGroup(d)] || [];
    for (var i = 0; i < slots.length; i++) {
      var k = shapeOf(slots[i]);
      if (!k) continue;
      add(k.s);
      if (k.kind !== 'all') add(k.e);
    }
    var y = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    var tails = schedule[dayGroup(y)] || [];
    for (var j = 0; j < tails.length; j++) {
      var t = shapeOf(tails[j]);
      if (t && t.kind === 'wrap') add(t.e);
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  /* The next moment the active slot actually changes, searched a week out.

     Asked as a question about the answer rather than about the edges: walk
     the candidate instants in order and return the first whose activeSlot
     differs from this one's. Working from edges alone got this wrong twice
     over -- it put a wrapping slot's end on the day it started, and it
     counted an edge as a change when the slot either side of it was the
     same one. */
  function nextChange(schedule, date) {
    var current = activeSlot(schedule, date);
    for (var day = 0; day < 8; day++) {
      var d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + day);
      var mins = edgeMinutes(schedule, d);
      for (var i = 0; i < mins.length; i++) {
        var at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, mins[i]);
        if (at.getTime() <= date.getTime()) continue;
        var slot = activeSlot(schedule, at);
        if (slot !== current) return { at: at, slot: slot };
      }
    }
    return null;
  }

  /* Asked only when nothing is playing on the schedule's account: is
     anything going to start again before midnight? That is what "the last
     slot of the day" means to the code that may turn the radio off. */
  function dayIsOver(schedule, date) {
    var n = nextChange(schedule, date);
    return !n || n.at.toDateString() !== date.toDateString();
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

  /* ---------- the gate ----------

     Everything that writes a schedule goes through settle: typing a time,
     adding a slot, deleting one, deleting a station, importing a file,
     loading from storage. What comes out satisfies validateSlots, so no
     caller anywhere has to handle an overlapping, unsorted or dangling
     schedule -- and the save button has nothing left to refuse.

     One rule, which the whole of the trimming is: what you just set stays,
     anything it runs into is cut back to make room, and a slot with
     nothing left is removed. */

  // Minutes of the day this list already occupies, midnight wraps included.
  function occupancy(slots) {
    var busy = new Uint8Array(DAY);
    for (var i = 0; i < (slots || []).length; i++) {
      var k = shapeOf(slots[i]);
      if (k) fill(busy, k.s, k.len);
    }
    return busy;
  }

  function fill(busy, from, len) {
    for (var i = 0; i < len; i++) busy[(from + i) % DAY] = 1;
  }

  /* Where a slot can still go, given what is already taken. Walks forward
     from the slot's own start: skips whatever is occupied, then keeps the
     free run until the next occupied minute or its own end.

     All four cases of the rule fall out of that one walk. Something taking
     the slot's start pushes it later; something taking its end pulls it
     earlier; something covering it entirely leaves no free run at all; and
     something landing in its middle leaves the part before, which is the
     part the listener was going to hear first. */
  function fitInto(busy, k) {
    if (k.kind === 'all') {
      for (var m = 0; m < DAY; m++) if (busy[m]) return null;
      return { s: k.s, e: k.e, len: DAY };
    }
    var i = 0;
    while (i < k.len && busy[(k.s + i) % DAY]) i++;
    if (i >= k.len) return null;
    var j = i;
    while (j < k.len && !busy[(k.s + j) % DAY]) j++;
    return { s: (k.s + i) % DAY, e: (k.s + j) % DAY, len: j - i };
  }

  function nameOf(slot, byId) {
    var st = byId[slot.stationId];
    var name = st && String(st.name || '').trim();
    return name || ('the ' + (slot.start || '--:--') + ' slot');
  }

  function span(a, b) { return a + ' to ' + b; }

  /* settle(slots, stations, anchor)

     anchor is the slot just edited or added -- it is placed first and so
     always keeps what it was given. With no anchor, the earlier start
     wins, which is what importing or loading a file wants.

     Surviving slots are mutated in place, so the drawer's open card, the
     focused field and every listener bound to a slot object all survive a
     settle. The array that comes back is new and sorted. */
  function settle(slots, stations, anchor) {
    var list = slots || [], people = stations || [];
    var byId = {};
    for (var n = 0; n < people.length; n++) if (people[n] && people[n].id) byId[people[n].id] = people[n];
    var fallback = people.length ? people[0] : null;

    var order = [];
    for (var i = 0; i < list.length; i++) order.push({ slot: list[i], i: i });
    order.sort(function (a, b) {
      if (anchor) {
        if (a.slot === anchor) return -1;
        if (b.slot === anchor) return 1;
      }
      var as = parseHHMM(a.slot.start), bs = parseHHMM(b.slot.start);
      if (as === null) as = DAY + 1;
      if (bs === null) bs = DAY + 1;
      return as === bs ? a.i - b.i : as - bs;
    });

    var busy = new Uint8Array(DAY), kept = [], changes = [];

    for (var o = 0; o < order.length; o++) {
      var slot = order[o].slot;
      var k = shapeOf(slot);

      if (!k) {
        changes.push({ kind: 'removed', why: 'time', slot: slot, id: slot.id,
          text: 'Removed a slot with no valid time.' });
        continue;
      }

      var was = { start: slot.start, end: slot.end };

      if (!byId[slot.stationId]) {
        if (!fallback) {
          changes.push({ kind: 'removed', why: 'station', slot: slot, id: slot.id,
            text: 'Removed ' + span(was.start, was.end) + ': its station is gone.' });
          continue;
        }
        slot.stationId = fallback.id;
        changes.push({ kind: 'repointed', slot: slot, id: slot.id, before: was,
          text: span(was.start, was.end) + ' now plays ' + (String(fallback.name || '').trim() || 'another station') + '.' });
      }

      var fit = fitInto(busy, k);
      if (!fit) {
        changes.push({ kind: 'removed', why: 'overlap', slot: slot, id: slot.id, before: was,
          text: 'Removed ' + nameOf(slot, byId) + ', ' + span(was.start, was.end) + ', to make room.' });
        continue;
      }

      if (fit.s !== k.s || fit.e !== k.e) {
        slot.start = hhmm(fit.s);
        slot.end = hhmm(fit.e);
        var movedStart = fit.s !== k.s, movedEnd = fit.e !== k.e;
        changes.push({ kind: 'trimmed', slot: slot, id: slot.id, before: was,
          text: movedStart && movedEnd
            ? 'Shortened ' + nameOf(slot, byId) + ' to ' + span(slot.start, slot.end) + ' to make room.'
            : 'Shortened ' + nameOf(slot, byId) + ' to ' + (movedStart ? 'start ' + slot.start : 'end ' + slot.end) + ' to make room.' });
      }

      fill(busy, fit.s, fit.len);
      kept.push(slot);
    }

    kept.sort(function (a, b) { return parseHHMM(a.start) - parseHHMM(b.start); });
    return { slots: kept, changes: changes };
  }

  /* Where "+ Add time slot" should put the next one: the first free
     stretch worth having, hunted from the earliest slot round the clock,
     so the answer is the same whatever order the list happens to be in.

     A stretch running up to or past 23:00 is cut there, because an evening
     slot that quietly swallows the night is not what anybody meant by
     pressing the button once. A stretch that begins at or after 23:00 is
     left whole -- by then the night is all there is. */
  var WANTED = 60, USABLE = 15, EVENING = 23 * 60;

  function suggestSlot(slots) {
    var list = slots || [];
    if (!list.length) return { start: '07:00', end: '10:00' };

    var busy = occupancy(list), from = DAY;
    for (var i = 0; i < list.length; i++) {
      var k = shapeOf(list[i]);
      if (k && k.s < from) from = k.s;
    }
    if (from === DAY) from = 0;

    var runs = [], m = 0;
    while (m < DAY) {
      if (busy[(from + m) % DAY]) { m++; continue; }
      var len = 0;
      while (m + len < DAY && !busy[(from + m + len) % DAY]) len++;
      runs.push({ s: (from + m) % DAY, len: len });
      m += len;
    }
    if (!runs.length) return null;

    var pick = null;
    for (var r = 0; r < runs.length; r++) if (runs[r].len >= WANTED) { pick = runs[r]; break; }
    if (!pick) {
      for (var q = 0; q < runs.length; q++) {
        if (runs[q].len >= USABLE && (!pick || runs[q].len > pick.len)) pick = runs[q];
      }
    }
    if (!pick) return null;

    var end = (pick.s + pick.len) % DAY;
    if (pick.s < EVENING && (pick.s + pick.len) > EVENING) end = EVENING;
    return { start: hhmm(pick.s), end: hhmm(end) };
  }

  function validateSlots(slots, stationIds) {
    var errors = [];
    var ok = [];
    slots.forEach(function (slot, i) {
      var s = parseHHMM(slot.start), e = parseHHMM(slot.end);
      if (s === null || e === null) { errors.push({ index: i, message: 'Time must be HH:MM (00:00–23:59).' }); return; }
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
  var THEMES = ['dial', 'console', 'rams', 'editorial', 'retro', 'departures', 'marconi', 'tivoli'];

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

  return {
    playTarget: playTarget, bootTarget: bootTarget, slotSettings: slotSettings, backoffMs: backoffMs,
    dayGroup: dayGroup, parseHHMM: parseHHMM, minutesOfDay: minutesOfDay,
    activeSlot: activeSlot, nextChange: nextChange, dayIsOver: dayIsOver,
    settle: settle, occupancy: occupancy, suggestSlot: suggestSlot, shapeOf: shapeOf, hhmm: hhmm,
    validateSlots: validateSlots
  };
});
