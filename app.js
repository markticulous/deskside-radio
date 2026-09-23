/* Deskside Radio — state, audio engine, stream watchdog, metering, scheduler tick, UI. */
(function () {
  'use strict';

  var KEY = 'radio.v1';
  var THEMES = ['dial', 'console', 'rams', 'editorial', 'retro', 'departures', 'marconi', 'tivoli'];
  /* Bump on release, in all three places: here, version.json (which is
     what every running copy checks once a day), and the placeholder in
     index.html -- that one is overwritten at boot and so is never seen,
     but a number that is wrong in the markup is a number that will be
     believed by whoever reads it next. */
  var APP_VERSION = '1.5.8';
  /* Stamped into every export. SEED_APP is what makes "is this one of
     ours" a question with an answer; SEED_V is the shape of the file,
     bumped only if a future version has to read an old one differently
     from how it reads its own. */
  var SEED_APP = 'deskside-radio';
  var SEED_V = 1;

  var DEFAULTS = {
    /* The three a fresh install starts with, in this order, taken from a
       real set that had been lived with rather than assembled. All three
       answer with CORS, which is what the meter and the tone controls
       need -- a default station that arrives with a dead meter teaches the
       wrong thing about the app on the first run.

       The ids are written out rather than carried over from the directory:
       an export names them rb_77871905-48cd-465c-..., which is fine for a
       station somebody added and is not what belongs in the file that
       defines what this thing is. */
    stations: [
      { id: 'covers', name: '100% Covers Lounge', band: '100 FM', tag: 'MP3 · 128 kbps · Toronto',
        url: 'https://az1.mediacp.eu/listen/100coverslounge/radio.mp3', color: '#5b2a86', bass: 0, treble: 0 },
      /* CBC hands out an HLS playlist rather than a plain stream. Chrome,
         Edge and Safari play it off the element; Firefox does not -- measured
         in 155 and 156, canPlayType answers '' -- and gets it through hls.js,
         loaded only then. See the note in radio-directory.js about judging a
         stream by whether it holds up, not by its extension. */
      { id: 'cbc1', name: 'CBC Radio 1 · Toronto', band: '99.1 FM', tag: 'CBLA-FM',
        url: 'https://cbcradiolive.akamaized.net/hls/live/2041036/ES_R1ETR/master.m3u8', color: '#a8321c', bass: 0, treble: 0 },
      { id: 'cfrb', name: 'NewsTalk 1010', band: '1010 AM', tag: "Toronto's news, traffic and weather, all day.",
        url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/CFRBAM.mp3', color: '#10307a', bass: 0, treble: 0 }
    ],
    schedule: { weekday: [], weekend: [] },
    /* What each day group does once its last slot has ended and nothing
       follows: 'play' leaves whatever is on playing, 'off' stops. Kept
       beside the schedule rather than inside it, because the slots are a
       list and this is a property of the day. */
    /* A fresh install turns the radio off when the day's last slot ends,
       rather than carrying the last station on indefinitely. Somebody who
       has gone to the trouble of setting a schedule has said when they
       want it on; silence outside those hours is the other half of that
       sentence, and it is the easier default to notice and change.
       Only the default -- an existing install keeps whatever it was set
       to, since the value is stored. */
    scheduleEnds: { weekday: 'off', weekend: 'off' },
    /* Which reading of a slot whose start equals its end this schedule was
       written under: absent or 1 means "matches nothing", 2 means all day.
       normalise drops the old kind once and stamps this. */
    scheduleV: 2,
    schedulerEnabled: false,
    // Where the window was left. Filled in once there is one to remember.
    windowBox: null,
    theme: 'dial',
    intendedPlaying: false,
    currentStationId: 'cfrb',
    volume: 50,
    volumeCurve: 3,
    autoplay: false,
    /* Filled in from the list below once it exists -- see just under the
       closing brace. The drawer already falls back to the first station
       when it finds nothing chosen, but that only happens once somebody
       opens the drawer; this makes a fresh install say so from the start,
       whether or not anybody looks. Play on launch itself stays off. */
    autoplayStationId: null,
    lastCity: null,
    /* The settings file beside index.html is read at every launch and is
       the only thing the separate browser profiles can all see. These two
       say which version of it this profile has already taken, so it is
       taken once rather than read back over the drawer at every launch,
       and which version of the app wrote it. */
    seedStamp: null,
    seedFrom: null,
    /* The version that last ran in this profile. Absent means nobody has
       run one yet, which is a first install rather than an update -- and
       a first install has nothing to announce. */
    ranVersion: null,
    bass: 0,
    treble: 0,
    lastGood: null,
    /* Whether the radio has ever been successfully set to start with
       Windows. Not the state of the thing -- that is read off the machine
       and never remembered -- but whether the round trip has ever worked,
       which is also when the browser's permission was granted. Until then
       the control is a button rather than a switch. */
    /* Which of the mini radio's four visualisations is showing. A
       preference about how the app looks, so it is remembered; choosing
       it again at every pin would make it a toy rather than a choice.
       An unknown value falls back to the bars. */
    miniViz: 'bars',
    startupUsed: false,
    versionCheck: true,
    versionLastCheck: 0,
    versionLatest: null,
    /* Set by the x on the pill, cleared by the next completed check. The
       pill is a nag and this is the snooze; the mark on the gear is the
       fact, and nothing here touches that. */
    versionPillOff: false,
    /* Only ever consulted when the system asks for reduced motion. Off by
       default, because the preference is the listener's and following it
       is the right default -- this is the way back for the one animation
       that carries information rather than decorating. */
    scrollAnyway: false
  };

  /* Derived rather than typed, so renaming or reordering the three
     stations a fresh install ships with cannot leave this pointing at an
     id that is no longer there. */
  DEFAULTS.autoplayStationId = DEFAULTS.stations[0].id;

  function clampTone(v) {
    if (typeof v !== 'number' || !isFinite(v)) return 0;
    return Math.max(-12, Math.min(12, Math.round(v)));
  }

  /* Storage is not a private place. On file:// every local page the
     browser has ever opened shares one origin, and therefore shares this
     key; an export file is a file like any other. So what comes back is
     checked rather than trusted -- not against tampering, which anyone
     with the disk has better ways to do, but against a shape the code
     below cannot survive. A schedule stored as a number rather than a
     list used to throw inside the Settings drawer, and Reset is inside
     the Settings drawer, so the app could be put into a state it could
     not be talked out of. */
  var CAP = { name: 200, band: 32, tag: 400, url: 2048 };
  function capped(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }

  function cleanStation(st, i) {
    if (!st || typeof st !== 'object') return null;
    st.name = capped(st.name, CAP.name);
    st.band = capped(st.band, CAP.band);
    st.tag = capped(st.tag, CAP.tag);
    st.url = capped(st.url, CAP.url);
    /* A hex triplet, not the free-form CSS it would otherwise be. The
       colour is read back through a background: shorthand, where a
       url(...) is a fetch to wherever the settings file chose. */
    if (!/^#[0-9a-f]{6}$/i.test(st.color)) st.color = Directory.pickColour(i);
    return st;
  }

  /* An identity of its own, so nothing has to refer to a slot by where it
     sits in the array. The list is sorted by start time now, which moves
     slots about under the drawer's feet -- the open card, the delete
     button and the undo snapshot all used to be positions, and a position
     stops meaning anything the moment the order changes. Written back into
     stored settings on the first save, and harmless in an export. */
  var slotSeq = 0;
  function slotId() { return 'sl_' + Date.now().toString(36) + (slotSeq++).toString(36); }

  function cleanSlots(list) {
    return (Array.isArray(list) ? list : [])
      .filter(function (sl) { return sl && typeof sl === 'object'; })
      .map(function (sl) { if (!sl.id) sl.id = slotId(); return sl; });
  }

  /* Above the line below, and it matters. var hoists the name and not the
     value, so CAP declared after this point is undefined while load() is
     running -- cleanStation then throws, normalise catches it and hands
     back the defaults, and the settings the user actually had are quietly
     dropped and written over on the way out. Caught in a headless run
     where a seeded theme kept coming back as the default one. */

  // ---------- state ----------
  var state = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULTS);
      return normalise(JSON.parse(raw));
    } catch (e) { return clone(DEFAULTS); }
  }

  /* Everything a stored settings object needs before the app can trust it:
     defaults filled in, old shapes migrated. A settings file seeded from
     disk goes through here too, so it gets the same treatment. */
  function normalise(s) {
    try {
      var merged = Object.assign(clone(DEFAULTS), s);
      merged.schedule = Object.assign({ weekday: [], weekend: [] }, s.schedule || {});
      merged.schedule.weekday = cleanSlots(merged.schedule.weekday);
      merged.schedule.weekend = cleanSlots(merged.schedule.weekend);

      /* Equal start and end used to mean a slot that matched nothing at
         all; it now means all day. Anything saved before that flip has to
         be read the old way once, or it wakes up owning the whole day --
         and the Add button's old defaults produced exactly 23:00 to 23:00
         on the third press, so this is not hypothetical. They did nothing
         before, so dropping them changes nothing anyone could have heard.
         The marker is absent on every install that predates this, and set
         once here, so a slot made deliberately after the upgrade is never
         mistaken for one of these. */
      /* Asked of the stored object, not the merged one. DEFAULTS carries
         scheduleV: 2, so Object.assign fills it in before this runs and
         merged.scheduleV is always 2 -- which silently skipped the
         migration for every install that needed it. Caught by seeding a
         lone 23:00-23:00 slot and watching it survive. */
      if (!s || s.scheduleV !== 2) {
        ['weekday', 'weekend'].forEach(function (g) {
          merged.schedule[g] = merged.schedule[g].filter(function (sl) {
            var a = Scheduler.parseHHMM(sl.start), b = Scheduler.parseHHMM(sl.end);
            return !(a !== null && a === b);
          });
        });
        merged.scheduleV = 2;
      }
      /* Absent is not the same answer as "play". Reading it that way is
         what made the default above a dead letter: every profile that had
         never touched the setting was handed "keep playing" on the way in,
         whatever DEFAULTS said, so the deliberate choice of silence
         outside the hours somebody set never once took effect. Only the
         two values it can hold are taken from the file; anything else,
         missing included, falls back to the default. */
      var ends = (s && s.scheduleEnds && typeof s.scheduleEnds === 'object') ? s.scheduleEnds : {};
      function endsFor(g) {
        if (ends[g] === 'off' || ends[g] === 'play') return ends[g];
        return DEFAULTS.scheduleEnds[g];
      }
      merged.scheduleEnds = { weekday: endsFor('weekday'), weekend: endsFor('weekend') };
      if (!Array.isArray(merged.stations)) merged.stations = clone(DEFAULTS.stations);
      merged.stations = merged.stations.map(cleanStation).filter(Boolean);
      if (!merged.stations.length) merged.stations = clone(DEFAULTS.stations);
      if (THEMES.indexOf(merged.theme) === -1) merged.theme = DEFAULTS.theme;

      /* The gate, on the way in. Storage is shared with every other local
         page the browser has opened, a seed file is a file like any other,
         and neither has been near the drawer -- so an overlapping, unsorted
         or dangling schedule can arrive from either. It is settled before
         anything reads it, silently: there is nobody to tell at this point
         and nothing they could do about it. After the stations, because
         settle has to know which ids are real. */
      ['weekday', 'weekend'].forEach(function (g) {
        merged.schedule[g] = Scheduler.settle(merged.schedule[g], merged.stations, null).slots;
      });
      /* Bass and treble used to be one pair of numbers for the whole app.
         They now belong to the station, so seed every station that has none
         from the old global pair and the listener hears no change. */
      // An empty schedule cannot run, so do not claim it is on.
      if (!merged.schedule.weekday.length && !merged.schedule.weekend.length) {
        merged.schedulerEnabled = false;
      }

      merged.stations.forEach(function (st) {
        if (typeof st.bass !== 'number') st.bass = clampTone(merged.bass);
        if (typeof st.treble !== 'number') st.treble = clampTone(merged.treble);
      });

      /* Settings saved on an older fader, carried to the same loudness on this
         one. Curve 1 was a power law, curve 2 was 60 dB wide, curve 3 is 40.
         Each is converted straight to the current fader, never through the one
         in between, so rounding happens once. Everywhere a volume is kept: the
         fader, the last station that played, and every schedule slot. */
      if (merged.volumeCurve !== 3) {
        var carry = merged.volumeCurve === 2 ? Signal.migrateVolume60 : Signal.migrateVolume;
        merged.volume = carry(merged.volume);
        if (merged.lastGood) merged.lastGood.volume = carry(merged.lastGood.volume);
        ['weekday', 'weekend'].forEach(function (group) {
          (merged.schedule[group] || []).forEach(function (slot) { slot.volume = carry(slot.volume); });
        });
        merged.volumeCurve = 3;
      }
      return merged;
    } catch (e) { return clone(DEFAULTS); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function station(id) { for (var i = 0; i < state.stations.length; i++) if (state.stations[i].id === id) return state.stations[i]; return null; }
  function currentStation() { return station(state.currentStationId) || state.stations[0] || null; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // ---------- dom ----------
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    tuner: $('tuner'), clock: $('clock'),
    schedToggle: $('schedToggle'), schedLabel: $('schedLabel'), schedNext: $('schedNext'),
    band: $('band'), name: $('name'), tag: $('tag'), led: $('led'), status: $('status'),
    presets: $('presets'), play: $('play'), volume: $('volume'), volumeOut: $('volumeOut'),
    bass: $('bass'), bassOut: $('bassOut'), treble: $('treble'), trebleOut: $('trebleOut'),
    overlay: $('startOverlay'), startSub: $('startSub'), settings: $('settings'),
    rec: $('rec'), recWord: document.querySelector('.rec-word'),
    readmeLink: $('readmeLink'), readmeMissing: $('readmeMissing'),
    blind: document.querySelector('.meter-blind')
  };

  /* ------------------------------------------------------------------
     Audio engine.

     Metering taps the stream through Web Audio, which requires the
     element to be CORS-clean. Streams that refuse CORS play on a second,
     untapped element instead: audio still works, the meter goes dark.
     ------------------------------------------------------------------ */
  var corsEl = new Audio();
  corsEl.preload = 'none';
  corsEl.crossOrigin = 'anonymous';
  var plainEl = null;
  var audio = corsEl;

  var noCors = {};       // url -> true. Learned this session, never persisted.
  var provenCors = {};   // url -> true, once it has actually played through the tap.

  var ctx = null, analyser = null, gainNode = null, bassNode = null, trebleNode = null;
  /* A second analyser, on the far end of the graph, for the mini radio's
     scope. The one above is first in the chain on purpose so the meter
     reads the broadcast; this one is last, so the trace answers the volume
     and the tone controls the way a scope on the speaker leads would.
     Small window -- the trace is 46 pixels wide and takes 24 points. */
  var scopeAn = null, scopeData = null;
  var recTap = null;
  var timeData = null, freqData = null;

  var status = 'idle';   // idle | connecting | live | reconnecting | stopped
  var attempts = 0;
  var retryTimer = null;
  var liveSince = 0;
  var lastTime = -1, stuckSince = 0;
  /* A stream that is connected, advancing, and carrying nothing.
     It happened on a station here: the transport said Live for several
     minutes, the needle sat on its stop, and there was no sound. Nothing
     in the watchdog could see it -- currentTime was moving, readyState was
     high, no error fired. The only thing that knew was the meter.

     -60 dBFS rather than exact zero, because a silent encoder is rarely
     digitally silent: it carries a dither floor or a trace of hum, which
     is inaudible and is not zero. Anything above this and a listener
     would hear something.

     Five seconds because speech and music both have gaps, and the longest
     of them -- a beat between tracks, a pause for effect -- is nothing
     like this long. */
  var SILENT_RMS = 0.001;
  var SILENCE_MS = 5000;
  var silentSince = 0, streamSilent = false;

  /* Having spotted it, try to fix it. Re-tuning opens a new connection,
     which on most stations means a different edge node, and a node feeding
     silence is the common cause -- so it is worth one go.

     What it must not become is a machine that hammers a station which is
     simply off the air overnight. Each attempt costs a real interruption,
     and after four of them the honest conclusion is that the silence is
     the broadcast rather than the connection, so it stops and leaves the
     lamp saying so.

     Written as waits from the notice appearing, which is itself five
     seconds into the silence -- so each one is five short of the figure it
     is there to produce. Every attempt therefore lands after that much
     unbroken silence, counted from when this bout of it started:

       10s   30s   90s   120s

     The ladder does not reset when a retune reconnects; it resets when
     sound actually arrives, or nothing would ever climb past the first
     rung. */
  var SILENT_RETRY = [5000, 25000, 85000, 115000];
  var silentTries = 0, silentRetryTimer = null;

  function stopSilentRetry() {
    clearTimeout(silentRetryTimer);
    silentRetryTimer = null;
  }

  function armSilentRetry() {
    stopSilentRetry();
    if (silentTries >= SILENT_RETRY.length) return;
    var wait = SILENT_RETRY[silentTries];
    silentRetryTimer = setTimeout(function () {
      silentRetryTimer = null;
      /* Everything has to still be true at the moment it fires: the
         listener has not stopped, the silence has not lifted, and nothing
         else is already mid-reconnect. */
      if (!streamSilent || !state.intendedPlaying || awaitingTap || retryTimer) return;
      var st = currentStation();
      if (!st) return;
      silentTries++;
      tune(st);
    }, wait);
  }

  /* Only ever true where there is a meter to read. A stream that refuses
     CORS plays through the untapped element with no analyser on it, so
     there is no level to look at and silence cannot be told from sound --
     that is the same limit the meter itself has, and it is why this says
     nothing rather than guessing. */
  function paintSilence() {
    el.tuner.classList.toggle('is-silent', streamSilent);
    if (!streamSilent) { stopSilentRetry(); return; }
    el.status.textContent = silentTries
      ? 'Stream detected · no audio · tried ' + silentTries
      : 'Stream detected · no audio';
    armSilentRetry();
  }

  var graphInterrupted = false;
  var userStopping = false;
  var startedThisTune = false;
  var syncedThisTune = false;
  var userGestured = false;
  var probeCtx = null;
  var everSustained = {};

  /* Only ever with a real gesture, and only before playback begins.
     Wrapping a MediaElementAudioSourceNode around an element that is
     already playing, or resuming a context that has been buffering while
     suspended, makes the stream stutter and rewind several seconds.
     The one other way in is probeAutoplay() below, which reaches
     buildGraph() only once a context has been seen running. */
  function ensureGraph() {
    // A gesture landing mid-probe adopts the probe's context rather than
    // opening a second one; its resume() promise then completes the probe.
    if (probeCtx) { probeCtx.resume(); return; }
    if (!userGestured) return;
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { buildGraph(new AC()); }
    catch (e) { ctx = null; analyser = null; gainNode = null; bassNode = null; trebleNode = null;
      scopeAn = null; scopeData = null; }
  }

  /* Wraps the element. This is the point of no return: a
     MediaElementAudioSourceNode reroutes the element's output for good, so
     a context that gets this far must be one that is going to run. */
  function buildGraph(c) {
    var src = c.createMediaElementSource(corsEl);
    var an = c.createAnalyser();
    an.fftSize = 2048;
    var g = c.createGain();
    // Tone sits after the analyser, so the meter keeps reading the broadcast
    // rather than whatever shelf the listener has dialled in.
    var lowShelf = c.createBiquadFilter();
    lowShelf.type = 'lowshelf'; lowShelf.frequency.value = 200;
    var highShelf = c.createBiquadFilter();
    highShelf.type = 'highshelf'; highShelf.frequency.value = 3200;
    // No limiter: the fader cannot exceed unity, so there is nothing to
    // catch. A compressor here only squashed the top of the travel, and
    // Chromium's adds makeup gain even far below its threshold.
    src.connect(an); an.connect(lowShelf); lowShelf.connect(highShelf);
    highShelf.connect(g); g.connect(c.destination);
    /* And the scope's own tap, off the same gain node. A node may feed
       more than one destination, and an analyser runs without being
       connected onward -- it is a sink that happens to keep the last
       window of samples. Nothing downstream hears it. */
    try {
      scopeAn = c.createAnalyser();
      scopeAn.fftSize = 1024;
      /* And on into a gain of nothing, which is the whole reason this line
         exists. The graph is pulled from the destination backwards, so a node
         whose output reaches nothing may never be rendered -- and an analyser
         that is never rendered hands back a buffer of zeros, which draws a
         perfectly flat trace and looks exactly like silence. It was a dead end
         and it read as one. */
      var sink = c.createGain();
      sink.gain.value = 0;
      g.connect(scopeAn); scopeAn.connect(sink); sink.connect(c.destination);
      scopeData = new Float32Array(scopeAn.fftSize);
    } catch (e) { scopeAn = null; scopeData = null; }
    /* The recorder taps in beside the tone controls rather than after
       them, so a recording is a copy of what was broadcast: turning the
       volume down, or dialling in bass for the room, changes what comes
       out of the speakers and not what lands in the file.

       Built here but not connected here. A MediaStreamAudioDestination is
       rendered for as long as it is attached, whether or not anything is
       reading it, so leaving it wired up meant the graph resampling into a
       stream nobody listened to for the entire life of the app. It is
       connected when recording starts and disconnected when it stops; the
       button's own test is that the node exists, which it always does. */
    try {
      recTap = c.createMediaStreamDestination();
    } catch (e) { recTap = null; }
    /* An interruption of the Web Audio render thread does not drop samples,
       it delays them, so a live stream comes back several seconds behind and
       the listener hears what they just heard. Nothing can seek a live HLS
       stream forward to the edge, so re-tune once the thread is back. */
    c.addEventListener('statechange', function () {
      if (c.state !== 'running') { graphInterrupted = true; return; }
      if (!graphInterrupted) return;
      graphInterrupted = false;
      if (!state.intendedPlaying) return;
      var back = currentStation();
      if (!back) return;
      setStatus('connecting', 'Re-syncing to live');
      attempts = 0;
      tune(back, state.volume);
    });
    ctx = c; analyser = an; gainNode = g; bassNode = lowShelf; trebleNode = highShelf;
    refreshRec();
    timeData = new Float32Array(an.fftSize);
    freqData = new Uint8Array(an.frequencyBinCount);
    corsEl.volume = 1;
    gainNode.gain.value = Signal.volumeToGain(state.volume);
    applyTone();
    if (ctx.state === 'suspended') ctx.resume();
  }
  /* Play on launch, with no click anywhere. The launcher shortcut starts the
     browser with --autoplay-policy=no-user-gesture-required, and under that
     flag a context reaches 'running' on its own; without it resume() simply
     never settles, so the wait is bounded and the context is thrown away.
     This runs before the first tune(), so the element is not yet playing and
     buildGraph() cannot catch it mid-stream. */
  function probeAutoplay(done) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || ctx || userGestured) return done();
    try { probeCtx = new AC(); } catch (e) { probeCtx = null; return done(); }

    var c = probeCtx, settled = false, timer = null;
    function finish(ok) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      c.removeEventListener('statechange', onState);
      probeCtx = null;
      if (ok) {
        userGestured = true;
        try { buildGraph(c); }
        catch (e) { ctx = null; analyser = null; gainNode = null; bassNode = null; trebleNode = null;
          scopeAn = null; scopeData = null; }
      } else {
        try { c.close(); } catch (e) { /* already gone */ }
      }
      done();
    }
    function onState() {
      if (c.state === 'running') finish(true);
      else if (c.state === 'closed') finish(false);
    }

    c.addEventListener('statechange', onState);
    if (c.state === 'running') return finish(true);
    timer = setTimeout(function () { finish(false); }, 400);
    var p = c.resume();
    if (p && p.then) p.then(function () { if (c.state === 'running') finish(true); }, function () { finish(false); });
  }

  function markGesture() {
    userGestured = true;
    ensureGraph();
    // Play on launch may already be running without a meter. Re-read it.
    if (analyser) setStatus(status, el.status.textContent);
  }
  document.addEventListener('pointerdown', markGesture, { once: true });
  document.addEventListener('keydown', markGesture, { once: true });

  function wire(node) {
    node.addEventListener('loadedmetadata', onStarted);
    node.addEventListener('playing', onPlaying);
    /* Only this one reports that the resource itself would not load, which
       is what a refused analysed path raises. Every other route into
       onFailure is a stall, a re-tune, or a plain outage. */
    node.addEventListener('error', function () { onFailure(true); });
    node.addEventListener('ended', function () { onFailure(); });
    node.addEventListener('waiting', onBuffering);
    node.addEventListener('timeupdate', onProgressing);
    node.addEventListener('pause', function () { if (state.intendedPlaying && !userStopping && !node.ended) onFailure(); });
  }
  /* Only `waiting` means the element genuinely cannot continue. `stalled`
     merely says no data has arrived for a while, which a segmented HLS
     stream does at every segment boundary, roughly every ten seconds, with
     the audio running perfectly. Treating that as buffering latched the app
     out of the live state for good, because no `playing` event follows to
     put it back, and the meters follow the live state. */
  function onBuffering() { if (status === 'live') setStatus('connecting', 'Buffering'); }

  // Whatever the events claim, a clock that is advancing means it is playing.
  function onProgressing() {
    if (!state.intendedPlaying || userStopping || retryTimer) return;
    if (status === 'live' || audio.paused) return;
    onPlaying();
  }
  function onStarted() { startedThisTune = true; }
  function onPlaying() {
    attempts = 0;
    /* Once per tune, and a beat after the audio starts so the buffer has
       something to aim at. Without the guard every rebuffer would seek. */
    if (!syncedThisTune) {
      syncedThisTune = true;
      /* As early as it will take, rather than after a fixed wait. seekable
         and buffered are not both ready the instant playing fires -- tried
         at zero and the seek simply did not happen -- but a fixed delay long
         enough to be safe means the replayed second is heard before it is
         skipped. So it retries until one lands, and gives up rather than
         chase a stream that will not seek at all, which is every HLS one. */
      var tries = 0;
      // On a later task, not inline: this runs before setStatus('live')
      // below, so an inline first attempt reads the old status and stops.
      setTimeout(function attempt() {
        if (status !== 'live' || tries > 8) return;
        tries += 1;
        if (!seekToLive()) setTimeout(attempt, 60);
      }, 0);
    }
    launching = false;
    liveSince = Date.now();
    var st = currentStation();
    if (st && audio === corsEl) provenCors[st.url] = true;
    /* Just the transport state. The frequency used to be appended here --
       "Live \u00b7 92.5 FM" -- and it was already sitting two lines above in the
       band readout, where it belongs and where every theme draws it. This
       line answers one question, which is what the stream is doing. */
    setStatus('live', 'Live');
    updateMediaSession();
  }
  wire(corsEl);

  /* ---------- live edge ----------
     A stream hands over a second or so of already-broadcast audio the moment
     you connect, so the player has something to start on. On music nobody
     notices; on speech it is a word repeating, which is what stopping and
     starting quickly makes obvious.

     The cure is to move the playhead to the newest audio the element is
     holding, keeping a margin in hand so the buffer does not run dry. This
     costs no network: the audio is already here, it is only being played
     from the wrong end.

     HLS reports an empty seekable range and ignores the assignment outright,
     which is why the control hides itself rather than sitting there inert. */
  var LIVE_MARGIN = 1.5;   // seconds kept in hand against jitter
  /* There is deliberately no running drift correction here, and the reason
     is worth writing down so it is not attempted again.

     Measured: the browser holds about 2.3 seconds of audio ahead of the
     playhead and throttles the download to keep it there. Playing at half
     speed for nine seconds did not widen that gap by a hundredth of a
     second -- the download simply slowed to match. So buffered.end minus
     currentTime measures buffer depth, never staleness, and cannot see
     drift at all.

     It also means a seek can never recover more than the buffer holds. If
     the clock really has fallen ten seconds behind, the newer audio is not
     in memory to seek to. The only cure is a fresh connection, which is
     what the AudioContext statechange handler above already does when the
     graph is interrupted -- the one mechanism known to cause it. */

  function canSeekLive() {
    return !!(audio.seekable && audio.seekable.length && audio.buffered && audio.buffered.length);
  }

  function seekToLive() {
    if (!canSeekLive()) return false;
    var edge = audio.buffered.end(audio.buffered.length - 1) - LIVE_MARGIN;
    if (edge <= audio.currentTime + 0.25) return false;
    try { audio.currentTime = edge; } catch (e) { return false; }
    return true;
  }

  function elementFor(st) {
    if (!noCors[st.url]) return corsEl;
    if (!plainEl) { plainEl = new Audio(); plainEl.preload = 'none'; wire(plainEl); }
    return plainEl;
  }
  function useElement(next) {
    if (audio === next) return;
    releaseHls();
    try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (e) { /* already idle */ }
    audio = next;
  }

  /* What the transport last said, so the silence notice can hand the line
     back rather than inventing one. */
  var statusText = '';
  function sayStatus() { if (el.status) el.status.textContent = statusText; }

  function setStatus(s, text) {
    var was = status;
    status = s;
    statusText = text;
    /* Any real change of transport state ends the silence: it is a fact
       about one connection, and this is a different one. Cleared before
       the text is written, or paintSilence would put its own line back
       over the top of whatever this call came to say. */
    if (streamSilent || silentSince) {
      streamSilent = false;
      silentSince = 0;
      stopSilentRetry();
      if (el.tuner) el.tuner.classList.remove('is-silent');
    }
    // Connecting, live, reconnecting: all of them have a needle to move.
    if (s !== 'stopped' && s !== 'idle' && s !== 'gone') startMeter();
    /* Coming out of a handover: the level was taken to nothing before the
       change, so the station that replaced it is brought up rather than
       dropped in at full. Waiting for 'live' rather than ramping from the
       moment it was tuned means the rise is heard on the audio and not
       spent on a connection. */
    if (s === 'live' && was !== 'live' && fadeMul < 1) fadeGain(1, RETURN_FADE_MS);
    refreshRec();
    el.status.textContent = text;
    el.led.classList.toggle('live', s === 'live');
    el.tuner.classList.toggle('is-gone', s === 'gone');
    el.tuner.classList.toggle('is-playing', s === 'live');
    el.tuner.classList.toggle('is-reconnecting', s === 'reconnecting');
    el.tuner.classList.toggle('is-connecting', s === 'connecting');
    /* Two ways to end up without a meter: a stream that blocks the
       analysed path, or play on launch starting before any click, which
       is what the Web Audio graph waits for. Say which. */
    var noGraph = !analyser && audio === corsEl;
    el.tuner.classList.toggle('is-blind', (audio === plainEl || noGraph) && state.intendedPlaying);
    if (el.blind) {
      el.blind.textContent = noGraph
        ? 'meter off \u00b7 click anywhere to switch it on'
        : 'meter off \u00b7 stream failed the analysed path';
    }
    var toneOff = audio === plainEl;
    el.bass.disabled = el.treble.disabled = toneOff;
    tipOn(el.bass, toneOff ? 'This stream would not load on the analysed path, so tone control is unavailable.' : '');
    tipOn(el.treble, toneOff ? 'This stream would not load on the analysed path, so tone control is unavailable.' : '');
    el.play.setAttribute('aria-pressed', state.intendedPlaying ? 'true' : 'false');
    paintStrip();
  }

  /* A playlist file is read once, the stream address inside it replaces the
     station's own, and the change is saved, so this happens on the first play
     after somebody pastes a .pls and never again. Reading it needs the host to
     allow the request; when it does not, the station is tuned unchanged and
     fails as it did before, which is no worse than not trying. */
  var playlistTried = {};

  /* A playlist is a short text file, and nothing obliges the server to
     agree: an endless body would have text() buffering until the tab
     died, and the address is the station's rather than ours. Ten seconds
     and a megabyte are both far past any real one. */
  var PLAYLIST_MAX = 1048576;
  function fetchText(url) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var opts = { cache: 'no-store' };
    if (ctl) opts.signal = ctl.signal;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 10000);
    function done(v) { clearTimeout(timer); return v; }
    return fetch(url, opts)
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (text) { return done(text.length > PLAYLIST_MAX ? '' : text); },
            function (e) { done(); throw e; });
  }

  function resolvePlaylistThenTune(st, volume) {
    var original = st.url;
    playlistTried[original] = true;
    setStatus('connecting', 'Reading playlist');
    fetchText(original)
      .then(function (text) {
        var real = Directory.parsePlaylist(text);
        if (real) { st.url = real; save(); }
        tune(st, volume);
      })
      .catch(function () { tune(st, volume); });
  }

  /* An HLS master is read once and one rendition out of it is what the
     element is handed. Chrome plays HLS itself, and given the master it
     starts on the lowest bitrate and steps up a few seconds in; CBC's
     master lists every bitrate on two CDN paths that are packaged
     separately, so the step-up lands on a live window about six seconds
     behind the one it started on and those seconds play again. Measured
     on the stream, not inferred from the spec.

     The choice is kept in memory only. The master is the address the
     station publishes and is what stays saved, and a rendition that has
     stopped working should not outlive the session that picked it. If the
     master cannot be read the master is tuned, which is what happened
     before, so nothing is worse off for trying. */
  /* ---------- HLS where the element cannot play it ----------

     Firefox has no native HLS -- measured: canPlayType answers '' for it,
     where Chrome and Edge answer 'maybe' -- but it does have MediaSource
     with AAC. hls.js bridges the two, into the same element, so everything
     downstream sees an ordinary element playing: the graph, the meters, the
     silence and stall watchdogs, the retries.

     Only where it is needed. A browser with native HLS keeps the path it
     always had and never loads the file, which is fetched from assets/ the
     first time a station needs it rather than folded into the page. */
  var hlsLib = null;          // the player on the current element, if any
  var hlsLibState = 'unloaded'; // unloaded | loading | ready | missing

  function needsHlsLib(url) {
    if (Directory.streamKind(url) !== 'hls' && !/\.m3u8(\?|$)/i.test(url)) return false;
    var probe = audio || corsEl;
    return !(probe && probe.canPlayType && probe.canPlayType('application/vnd.apple.mpegurl'));
  }

  /* Detached before every new load and on stop. A player left attached
     keeps fetching segments into an element that has moved on. */
  function releaseHls() {
    if (!hlsLib) return;
    try { hlsLib.destroy(); } catch (e) { /* already gone */ }
    hlsLib = null;
  }

  /* Fetched once, from beside the page. A script tag is the only way a
     file:// page can load one, the same door version.js comes through. If
     the file is missing -- a folder from before it shipped -- the element
     is tried on its own and fails the ordinary way, with the retries. */
  function loadHlsLib(then) {
    if (hlsLibState === 'ready' || hlsLibState === 'missing') { then(); return; }
    var queue = loadHlsLib.queue || (loadHlsLib.queue = []);
    queue.push(then);
    if (hlsLibState === 'loading') return;
    hlsLibState = 'loading';
    var s = document.createElement('script');
    s.src = 'assets/hls.light.min.js';
    function done(ok) {
      hlsLibState = ok && window.Hls && window.Hls.isSupported() ? 'ready' : 'missing';
      var q = queue.splice(0);
      q.forEach(function (fn) { fn(); });
    }
    s.onload = function () { done(true); };
    s.onerror = function () { done(false); };
    document.head.appendChild(s);
  }

  /* The element's source, through hls.js. A fatal error is handed to the
     same onFailure the element's own error event reaches, so reconnecting
     works exactly as it does for every other stream; the non-fatal ones
     hls.js recovers from by itself and are left to it. */
  function attachHls(url) {
    releaseHls();
    var h = new window.Hls({ lowLatencyMode: false, enableWorker: true });
    h.on(window.Hls.Events.ERROR, function (ev, data) {
      if (!data || !data.fatal || hlsLib !== h) return;
      releaseHls();
      onFailure();
    });
    hlsLib = h;
    h.loadSource(url);
    h.attachMedia(audio);
  }

  var hlsVariant = {};
  var hlsTried = {};
  var hlsLadder = {};
  var hlsStep = {};

  /* Is this URL permanently not there?

     A stream that has been retired answers with a status, and the audio
     element never tells us what it was -- it reports "it did not play",
     which is what it also reports for a slow connection and for a CDN
     having a bad minute. Those deserve the retry ladder. A 410 does not.

     Only these four count. Anything else, including a network error with
     no status at all, is treated as temporary, because being offline must
     never be mistaken for a station having closed down. */
  var GONE_STATUS = { 400: 1, 403: 1, 404: 1, 410: 1 };

  function probe(url) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var opts = { cache: 'no-store', method: 'GET' };
    if (ctl) opts.signal = ctl.signal;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 6000);
    return fetch(url, opts).then(function (r) {
      clearTimeout(timer);
      /* The headers are the whole answer; the body of a live playlist is
         small but there is no reason to read it. */
      if (ctl) { try { ctl.abort(); } catch (e) { /* already done */ } }
      return { ok: r.ok, gone: !!GONE_STATUS[r.status], status: r.status };
    }, function () {
      clearTimeout(timer);
      return { ok: false, gone: false, status: 0 };
    });
  }

  /* The station is reachable and has nothing behind it. Said once, and the
     retrying stops -- a ladder that keeps climbing a stream that has been
     taken down is just noise, and it hides the one fact worth knowing. */
  function markGone(st) {
    clearTimeout(retryTimer); retryTimer = null;
    attempts = 0;
    try { audio.pause(); } catch (e) { /* nothing playing */ }
    /* Nothing is playing and nothing is going to, so the transport says so
       too. Left intending to play, the play button reads as "stop" and the
       first press after this turns off a radio that was already off --
       which is a second thing gone wrong from one thing being gone. */
    state.intendedPlaying = false;
    save();
    setStatus('gone', 'Stream is gone · check the station');
  }

  function resolveHlsThenTune(st, volume) {
    var master = st.url;
    hlsTried[master] = true;
    fetchText(master)
      .then(function (text) {
        var ladder = Directory.listHlsVariants(text, master);
        if (!ladder.length) { tune(st, volume); return; }
        /* The master parsing is not proof of anything. BBC World Service
           serves a perfectly good master, with CORS, listing one variant
           that has answered 410 since the stream was retired -- so the app
           dutifully handed a dead playlist to the element and reconnected
           for ever. Each rung is asked whether it is there before any of
           them is played. */
        /* A rung is a URL string -- listHlsVariants sorts by bandwidth and
           maps the objects away before returning. Reading .url off one got
           undefined, which fetch then resolved against the page's own
           folder: every probe quietly checked a file that was not there,
           came back "not permanently gone", and the dead rung was played
           exactly as before. */
        return Promise.all(ladder.map(function (url) {
          return probe(url).then(function (r) { return { url: url, r: r }; });
        })).then(function (checked) {
          var alive = checked.filter(function (c) { return !c.r.gone; }).map(function (c) { return c.url; });
          if (!alive.length) { markGone(st); return; }
          hlsLadder[master] = alive;
          hlsStep[master] = 0;
          hlsVariant[master] = alive[0];
          tune(st, volume);
        });
      })
      .catch(function () { tune(st, volume); });
  }

  function tune(st, volume) {
    if (!st) return;
    if (Directory.streamKind(st.url) === 'playlist' && !playlistTried[st.url]) {
      state.currentStationId = st.id;
      renderStation(st);
      resolvePlaylistThenTune(st, volume);
      return;
    }
    if (Directory.streamKind(st.url) === 'hls' && !hlsVariant[st.url] && !hlsTried[st.url]) {
      state.currentStationId = st.id;
      renderStation(st);
      resolveHlsThenTune(st, volume);
      return;
    }
    var src = hlsVariant[st.url] || st.url;
    /* Firefox and its like: fetch hls.js first, then come back here. */
    if (needsHlsLib(src) && hlsLibState !== 'ready' && hlsLibState !== 'missing') {
      state.currentStationId = st.id;
      renderStation(st);
      loadHlsLib(function () { if (state.currentStationId === st.id) tune(st, volume); });
      return;
    }
    clearTimeout(retryTimer); retryTimer = null;
    state.currentStationId = st.id;
    releaseHls();
    useElement(elementFor(st));
    loadTone(st);
    setVolume(typeof volume === 'number' ? volume : state.volume, true);
    renderStation(st);
    if (hlsLibState === 'ready' && needsHlsLib(src)) {
      attachHls(src);
    } else {
      audio.src = src;
      audio.load();
    }
    liveSince = 0; lastTime = -1; stuckSince = 0; startedThisTune = false;
    syncedThisTune = false;
    // Let the meters fall away rather than freeze on the old station's level.
    meterRelease = true;
    setStatus(attempts ? 'reconnecting' : 'connecting', attempts ? 'Reconnecting \u00b7 try ' + attempts : 'Connecting');
    var p = audio.play();
    if (p && p.catch) p.catch(function (err) {
      var name = err && err.name;
      /* The load() above rejects the previous tune's pending play() with
         AbortError. That is this function's own doing, not a fault in the
         stream, and counting it as one used to brand the incoming station
         unanalysable before it had played a note. */
      if (name === 'AbortError') return;
      if (name === 'NotAllowedError') showOverlay();
      else onFailure();
    });
    save();
  }

  function startPlayback() {
    /* A deliberate press clears everything learned about the stream being
       gone: stations come back, and the listener asking again is the only
       signal worth acting on -- nothing here is going to poll a dead URL
       hoping it returns. */
    var was = currentStation();
    if (was) {
      delete hlsVariant[was.url]; delete hlsTried[was.url];
      delete hlsLadder[was.url]; delete hlsStep[was.url];
    }
    state.intendedPlaying = true;
    // Pressing play makes it the listener's again, not the schedule's.
    scheduleStopped = false;
    startMeter();
    // Whatever a handover left behind, a deliberate press starts at full.
    stopFade();
    fadeMul = 1; applyGain();
    attempts = 0;
    ensureGraph();
    var target = resolveTarget();
    tune(target.station, target.volume);
  }

  function stopPlayback() {
    state.intendedPlaying = false;
    /* Cleared here and set again by the caller when it was the schedule
       that stopped it, so a stop the listener asked for is never undone
       by the next slot coming round. */
    scheduleStopped = false;
    awaitingTap = false;
    launching = false;
    userStopping = true;
    clearTimeout(retryTimer); retryTimer = null;
    stopSilentRetry();
    silentTries = 0;
    releaseHls();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    attempts = 0;
    setStatus('stopped', 'Stopped');
    /* The graph keeps pulling quanta through seven nodes and holds the
       output device open for as long as the context is running, which on
       a stopped radio is work with no sound at the end of it. The element
       has no src by this point, so none of the rewind caveats around
       suspending mid-stream apply, and ensureGraph resumes it on the way
       back in. The heartbeat's own resume is guarded by intendedPlaying,
       which is already false here, so it will not undo this. */
    if (ctx && ctx.state === 'running' && ctx.suspend) {
      try { ctx.suspend(); } catch (e) { /* not fatal, only wasteful */ }
    }
    save();
    setTimeout(function () { userStopping = false; }, 0);
  }

  // Pressing Play resumes the display; recovery may fall back to lastGood.
  function resolveTarget(forRecovery) {
    var pick = Scheduler.playTarget(state, new Date(), !!forRecovery);
    if (!pick) return { station: null, volume: state.volume };
    return { station: station(pick.stationId), volume: pick.volume };
  }

  function onFailure(loadFailed) {
    if (!state.intendedPlaying || userStopping || retryTimer || awaitingTap) return;
    // Already established that there is nothing there. Pressing play again
    // is what asks for another look; see startPlayback.
    if (status === 'gone') return;
    var st = currentStation();
    /* A stream whose resource would not load at all may be refusing the
       CORS request the analyser needs, so retry it once on the untapped
       element. One that had started is a plain outage: keep it on the
       tapped path, which is the only one with tone control and the full
       fader range. Only a load error qualifies — a stall or a re-tune says
       nothing about whether the analysed path is allowed, and treating one
       as proof cost the station its meter for the rest of the session. */
    if (loadFailed && st && audio === corsEl && !startedThisTune && !provenCors[st.url] && !noCors[st.url]) {
      noCors[st.url] = true;
      tune(st, state.volume);
      return;
    }
    /* Handed the master, the browser would have stepped down the bitrate
       ladder by itself when the connection could not carry the top of it.
       The master is the thing that caused the repeat, so it is not handed
       over any more, and the stepping is done here instead: one rung per
       failure, whatever the cause, because a connection too slow for the
       top rung stalls on it rather than erroring on it. When the ladder
       runs out the choice is forgotten and the master is read again, which
       also covers the other case -- a rendition withdrawn or a CDN path
       taken out of service while the master still lists others. */
    if (st && hlsLadder[st.url]) {
      var rung = (hlsStep[st.url] || 0) + 1;
      if (rung < hlsLadder[st.url].length) {
        hlsStep[st.url] = rung;
        hlsVariant[st.url] = hlsLadder[st.url][rung];
      } else {
        delete hlsVariant[st.url]; delete hlsTried[st.url];
        delete hlsLadder[st.url]; delete hlsStep[st.url];
      }
    }
    attempts += 1;

    var hopeless = st ? Directory.hopelessReason(st.url, !!everSustained[st.url], attempts) : null;
    if (hopeless) {
      state.intendedPlaying = false;
      clearTimeout(retryTimer); retryTimer = null;
      try { audio.pause(); } catch (e) { /* already idle */ }
      setStatus('stopped', hopeless);
      save();
      return;
    }

    var delay = Scheduler.backoffMs(attempts);
    setStatus('reconnecting', 'Reconnecting \u00b7 try ' + attempts + ' in ' + Math.round(delay / 1000) + ' s');
    retryTimer = setTimeout(function () {
      retryTimer = null;
      var target = resolveTarget(true);
      tune(target.station, target.volume);
    }, delay);
  }

  /* Dragging a window fires no event of any kind, so where it has got to
     is read on the heartbeat that is already running rather than on a
     timer of its own, and once more on the way out. Both are cheap: the
     box is only written when it has actually changed. */
  setInterval(rememberBox, 5000);
  window.addEventListener('pagehide', rememberBox);

  // Heartbeat: currentTime must keep advancing while we intend to play.
  setInterval(function () {
    if (!state.intendedPlaying || status === 'reconnecting' || retryTimer || awaitingTap) return;
    if (ctx && ctx.state === 'suspended') ctx.resume();
    var t = audio.currentTime;
    var now = Date.now();
    if (t !== lastTime) { lastTime = t; stuckSince = now; }
    /* A frozen clock alone is not a stall. With the analyser attached the
       media clock can pause while the element still holds plenty of data,
       and re-tuning then lands several seconds behind live, which the
       listener hears as the last few seconds repeating. Only act when the
       element itself reports it has run short. */
    else if (stuckSince && now - stuckSince > (status === 'live' ? 15000 : 25000) && audio.readyState < 3) {
      stuckSince = 0;
      onFailure();
    }
    if (status === 'live' && liveSince && now - liveSince > 10000) {
      // Ten unbroken seconds is what counts as a stream that works.
      state.lastGood = { stationId: state.currentStationId, volume: state.volume, at: now };
      var sustained = currentStation();
      if (sustained) everSustained[sustained.url] = true;
      /* The rung it settled on is carrying the stream, so the ladder is
         wound back: a blip an hour from now starts at the top again rather
         than inheriting a downgrade from whatever went wrong this morning. */
      if (sustained && hlsLadder[sustained.url]) hlsStep[sustained.url] = 0;
      liveSince = 0; save();
    }
  }, 5000);

  // ---------- metering ----------
  var level = 0, lastTs = 0, meterQuiet = false, quietSince = 0;

  /* Set when tune() is called, cleared the moment audio arrives. Holding
     the needle through a rebuffer is right; holding it through a station
     change is not, because the old station's level is then being shown
     against the new station's name. */
  var meterRelease = false;
  /* The loop runs while there is something to draw and stops when there
     is not. It used to re-arm unconditionally, so a stopped radio asked
     for sixty frames a second all day to write the same zero into the
     same property -- cheap per frame, but it is what kept the window out
     of the browser's idle state for as long as the app was open.

     Stopping is safe only once the needle has come to rest, which is what
     `quiet` already means: it is false for the whole of the fall. So the
     last frame of the decay is drawn, and then nothing. */
  var meterRunning = false;

  function startMeter() {
    if (meterRunning) return;
    meterRunning = true;
    lastTs = 0;
    requestAnimationFrame(meterLoop);
  }

  function meterLoop(ts) {
    var dt = lastTs ? Math.min(ts - lastTs, 250) : 16;
    lastTs = ts;
    var target = 0;
    var lit = analyser && audio === corsEl && status === 'live' && !audio.paused;

    /* A second of rebuffering is not the same as stopping. Hold the needle
       where it is through a short interruption rather than dropping it to
       nothing and back, which reads as the meter breaking. */
    if (lit) { quietSince = 0; meterRelease = false; }
    else if (!quietSince) quietSince = ts;
    var holding = !lit && !meterRelease && state.intendedPlaying && ts - quietSince < 2000;
    if (lit) {
      analyser.getFloatTimeDomainData(timeData);
      var sum = 0;
      for (var i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i];
      var rms = Math.sqrt(sum / timeData.length);
      target = Signal.rmsToVu(rms);
      /* Measured on the raw RMS and not on `level`, which is the needle:
         the ballistics take about a second to fall and would put that
         second into every reading of how long the silence has lasted. */
      if (rms < SILENT_RMS) { if (!silentSince) silentSince = ts; }
      else {
        silentSince = 0;
        /* Sound. Whatever was wrong is over, so the ladder goes back to
           the bottom -- and only here, because a retune of our own puts
           the transport through 'connecting' and would otherwise look
           like a fix every time. */
        if (silentTries) silentTries = 0;
      }
      /* Filling this costs a 2048-point transform, and in every theme
         but Editorial the canvas it feeds is display:none. */
      if (TunerUI.scopeShowing(el.tuner)) {
        analyser.getByteFrequencyData(freqData);
        TunerUI.drawBars(el.tuner, freqData);
      }
    }
    if (!lit) silentSince = 0;
    var nowSilent = !!silentSince && ts - silentSince > SILENCE_MS;
    if (nowSilent !== streamSilent) {
      streamSilent = nowSilent;
      paintSilence();
      /* Coming back is the transport's line to write again, not this
         one's -- it knows the band, and it may have moved on while the
         silence was showing. */
      if (!streamSilent) sayStatus();
    }

    if (!holding) level = Signal.vuBallistics(level, target, dt);
    TunerUI.setLevel(el.tuner, level);
    paintStripLevel(lit ? target : level);
    paintStripScope();
    paintStripThump(ts);

    // Park the indicators only once the needle has actually fallen to rest.
    var quiet = !lit && !holding && level < 0.004;
    if (quiet !== meterQuiet) {
      meterQuiet = quiet;
      el.tuner.classList.toggle('is-quiet', quiet);
      if (quiet) TunerUI.clearScope(el.tuner);
    }
    if (!lit && !quiet && !holding) TunerUI.drawBars(el.tuner, null);

    /* Nothing playing, nothing held, and the needle on its stop: there is
       no next frame worth asking for. Anything that could change that
       calls startMeter. */
    if (quiet && !lit && !holding) { meterRunning = false; return; }
    requestAnimationFrame(meterLoop);
  }

  /* A multiplier on top of whatever the fader says, for the handover fade.
     It is deliberately not the fader's own value: the listener set that,
     and a slot change must not quietly rewrite it. 1 is out of the way. */
  var fadeMul = 1, fadeTimer = null;

  function applyGain() {
    var gain = Signal.volumeToGain(state.volume) * fadeMul;
    // The curve tops out at unity, so both paths can carry it unchanged and
    // the fader behaves the same whether or not the analyser tap is in use.
    if (gainNode && audio === corsEl) { corsEl.volume = 1; gainNode.gain.value = gain; }
    else audio.volume = gain;
    paintFade();
  }

  /* The fade is a multiplier over the fader and still never writes to the
     setting: state.volume is where the listener left it, and that is what
     is stored and what comes back. But a handover should be visible. Sound
     going away with nothing on screen accounting for it reads as a fault
     rather than as a changeover.

     So the control is moved, exactly as if a hand were on it: the slider
     travels down over the last seconds of a slot and back up when the next
     station is playing, and the number beside it counts with it.

     This used to set --turn alone, which is the number a theme drawn as a
     knob turns its cap by. That left every theme whose fader is an ordinary
     slider with nothing moving at all, because a range input's thumb is
     placed by its value and the fade never touched the value. The knob
     themes moved; the dial, the console and the rest did not.

     While a finger is on the fader nothing is written to it, or the thumb
     would be dragged out from under it -- the drag is the listener's and
     wins for as long as it lasts. */
  var draggingFader = false;

  function paintFade() {
    var input = el.volume;
    if (!input) return;
    var lo = +input.min, hi = +input.max;
    if (!draggingFader) {
      /* Not rounded. A range input whose step is 1 can only stand at whole
         numbers, about two pixels apart on this control, so a fade moved the
         knob in visible jumps however smoothly the gain itself was changing.
         The input carries step="any" for this; the value the listener set is
         still a whole number, because setVolume rounds it. */
      var shown = Math.max(lo, Math.min(hi, state.volume * fadeMul));
      if (+input.value !== shown) input.value = shown;
    }
    // A reading, though, so this one is whole.
    if (el.volumeOut) el.volumeOut.value = Math.round(+input.value);
    /* One place works out where the mark goes, so the faces drawn as a knob
       and the face drawn as lamps cannot disagree about it. This used to
       carry its own copy of the turn, which left the lamps behind. */
    markFader(input);
    // The strip's fader is the same reading, so it is drawn from the same place.
    paintStripFade();
  }

  /* Ramped on a timer rather than with the Web Audio scheduler, because
     the no-CORS path has no scheduler: it is an element's volume property
     and nothing else. One shape for both, and a fade nobody can hear the
     seams of at 25 steps a second. */
  /* On the frame clock. It was a 40ms interval, which is twenty-five steps a
     second in a thing the eye is watching move -- and the fader it drags along
     with it looked it. requestAnimationFrame also stops the work entirely when
     the window is not being drawn, which a timer does not.

     The other half of that stutter was the fader's own granularity: see the
     step on the volume input, and paintFade. */
  function fadeGain(to, ms, done) {
    stopFade();
    var from = fadeMul, started = 0;
    if (ms <= 0) { fadeMul = to; applyGain(); if (done) done(); return; }
    var step = function (ts) {
      if (!started) started = ts;
      var t = Math.min(1, (ts - started) / ms);
      fadeMul = from + (to - from) * t;
      applyGain();
      if (t < 1) { fadeTimer = requestAnimationFrame(step); return; }
      fadeTimer = null;
      if (done) done();
    };
    fadeTimer = requestAnimationFrame(step);
  }

  function stopFade() {
    if (fadeTimer) { cancelAnimationFrame(fadeTimer); fadeTimer = null; }
  }

  function setVolume(v, silent) {
    v = Math.max(0, Math.min(100, Math.round(v)));
    state.volume = v;
    /* applyGain ends in paintFade, which is the one place the control is
       drawn. Writing the value here as well would stamp the setting over a
       fade in progress, a frame at a time, and the fader would sit still
       through every handover. */
    applyGain();
    paintStrip();
    if (!silent) save();
  }

  /* A range input says nothing in CSS about where it sits between its
     ends, and a theme drawn as a knob has to turn something by exactly
     that. One number per fader, 0 at the low end and 1 at the high. */
  /* How wide one lamp is on a face drawn as lamps, or 0 on the rest. Read
     once per look rather than per frame: it is a style read, and this runs on
     every movement of every fader. applyLook clears it. */
  var faderCell = null;

  function lampWidth(wrap) {
    if (faderCell !== null) return faderCell;
    faderCell = 0;
    try {
      faderCell = parseFloat(getComputedStyle(wrap).getPropertyValue('--fader-cell')) || 0;
    } catch (e) { /* unreadable: no lamps, then */ }
    return faderCell;
  }

  function markFader(input) {
    var lo = +input.min, hi = +input.max;
    var at = hi > lo ? (+input.value - lo) / (hi - lo) : 0;
    // On the wrapper, not the input: a theme that draws the control as a
    // knob builds it out of the wrapper's own pseudo-elements, and those
    // can only read what the wrapper has.
    var wrap = input.parentElement || input;
    wrap.style.setProperty('--turn', at.toFixed(4));

    /* And, where the face is a row of lamps, which lamp is lit -- as a length,
       snapped to whole cells. Half a lit lamp is not a thing a row of lamps
       can do, and the fader used to show one every time it came to rest
       between two. The same bargain vuTargets strikes for the meter. */
    var cell = lampWidth(wrap);
    if (cell > 0) {
      var w = input.clientWidth;
      var lamps = Math.max(1, Math.floor(w / cell));
      var lit = Math.min(lamps - 1, Math.round(at * (lamps - 1)));
      wrap.style.setProperty('--lit-x', (lit * cell) + 'px');
    }
  }

  function showDb(v) { return (v > 0 ? '+' : '') + v; }
  /* The sliders show the current station's tone, so moving one writes
     through to that station and the setting is there again next time. */
  function rememberTone() {
    var st = currentStation();
    if (!st) return;
    st.bass = state.bass;
    st.treble = state.treble;
  }
  function loadTone(st) {
    state.bass = clampTone(st && st.bass);
    state.treble = clampTone(st && st.treble);
    applyTone();
  }

  function applyTone() {
    if (bassNode) bassNode.gain.value = state.bass;
    if (trebleNode) trebleNode.gain.value = state.treble;
    el.bass.value = state.bass; el.bassOut.value = showDb(state.bass);
    el.treble.value = state.treble; el.trebleOut.value = showDb(state.treble);
    markFader(el.bass); markFader(el.treble);
  }

  // ---------- overlay (autoplay gate) ----------
  /* While the panel is up nothing can start on its own, so the stall
     heartbeat and the retry backoff have to stand down. Without that they
     keep re-tuning behind the panel and every attempt is refused for the
     same reason: nobody has clicked yet. */
  var awaitingTap = false;
  var launching = false;
  function showOverlay() {
    var st = currentStation();
    var lead = launching ? "Starts " : "Resumes ";
    // Windows has a way out of this panel for good; say so while it is up.
    var way = isMac() ? "" : " To start it on its own, run Win - Create Desktop Shortcut (Chrome).cmd in the app folder.";
    el.startSub.textContent = (st
      ? lead + st.name + ". Browsers need one click before audio can play."
      : "Browsers need one click before audio can play.") + way;
    awaitingTap = true;
    clearTimeout(retryTimer); retryTimer = null;
    el.overlay.hidden = false;
    setStatus('idle', 'Waiting for tap');
  }
  el.overlay.addEventListener('click', function () {
    awaitingTap = false;
    launching = false;
    el.overlay.hidden = true;
    startPlayback();
  });

  /* ---------- scheduler tick ----------
     Slot edges are whole minutes, so the tick has to land on them. A plain
     twenty-second interval ran from whenever the page happened to open,
     which left a slot that ends at 10:00 still playing for up to twenty
     seconds past it. Re-arming on the top of each second costs nothing here
     and puts every change within a few milliseconds of its edge. */
  var tickTimer = null;
  function startTicking() {
    clearTimeout(tickTimer);
    var wait = 1000 - (Date.now() % 1000) + 15;
    tickTimer = setTimeout(function () { tick(); startTicking(); }, wait);
  }

  /* Which slot was in force at the last beat, and whether there has been
     a beat at all. Identity, not a string of the slot's fields: the slot
     objects in state.schedule are stable between saves, and a key built
     from start, end, station and volume could not tell two slots apart
     that differed only in tone or theme. seenOnce carries what the
     undefined sentinel used to: on the very first beat nothing is retuned,
     because boot has already decided what to play. */
  var lastSlot = null, seenOnce = false;

  /* Set when the schedule -- not the listener -- stopped the radio, so the
     next slot knows it may start it again. Cleared by any deliberate press
     of play or stop, which is what keeps a manual stop stopped. */
  var scheduleStopped = false;

  function groupOfSlot(slot) {
    return (state.schedule.weekend || []).indexOf(slot) !== -1 ? 'weekend' : 'weekday';
  }

  /* ---------- handover ----------
     The last minute of a slot, shown on the chip as a line running out
     along its bottom edge, and the last five seconds of it faded down so
     the change of station is a segue rather than a cut.

     The bar is armed once, for one particular changeover, and left to the
     compositor for the rest of the minute -- the clock here ticks once a
     second and would make a visibly steppy bar if it drove it. --count-ms
     is whatever is actually left when the arming happens, so a tab that
     was asleep for forty seconds picks up a twenty-second bar rather than
     starting a fresh minute. */
  var HANDOVER_FADE_MS = 5000;   // down, before the change
  var RETURN_FADE_MS = 2000;     // up, once the next station is playing
  var armedFor = null;

  function disarmHandover(restore) {
    setStripNote('');
    if (armedFor === null) return;
    armedFor = null;
    el.schedToggle.classList.remove('is-counting', 'is-handing');
    el.schedToggle.style.removeProperty('--count-ms');
    // Only when the change never came: after one, the fade up does this.
    if (restore && fadeMul !== 1) fadeGain(1, 300);
  }

  function updateHandover(now) {
    if (!state.schedulerEnabled) { disarmHandover(true); return; }
    var n = Scheduler.nextChange(state.schedule, now);
    if (!n) { disarmHandover(true); return; }

    /* A handover to the station already playing changes settings and
       nothing else, so there is nothing to count down to and nothing to
       fade. Announcing it would promise a change the listener never
       hears. */
    if (n.slot && n.slot.stationId === state.currentStationId) { disarmHandover(true); return; }

    var left = n.at.getTime() - now.getTime();
    if (left > 60000 || left < 0) { disarmHandover(true); return; }

    var stamp = n.at.getTime();
    if (armedFor !== stamp) {
      disarmHandover(false);
      armedFor = stamp;
      el.schedToggle.style.setProperty('--count-ms', Math.max(0, left) + 'ms');
      // Read back, so the animation starts from this frame rather than
      // resuming wherever the last one had got to.
      void el.schedToggle.offsetWidth;
      el.schedToggle.classList.add('is-counting');
    }

    /* Thirty seconds is about as long as a countdown is worth watching, and
       the strip has one short line to say it in. The three things that can
       be about to happen are named the way the chip on the radio's own face
       names them: a station starting is a change, a slot ending is an end,
       and a slot ending into a gap the radio plays through is both. */
    if (left <= 30000) {
      var starting = !!n.slot;
      var onInto = !starting &&
        (state.scheduleEnds || {})[groupOfSlot(Scheduler.activeSlot(state.schedule, now))] !== 'off';
      var what = starting ? 'Schedule change'
        : (onInto ? 'Schedule play ends, then freeplay' : 'Schedule play ends');
      setStripNote(what + ' in ' + Math.max(0, Math.ceil(left / 1000)) + 's');
    } else {
      setStripNote('');
    }

    if (left <= HANDOVER_FADE_MS && !el.schedToggle.classList.contains('is-handing')) {
      el.schedToggle.classList.add('is-handing');
      /* Not into a gap that carries on. The fade is there so a change of
         station is a segue rather than a cut, and a gap set to keep
         playing is not a change of anything: the same station goes on
         playing. Fading it down and straight back up made a slot ending
         sound like a fault, and it was the thing that looked broken when
         a gap failed to turn the radio off. Nothing changes, so nothing
         moves. */
      var staysOn = !n.slot &&
        (state.scheduleEnds || {})[groupOfSlot(Scheduler.activeSlot(state.schedule, now))] !== 'off';
      if (state.intendedPlaying && status === 'live' && !staysOn) fadeGain(0, Math.max(300, left));
    }
  }

  function tick() {
    var now = new Date();
    /* Only when it has changed. Assigning the same text still replaces
       the text node, which invalidates style, lays out, paints and asks
       the compositor for a frame -- once a second, all day, to show the
       same two digits it was already showing. */
    var hhmm = pad(now.getHours()) + ':' + pad(now.getMinutes());
    if (el.clock.textContent !== hhmm) el.clock.textContent = hhmm;
    paintStripClock(hhmm);
    var slot = state.schedulerEnabled ? Scheduler.activeSlot(state.schedule, now) : null;
    if (slot !== lastSlot) {
      var first = !seenOnce;
      var ended = lastSlot;
      lastSlot = slot;
      seenOnce = true;

      /* The countdown is over because the thing it was counting to has
         happened, so it is taken down without restoring the level. That
         distinction is the whole of disarmHandover's argument, and
         getting it wrong here is what made the fade-in inaudible: the
         handover left the level at nothing, and then updateHandover ran
         later in this same tick, found the next change an hour away, and
         restored it over 300ms -- while the new station was still
         connecting. By the time it had anything to play, the level was
         already back at full. Nothing was audibly faded in.

         Put back by whoever knows the new station is really playing: the
         live transition in setStatus for a slot that tuned something, and
         the branch below for a day that simply ended. */
      if (!first) disarmHandover(false);

      /* Nothing is in force, and the setting says what that means.

         It used to mean it only at the end of the day: a gap in the
         middle of one went on playing whatever was on, whatever the
         setting said. Two things were wrong with that. The option reads
         "turn the radio off until the next slot", and during a gap the
         next slot is the thing two minutes away -- so somebody who set it
         and left a gap heard the radio come straight back on and had
         every reason to call that broken. And the pane's own opening
         paragraph promised the switch covered gaps while the line under
         the switch said it did not.

         One rule now: nothing scheduled and set to off means off, whether
         the next slot is in two minutes or tomorrow morning. It is also
         the shorter sentence, which is usually the sign.

         Which group's setting applies is the group of the slot that just
         ended, not the group of the day it ended on: a Friday night slot
         running to one in the morning is a weekday slot, and it is the
         weekday setting that decides what happens when it stops. */
      if (!slot && !first && state.intendedPlaying) {
        var ends = state.scheduleEnds || {};
        if (ends[groupOfSlot(ended)] === 'off') {
          stopPlayback();
          scheduleStopped = true;
        } else if (fadeMul !== 1) fadeGain(1, RETURN_FADE_MS);
      }

      if (slot && !first && (state.intendedPlaying || scheduleStopped)) {
        var st = station(slot.stationId);
        if (!st) {
          /* Nothing to tune. The handover has already faded the level to
             nothing, and without this the radio would go on streaming the
             station before it in silence -- the level is only ever put
             back by a station going live, and none is coming. settle makes
             this unreachable; it is here because the fade must not depend
             on that being true. */
          if (fadeMul !== 1) fadeGain(1, RETURN_FADE_MS);
        } else {
          /* The schedule stopped the radio at the end of the last day and
             this is the next slot, so it starts it again. A stop the
             listener asked for is not undone this way: scheduleStopped is
             only true when the schedule was the one that stopped it. */
          if (scheduleStopped) {
            scheduleStopped = false;
            state.intendedPlaying = true;
            ensureGraph();
            stopFade();
            fadeMul = 1; applyGain();
          }

          /* Whatever the slot applies wins over what is in use now. Tone is
             written onto the station before tuning, because tone belongs to
             the station and tune() reads it from there. */
          var want = Scheduler.slotSettings(slot);
          if (want.bass !== null) st.bass = want.bass;
          if (want.treble !== null) st.treble = want.treble;

          /* Two slots in a row on one station is a change of settings, not
             a change of station. Retuning would tear the stream down and
             build it again for no reason: a gap, a reconnection, and on a
             live stream several seconds lost. So the settings are applied
             where they stand and the audio is left running. */
          var sameStation = st.id === state.currentStationId &&
            state.intendedPlaying && status === 'live';

          if (sameStation) {
            loadTone(st);
            if (want.volume !== null) setVolume(want.volume, true);
            if (fadeMul !== 1) fadeGain(1, RETURN_FADE_MS);
          } else {
            attempts = 0;
            tune(st, want.volume === null ? state.volume : want.volume);
          }

          if (want.theme !== null && want.theme !== state.theme) {
            state.theme = want.theme;
            applyLook();
            save();
          }
        }
      }
    }
    renderNext(now);
    updateHandover(now);
  }

  /* Everything is restored from the last session, but a slot that is
     already running at launch outranks it: the app should open looking and
     sounding the way the schedule says it should at this hour, not the way
     it happened to be left. Only what the slot opts into is applied. */
  function applySlotNow(slot) {
    if (!slot) return;
    var want = Scheduler.slotSettings(slot);
    var st = station(slot.stationId);
    if (st) {
      if (want.bass !== null) st.bass = want.bass;
      if (want.treble !== null) st.treble = want.treble;
    }
    if (want.theme !== null && want.theme !== state.theme) { state.theme = want.theme; applyLook(); }
    if (want.volume !== null) setVolume(want.volume, true);
    save();
  }

  /* ---- the version, said once ----------------------------------------
     An update replaces the files under a closed radio. By the time the
     listener sees anything, the installer's window has gone -- so the
     only place left to say which version they are now running is the
     radio itself, on the one part of it that is always being read.

     Five flashes and then the station, which is the shape of a thing
     that has something to say and then gets out of the way. The timings
     are here and in app.css both, and a test holds them together: a
     flash count that disagrees with the animation is a readout that
     either goes dark or cuts itself off. */
  /* Everything that puts a station name on the readout goes through
     here, so something that has taken the readout over cannot be
     written round by a path that did not know about it. There were
     four such paths and guarding one of them was not enough: the
     announcement was replaced three milliseconds after it appeared, by
     applyLook, which sets the name as part of dressing a theme.

     The announcement itself calls TunerUI.setName directly. That is
     the only thing that may. */
  function showName(text) {
    if (announcing) return;
    TunerUI.setName(el.name, text);
  }

  /* Five blinks. The first four snap on and off; the fifth goes out the
     same way and stays out, which is why the CSS runs the snap four
     times and a separate rule holds the last one dark. Then the pause,
     which is what makes the ending an ending -- it used to be carried
     by a slow fade, and a fade eight times slower than the blinks it
     followed read as winding down rather than finishing. A test holds
     these numbers to the ones in app.css. */
  var ANNOUNCE_FLASHES = 5;
  var ANNOUNCE_STEP_MS = 1000;
  /* The lit part of one blink, and the ramp that ends it: 45% and 5% of
     the step, which is what the keyframes say. */
  var ANNOUNCE_ON_MS = Math.round(ANNOUNCE_STEP_MS * 0.45);
  var ANNOUNCE_FADE_MS = Math.round(ANNOUNCE_STEP_MS * 0.05);
  var ANNOUNCE_GAP_MS = 900;
  /* Four whole cycles, and then the fifth blink's own lit stretch
     before it goes out for good.

     Without that last term this fired the moment the fourth cycle
     ended -- and a cycle ends lit, because its final 5% ramps the text
     back up ready for the next one. So the fifth blink came on and was
     taken away again 65 milliseconds later: a stutter, not a blink.
     Reported off a screen recording, and visible in the trace as a
     fade-out beginning 15ms after the flash animation finished. */
  var ANNOUNCE_MS = (ANNOUNCE_FLASHES - 1) * ANNOUNCE_STEP_MS + ANNOUNCE_ON_MS;
  var announcing = false;

  function announceVersion() {
    if (!el.name) return;
    var back = function () {
      announcing = false;
      var st = currentStation();
      TunerUI.setName(el.name, st ? st.name : '');
      /* Both class changes and the new name land before the next style
         recalculation, so the readout goes straight from dark into the
         fade. Removing the fade first and adding the return afterwards
         in two frames would show one frame of the name at full. */
      el.name.classList.remove('is-fading');
      el.name.classList.add('is-returning');
      setTimeout(function () { el.name.classList.remove('is-returning'); }, 400);
      /* Nothing theme-specific here. setName strikes the console's cells
         and turns the departures board of its own accord whenever the
         name changes, and handing the readout back from the announcement
         is a change like any other. */
    };

    /* The last blink, as a fade. The snaps stop here and the text goes
       out over ANNOUNCE_FADE_MS, then holds dark for the beat. */
    var leave = function () {
      el.name.classList.remove('is-announcing');
      el.name.classList.add('is-fading');
      setTimeout(back, ANNOUNCE_FADE_MS + ANNOUNCE_GAP_MS);
    };

    announcing = true;
    TunerUI.setName(el.name, 'UPDATED TO V' + APP_VERSION);
    var still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (!still) {
      el.name.classList.remove('is-announcing');
      void el.name.offsetWidth;
      el.name.classList.add('is-announcing');
    }
    setTimeout(still ? back : leave, ANNOUNCE_MS);
  }

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  /* The next-up text, and the width the chip should become to hold it.

     Measured rather than left to the layout: width is what the CSS
     animates, and it has to be handed a length to animate to.

     Measured with a Range over the text, not with scrollWidth. scrollWidth
     is the larger of the content and the box, and the box is now held at
     an explicit width -- so once that width was wider than the new text,
     scrollWidth simply read the box back, --next-w never changed, and the
     chip sat at 30ch for every station. A Range's rect is the run of
     glyphs themselves, letter-spacing included, whatever box they are in.
     Only read when the text actually changed, a few times an hour. */
  /* Split out from setNextUp because the text is not the only thing that
     changes the width of it. Every theme sets its own size and letter
     spacing on this chip -- Tivoli 11px at .1em against the default --
     and a theme change leaves the text identical, so setNextUp returned
     early and the box kept a width measured under the theme before it.
     Narrower theme, same width, and the last characters were cut off:
     "Free play at 18" for "Free play at 18:00". */
  function measureNext() {
    var n = el.schedNext;
    if (!n.textContent) return;
    var range = document.createRange();
    range.selectNodeContents(n);
    var w = range.getBoundingClientRect().width;
    range.detach();
    /* Two pixels of slack. The rect is fractional and the box is not, and
       rounding a hair short costs a whole character to overflow: hidden. */
    n.style.setProperty('--next-w', (Math.ceil(w) + 2) + 'px');
  }

  function setNextUp(text) {
    var n = el.schedNext;
    if (n.textContent === text) return;
    n.textContent = text;
    measureNext();
  }

  function renderNext(now) {
    var hide = state.schedulerEnabled ? 'false' : 'true';
    if (el.schedNext.getAttribute('aria-hidden') !== hide) el.schedNext.setAttribute('aria-hidden', hide);
    // Leave the old text in place while the chip is off: it is clipped to
    // zero width by CSS, and keeping it is what gives the slide something
    // to collapse.
    if (!state.schedulerEnabled) { return; }
    var n = Scheduler.nextChange(state.schedule, now);
    if (!n) { setNextUp('No slots yet'); return; }
    var st = n.slot ? station(n.slot.stationId) : null;
    var when = pad(n.at.getHours()) + ':' + pad(n.at.getMinutes());
    var sameDay = n.at.toDateString() === now.toDateString();
    var day = sameDay ? '' : ' ' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][n.at.getDay()];

    /* Nothing playing at that instant is not the same thing as free play.
       Whether the radio keeps going or turns itself off is the question
       tick() answers at the changeover, and the chip has to answer it the
       same way or it promises music where there is about to be silence.
       The group that decides is the one the ending slot belongs to, not
       the day it ends on.

       Three things can be about to happen and the chip used to name only
       two of them. A gap in the middle of the day is not the end of the
       day: the setting that can turn the radio off does not apply to it
       and whatever is on keeps playing. The chip called that "Free play"
       -- which is the name of the other setting, word for word -- so five
       minutes between two slots was enough to make the drawer look like
       it was lying about being set to turn off. "Free play" is now said
       only when the day really has ended and the setting really is Keep
       playing; a gap says so, and says what it means for the sound. */
    var text;
    if (st) {
      text = st.name + ' at ' + when + day;
    } else {
      /* Nothing is starting at the next change, so the chip has been
         saying what stops and leaving the obvious question unanswered:
         and then what? The answer is one more step along the same walk
         -- the change after this one, which is the next slot to start.
         Named here so a gap or an evening off says when the schedule
         picks up again, rather than making somebody open the drawer to
         find out. */
      var ends = state.scheduleEnds || {};
      var ending = Scheduler.activeSlot(state.schedule, now);
      var group = ending ? groupOfSlot(ending) : Scheduler.dayGroup(n.at);
      var after = Scheduler.nextChange(state.schedule, n.at);
      var back = after && after.slot ? station(after.slot.stationId) : null;
      var rt = '', rday = '';
      if (back) {
        rt = pad(after.at.getHours()) + ':' + pad(after.at.getMinutes());
        rday = after.at.toDateString() === n.at.toDateString() ? ''
          : ' ' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][after.at.getDay()];
      }

      /* The two cases want different things said, and the chip has room
         for about thirty-five characters before it starts cutting words
         in half.

         A gap is minutes away, so the station is the useful part: it is
         the next thing that will be heard. The end of the day is hours
         away and often tomorrow, where the station is a detail and the
         question is when the schedule picks up at all -- so that one
         names the time and leaves the station to the drawer. */
      /* The setting picks the first word, now that it applies to both.
         What follows it is still chosen by which of the two this is: a
         gap is minutes away and the station is the useful part, being the
         next thing that will be heard; the end of the day is hours away
         and often tomorrow, where the station is a detail and the
         question is when the schedule picks up at all. */
      var over = Scheduler.dayIsOver(state.schedule, n.at);
      var head = ends[group] === 'off' ? 'Radio off' : (over ? 'Free play' : 'Gap');
      var tail = '';
      if (back) tail = over ? ' · back ' + rt + rday : ' · ' + back.name + ' at ' + rt + rday;
      else if (!over) tail = ' · radio stays on';
      text = head + ' at ' + when + day + tail;
    }
    setNextUp(text);
  }

  el.schedToggle.addEventListener('click', function () {
    state.schedulerEnabled = !state.schedulerEnabled;
    el.schedToggle.setAttribute('aria-pressed', state.schedulerEnabled);
    el.schedLabel.textContent = state.schedulerEnabled ? 'Schedule on' : 'Schedule off';
    lastSlot = null; seenOnce = false;
    save(); tick();
  });

  // ---------- rendering ----------
  function renderStation(st) {
    /* The readout is spoken for while the version is being announced.
       Everything else here still runs -- the band, the tagline, the
       presets, the needle -- and the name is set by the announcement
       when it hands back, from whatever station is current by then. */
    /* The tone belongs to the station, so the sliders and the graph follow
       it here -- at the one point every path passes through when a new
       station arrives on the front.

       It used to be done in tune(), which meant it was done only when the
       radio was playing. Choosing a station on a stopped set never reaches
       tune(), so the controls went on showing the station before it: the
       reading was wrong, and the next nudge of either slider was worse
       than wrong, because rememberTone writes both values through to the
       current station and so copied the old station's tone onto the new
       one. */
    loadTone(st);
    el.band.textContent = st.band || 'Internet stream';
    showName(st.name);
    el.tag.textContent = st.tag || '';
    el.tuner.style.setProperty('--station', st.color || '#10307a');
    TunerUI.setNeedle(el.tuner, st.band);
    var btns = el.presets.querySelectorAll('.preset[data-id]');
    for (var k = 0; k < btns.length; k++) {
      var on = btns[k].dataset.id === st.id;
      btns[k].classList.toggle('is-active', on);
      if (on && btns[k].scrollIntoView) btns[k].scrollIntoView({ block: 'nearest' });
    }
    document.title = st.name + ' · Deskside Radio';
    updateMediaSession();
    paintStrip();
  }

  function renderPresets() {
    el.presets.innerHTML = '';
    state.stations.forEach(function (st, i) {
      var b = document.createElement('button');
      b.className = 'preset' + (st.id === state.currentStationId ? ' is-active' : '');
      b.dataset.id = st.id;
      b.appendChild(span('preset-n', String(i + 1)));
      b.appendChild(span('preset-name', st.name));
      b.appendChild(span('preset-band', st.band || ''));
      b.addEventListener('click', function () {
        /* Pressing the station already playing should do nothing. Re-tuning
           tears the stream down and rebuilds it, which on a live stream means
           a gap and a restart several seconds behind where it was. */
        if (st.id === state.currentStationId && state.intendedPlaying && !awaitingTap) return;

        /* A stopped radio stays stopped. Choosing a station on a set that
           is off is choosing what will play when it is switched on, which
           is what moving the dial on a real one does -- it is not a
           request to switch it on. The choice is still made, shown and
           saved; only the audio is left alone.

           awaitingTap is deliberately not caught by this: there the
           listener has already asked for sound and the browser is waiting
           on a gesture, so this press is the gesture. */
        if (!state.intendedPlaying && !awaitingTap) {
          state.currentStationId = st.id;
          renderStation(st);
          save();
          return;
        }

        ensureGraph();
        state.intendedPlaying = true; attempts = 0;
        el.overlay.hidden = true;
        awaitingTap = false;
        tune(st);
      });
      el.presets.appendChild(b);
    });
    var add = document.createElement('button');
    add.className = 'preset preset-add';
    add.appendChild(span('preset-n', '+'));
    add.appendChild(span('preset-name', 'Add station'));
    add.appendChild(span('preset-band', 'Name and stream URL'));
    add.addEventListener('click', function () { openSettings(); $('addStation').click(); });
    el.presets.appendChild(add);
    measurePresetNames();
  }

  /* Only a name that genuinely overruns its button gets to move. The class
     is what the stylesheet keys on, so a name that fits carries nothing and
     cannot animate. Re-measured on a resize and on a theme change, since
     both change the column width and the face the name is set in. */
  /* Settle rather than measure once, the same as fitWindow. The first pass
     is taken while the fallback face is still standing in; the webfont that
     lands after it changes every width by a few pixels, and a button left
     holding the first answer scrolls by exactly that much for ever, which
     reads as a twitch rather than a scroll. Each later pass is a no-op when
     nothing has moved. */
  var MEASURE_PASSES = [0, 120, 400, 1200];

  function measurePresetNames(pass) {
    // Also used as an event handler, which would hand it an Event.
    pass = typeof pass === 'number' ? pass : 0;
    setTimeout(function () {
      /* Height first, and the names after it. Snapping the list to whole
         rows is what decides whether it scrolls, and a scrollbar inside it
         takes a dozen pixels off every button. Measured the other way
         round, a name that just fits is measured against a column that is
         about to get narrower. */
      snapPresetRows();
      if (sizedOnce) fitWindow();
      // A cell-built meter's step is a fraction of a bar that just changed
      // width, so it has to be taken again.
      TunerUI.refreshMeter(el.tuner);
      var names = el.presets.querySelectorAll('.preset-name');
      // Cleared for all of them first, so each is measured against the
      // button rather than against its own previous fit.
      for (var i = 0; i < names.length; i++) TunerUI.clearFit(names[i]);
      for (var k = 0; k < names.length; k++) TunerUI.fitLine(names[k]);
      if (pass + 1 < MEASURE_PASSES.length) measurePresetNames(pass + 1);
    }, MEASURE_PASSES[pass]);
  }

  /* With no name wrapping, every row is the same height, so the scrolling
     window can be snapped to a whole number of them. Each theme's own
     --presets-max is kept as the intent and only rounded to the nearest row,
     which is what stops a row being sliced through the middle. Our own value
     is cleared first, or the second pass would round the rounded figure. */
  function snapPresetRows() {
    var first = el.presets.querySelector('.preset');
    if (!first) return;
    el.presets.style.removeProperty('--presets-max');
    var cs = getComputedStyle(el.presets);
    /* Themes that never declare one inherit the stylesheet's own default,
       which computes to an empty string here rather than to 190px. */
    var want = parseFloat(cs.getPropertyValue('--presets-max')) || 190;
    var gap = parseFloat(cs.rowGap) || 0;
    var rowH = first.offsetHeight;
    if (!(want > 0) || !(rowH > 0)) return;
    /* The room left for a pressed key to move down into is padding on the
       scroll box, so it counts as content. Left out of the height, a list
       that fits exactly overflows by those few pixels and shows a
       scrollbar for a row that is entirely visible. */
    var press = parseFloat(cs.paddingBottom) || 0;
    var rows = Math.max(1, Math.round((want + gap) / (rowH + gap)));
    el.presets.style.setProperty('--presets-max', (rows * rowH + (rows - 1) * gap + press) + 'px');
  }

  /* Anything that changes how wide a name renders has to re-run the
     measurement, or a button keeps a scroll it no longer needs. That is
     what the twitch on a slightly-too-long name actually was: measured
     while the fallback face was still standing in, never measured again,
     and left scrolling by the handful of pixels the two faces differ by.

     fonts.ready settles once. A theme switch asks for a face that has not
     been used yet, which starts a fresh load well after that, so the event
     is what to listen to. The observer covers the other half: the buttons
     change width when the window does, and when a station is added. */
  /* The next-up chip is measured text in a box held at that measurement,
     so it wants the same news: a face that arrives after the first
     measurement is a different width for the same string. */
  function measureNames() { measurePresetNames(); measureNext(); }
  if (document.fonts) {
    if (document.fonts.ready) document.fonts.ready.then(measureNames);
    if (document.fonts.addEventListener) {
      document.fonts.addEventListener('loadingdone', measureNames);
    }
  }
  if (window.ResizeObserver && el.presets) {
    var lastPresetsW = 0;
    new ResizeObserver(function () {
      // Width only: measurePresetNames sets the height itself, and watching
      // that would have it answering its own change for ever.
      var w = el.presets.clientWidth;
      if (w === lastPresetsW) return;
      lastPresetsW = w;
      measurePresetNames();
    }).observe(el.presets);
  }
  window.addEventListener('resize', measurePresetNames);
  function span(cls, text) { var s = document.createElement('span'); s.className = cls; s.textContent = text; return s; }

  /* ---------- window fitting ----------
     The shortcut opens a window of its own, so the app can size that window
     to the radio rather than leave a border of empty page around it. The
     themes are not the same height -- Marconi is nearly 200px taller than
     Editorial -- so this runs again on every theme change.

     Chrome's barprop flags cannot be used to tell an app window from a tab:
     locationbar.visible and friends answer true in both. Measured, the
     chrome above the page is the giveaway -- 37px for an app window against
     94px for a tab -- so that is what gates it. In a tab resizeTo is ignored
     anyway, but this keeps it from being called at all. */
  /* Sizing and moving the window is for the window the launcher opens, and
     for nothing else. A thin frame is the test -- an --app window has no
     tab strip and no address bar -- but a Safari window with its toolbar
     hidden is thin too, and moving somebody's ordinary browser window
     about would be a rude way to be wrong. The launcher only ever opens
     Chrome or Edge, so a browser that is neither is left alone. */
  function windowIsOurs() {
    if (!/Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent)) return false;
    var frame = window.outerHeight - window.innerHeight;
    return frame > 0 && frame < 60;
  }

  /* Where the window was when it was last shut, so it opens there again.
     Chrome will not do this for us: an --app window opened on the same
     profile it was closed from comes up in the top-left corner at a size
     of its own choosing. That was measured rather than assumed -- a window
     moved to 420,260 at 760x520 and closed reopened at 10,10 at 1265x1372. */
  function rememberBox() {
    if (!windowIsOurs()) return;
    // The drawer has the window on loan; its height is not the radio's.
    if (borrowedBox) return;
    // Stowed: the window is a placard by our own doing, which is not a size
    // the listener chose and not one to come back to.
    if (pinnedBox) return;
    /* The theme travels with the box, because a height only means anything
       alongside the face it was measured against: the console sits at 700
       and the dial wants 744. Restoring one theme's height under another
       is a scrollbar, and that is exactly what a settings file arriving
       with a different theme in it used to produce. */
    var box = {
      x: window.screenX, y: window.screenY,
      w: window.outerWidth, h: window.outerHeight,
      t: state.theme
    };
    // Minimised, or caught mid-drag, is not a position worth keeping.
    if (!(box.w > 200 && box.h > 200)) return;
    var had = state.windowBox;
    if (had && had.x === box.x && had.y === box.y && had.w === box.w && had.h === box.h
      && had.t === box.t) return;
    state.windowBox = box;
    save();
  }

  /* Clamped to the screen in front of the user now, not the one the box
     was saved on: a second monitor that has since been unplugged would
     otherwise put the window somewhere it cannot be reached.

     The clamp is also, it turns out, only for show. Chrome refuses to let
     a page put a window partly off the screen and does the same arithmetic
     itself, on all four edges -- measured: asking for 1900,900 at 900x700
     on a 2560x1392 desktop lands at 1660,692, and asking for -14,-5 lands
     at 0,0, with or without this. It is left in because it keeps the
     numbers this function works with honest, not because it changes where
     the window goes.

     That refusal is why a window dragged hard into the top-left corner
     cannot be restored there. Windows gives a Chrome window an invisible
     resize border outside its visible frame -- 14px at the left and 5px at
     the top on this machine -- so screenX reads -14 when the visible edge
     is flush at 0, and no page is allowed to ask for -14. */
  /* The size is only put back where the listener could not have set it by
     hand. On Windows the launcher takes the resize grip off the window, so
     a saved size is one the radio chose and is worth keeping. Everywhere
     else the edges can still be dragged, and the ask was that a size got
     that way is not remembered: the window comes back where it was left,
     at whatever size the theme in front of it wants.

     The return value says whether the size is settled. False sends
     sizeWindow on to the fitting path, which is the same path a fresh
     install takes. */
  function restoreBox() {
    var box = state.windowBox;
    if (!box || !windowIsOurs()) return false;
    /* The size is taken only when it was measured against the face now on
       screen. The position is taken either way -- where the window sits is
       the listener's, whatever it is showing.

       A box with no theme on it was written before 1.4.9 and cannot say,
       so it is trusted and checked instead: see the overflow test in
       sizeWindow, which is what catches a wrong one on the way past. */
    var sized = onWindows() && (box.t == null || box.t === state.theme);
    var w = sized ? Math.min(box.w, screen.availWidth) : window.outerWidth;
    var h = sized ? Math.min(box.h, screen.availHeight) : window.outerHeight;
    var x = Math.max(0, Math.min(box.x, screen.availWidth - w));
    var y = Math.max(0, Math.min(box.y, screen.availHeight - h));
    try {
      if (sized) window.resizeTo(w, h);
      window.moveTo(x, y);
    } catch (e) { return false; }
    return sized;
  }

  /* The size the radio wants, worked out once and used by both the thing
     that resizes and the thing that decides whether resizing is needed.
     They used to have a copy each, and the copies were not the same
     question: one asked what the window should be, the other only asked
     whether the page overran. A window left too big satisfied the second
     and was never handed to the first.

     Measured with the scrollbar suppressed, which is what took this from
     three resizes to one. The first measurement used to be taken with a
     scrollbar present; that narrows the tuner, which makes it taller than
     it will be once the bar goes, so the window was sized to a height it
     then had to be corrected away from. Correcting it in front of the
     listener is the flicker. Take the bar out of the measurement and the
     first answer is the right one. */
  function wantedBox() {
    var root = document.documentElement;
    var hadOverflow = root.style.overflow;
    root.style.overflow = 'hidden';

    var cs = getComputedStyle(document.body);
    var padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    var padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    var cap = parseFloat(cs.getPropertyValue('--tuner-max')) || 1100;
    var frameW = window.outerWidth - window.innerWidth;
    var frameH = window.outerHeight - window.innerHeight;

    // A pixel of slack each way: a fractional layout would round up into a
    // scrollbar, which is the one thing this is meant to avoid.
    var w = Math.min(Math.ceil(cap + padX) + frameW + 1, screen.availWidth);
    var h = Math.min(Math.ceil(el.tuner.offsetHeight + padY) + frameH + 1, screen.availHeight);

    root.style.overflow = hadOverflow;
    return { w: w, h: h };
  }

  /* How far out a remembered box may be before it is treated as wrong
     rather than as somebody's choice. A fit lands within a pixel, so
     anything past a handful is a box that no longer describes the radio
     inside it. */
  var BOX_SLACK = 8;

  function fitWindow(pass) {
    if (!mayFit || keepBox || !windowIsOurs() || !el.tuner) return;
    // Stowed: this window is a placard at the moment, not the radio.
    if (pinnedBox) return;
    /* Settings has the window on loan. Sizing it to the radio now would
       shut the drawer's room out from under it, and the second pass would
       then remember the borrowed size as the listener's own. */
    if (borrowedBox) return;
    pass = pass || 0;

    var want = wantedBox();
    if (Math.abs(want.w - window.outerWidth) > 1 || Math.abs(want.h - window.outerHeight) > 1) {
      try { window.resizeTo(want.w, want.h); } catch (e) { return; }
    }

    /* One confirming pass rather than three. A resize does not land within
       a frame, so a height that follows from the new width can only be read
       afterwards; when nothing moved this costs a measurement and resizes
       nothing, which is the usual case now. */
    if (pass < 1) setTimeout(function () { fitWindow(pass + 1); }, 120);
    else rememberBox();
  }

  /* The window is sized once on opening and again on every theme change,
     and those want different things.

     Opening: a saved box is the size and the place the user left the
     window in, possibly one they chose by hand, so it is restored as it
     stands and nothing is fitted over the top of it.

     Opening for the first time, with no box to restore, is the only time
     the fit is seen. It waits for the webfonts before it measures. The
     radio is genuinely shorter in a fallback face -- around eighty pixels
     shorter, measured -- so fitting before they land sizes the window to a
     height it is about to grow out of, and the correction is a second
     resize in front of the user. A tenth of a second at the size the
     shortcut asked for, and then one move, is what this is buying.

     A theme change always fits: the height belongs to the theme, and the
     saved box belongs to the one being left behind. */
  var sizedOnce = false;
  /* True while the window stands at the box the user left it in. The
     preset measurement settles over the first second and asks for a fit on
     each pass, so without this the restored box would be quietly fitted
     away a few hundred milliseconds after being restored. A theme change
     clears it: the height then belongs to the new theme rather than to the
     window the old one was closed in. */
  var keepBox = false;
  /* Nothing resizes the window before the layout has settled once. */
  var mayFit = false;

  /* ---------- room for the drawer ----------
     The window is fitted to the radio face, which is a good deal shorter
     than Settings wants to be -- and a dialog cannot be taller than the
     window holding it, because the overflow is cut off rather than
     scrolled. On a 3840x2160 desktop the work area is generous and the
     ceiling never binds; the window does, at some 575 CSS pixels.

     So the window is borrowed: grown by just what the drawer needs and put
     back exactly as it was when the drawer closes.

     rememberBox runs on a timer as well as at the end of a fit, so it can
     and does see a borrowed window; it checks borrowedBox itself rather
     than relying on when it is called. */
  var borrowedBox = null;

  function growForDrawer(needInner) {
    if (!windowIsOurs()) return false;
    var frameH = window.outerHeight - window.innerHeight;
    if (needInner <= window.innerHeight) return false;

    var top0 = screen.availTop != null ? screen.availTop : 0;
    var room = screen.availHeight || window.outerHeight;
    var wantOuter = Math.min(needInner + frameH, room);
    if (wantOuter <= window.outerHeight + 1) return false;

    borrowedBox = { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight };
    // Grows downwards, and only climbs when the foot would leave the desk.
    var y = window.screenY;
    if (y + wantOuter > top0 + room) y = Math.max(top0, top0 + room - wantOuter);
    try {
      window.resizeTo(window.outerWidth, wantOuter);
      if (y !== window.screenY) window.moveTo(window.screenX, y);
    } catch (e) { borrowedBox = null; return false; }
    return true;
  }

  function giveBackWindow() {
    if (!borrowedBox) return;
    var b = borrowedBox;
    borrowedBox = null;
    try { window.resizeTo(b.w, b.h); window.moveTo(b.x, b.y); } catch (e) { /* nothing to do */ }
    /* A theme changed while the drawer was up asked for a fit and was
       turned away by the guard above, and the box just restored belongs to
       the theme being left behind. So ask again, now the window is our own
       -- fitWindow still declines if the listener sized it by hand. */
    setTimeout(fitWindow, 0);
  }

  function sizeWindow() {
    if (pinnedBox) return;
    if (sizedOnce) { keepBox = false; mayFit = true; fitWindow(); return; }
    sizedOnce = true;
    if (restoreBox()) {
      keepBox = true;
      mayFit = true;
      /* A restored box is left alone, which is right until it turns out
         not to hold the radio -- and it can be wrong in either direction.

         Too small was the case this already caught: the page overruns and
         the listener is looking at a scrollbar down the side of a cabinet.

         Too big was not caught at all, and is the worse of the two because
         nothing could ever undo it. The box is remembered on a timer
         whether or not the window was ever fitted, so a launch that did
         not get as far as fitting wrote its own wrong size down; the next
         launch restored it, kept it because the page fitted inside it, and
         wrote it down again. A window with a band of dead space above and
         below the radio, permanently, and no way back.

         The size is only restored on Windows in the first place, where the
         launcher takes the resize grip off the window -- so a box there is
         never a size the listener chose by hand, and one that does not
         describe the radio is simply wrong.

         Twice at most, on the same clocks the first fit uses: once the
         webfonts have landed, and once more for the case where they never
         arrive. */
      var checkFits = function () {
        if (borrowedBox || !keepBox || !windowIsOurs() || !el.tuner) return;
        var tooSmall = document.documentElement.scrollHeight > window.innerHeight + 1;
        var tooBig = window.outerHeight - wantedBox().h > BOX_SLACK;
        if (!tooSmall && !tooBig) return;
        keepBox = false;
        fitWindow();
      };
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { setTimeout(checkFits, 1300); });
      } else {
        setTimeout(checkFits, 1300);
      }
      setTimeout(checkFits, 2600);
      return;
    }

    /* Nothing touches the window until the layout has stopped changing
       under it. Three things move the height during the first second --
       the webfonts arriving, the preset names being measured against them,
       and the preset list snapping to whole rows -- and each one used to
       drag the window with it. Waiting for the fonts and then for the
       measurement to settle costs a second at the size the shortcut asked
       for, and buys a single resize instead of three.

       The failsafe fires regardless: a webfont that never resolves must
       not leave the window unfitted for ever. Both paths land on the same
       call, and the second one finds nothing to do. */
    var fitNow = function () { mayFit = true; fitWindow(); };
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { setTimeout(fitNow, 1300); });
    } else {
      setTimeout(fitNow, 1300);
    }
    setTimeout(fitNow, 2600);
  }

  /* What the readout was wearing before this call, so arriving on a theme
     can be told from staying on it. Null until the first look is applied,
     which is the boot: setName flaps there of its own accord, because the
     name is new to an empty readout. */
  var lookWas = null;

  /* The board turns where it can be watched, which is not behind the
     drawer. A theme is applied the moment Save is pressed, but the drawer
     stays up for the whole of the Saved plate -- SAVED_PLATE_MS -- and
     then takes another .19s to get out of the way. Flapping
     on the spot spent the entire turn hidden, and what the listener saw
     was a board that had already finished.

     So: wait for the dialog's own close event, then wait for the close to
     finish. `display` is transitioned with allow-discrete, so it flips to
     none at the end of that transition and not before -- which makes it
     the one honest answer to "has it gone yet". Capped in frames rather
     than trusted, because a board that never turns is a smaller fault
     than a loop that never ends. */
  function flapWhenClear() {
    var dlg = el.settings;
    var turn = function () { TunerUI.flapName(el.name); };
    if (!dlg || !dlg.open) { turn(); return; }
    dlg.addEventListener('close', function () {
      var frames = 0;
      var look = function () {
        if (getComputedStyle(dlg).display === 'none' || ++frames > 90) { turn(); return; }
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    }, { once: true });
  }

  function applyLook() {
    var from = lookWas;
    lookWas = state.theme;
    // Measured per look; see lampWidth.
    faderCell = null;
    document.documentElement.setAttribute('data-theme', state.theme);
    requestAnimationFrame(function () {
      // The meter is drawn differently by every theme, and setLevel works
      // that out once rather than each frame -- so tell it to look again.
      TunerUI.refreshMeter(el.tuner);
      // The chip's font and tracking belong to the theme that just landed.
      measureNext();
      var st = currentStation();
      if (!st) return;
      TunerUI.setNeedle(el.tuner, st.band);
      showName(st.name);
      /* Turning up on the departures board turns the board. setName will
         not do it -- the name has not changed, only the cabinet around it
         -- and a split-flap sign that arrives already settled is the one
         thing a split-flap sign should never do. Only on the way in: a
         save that leaves the theme where it was changes nothing here, and
         neither does going the other way. */
      if (state.theme === 'departures' && from && from !== 'departures') {
        flapWhenClear();
      }
    });
    // The lamps, if this face has them, are a different width now.
    requestAnimationFrame(function () {
      markFader(el.volume); markFader(el.bass); markFader(el.treble);
    });
    // After the theme has painted, so the new height is the one measured.
    requestAnimationFrame(function () { sizeWindow(); });
    measurePresetNames();
  }

  var refitTimer;
  window.addEventListener('resize', function () {
    clearTimeout(refitTimer);
    refitTimer = setTimeout(function () { TunerUI.fitName(el.name); }, 120);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { TunerUI.fitName(el.name); });


  /* ---------- always on top ----------
     A page cannot ask for its own window to stay above the others. The one
     window a browser will float is a picture-in-picture window, so that is
     what this opens, with a compact strip in it rather than a video.

     The radio's own window is not touched. It stays the radio, at its own
     size, wherever it was -- this is a second, small face for the set,
     not a rearrangement of the first one.

     Chrome and Edge have Document Picture-in-Picture, and Firefox has had
     it since 151. Safari has not, and no mobile browser has. Where it is
     missing the button is hidden outright rather than left to fail, which
     is the same bargain the meter strikes when a stream will not take the
     analysed path.

     The strip is sized from outside the browser on Windows, by
     strip-fit.ps1, which the Chrome and Edge launcher starts. Everywhere
     else -- Firefox, macOS, Linux -- the window opens at whatever size the
     browser chose and the first click on it brings it down; .dr-hint says
     so when that happens. */

  var PIN_W = 340, PIN_H = 88;

  var PIN_BARS = 12;
  /* In the order the click walks them. Bars first because it is the one
     that was here before, so an existing listener sees no change until
     they ask for one. */
  var VIZ = ['bars', 'needle', 'matrix', 'scope', 'sonar'];
  function vizName(v) { return VIZ.indexOf(v) === -1 ? VIZ[0] : v; }
  function nextViz(v) { return VIZ[(VIZ.indexOf(vizName(v)) + 1) % VIZ.length]; }

  var pipWin = null;
  var strip = null;
  var stripVolTimer;
  var stripTip = null;
  /* True from the press until the window arrives or is refused, so a
     second press in that gap does not ask for a second window. */
  var pinPending = false;

  function pinSupported() { return 'documentPictureInPicture' in window; }

  var STRIP_CSS = [
    ".dr-strip {",
    "  --dr-bg: #16171a;",
    "  --dr-ink: #f0efea;",
    "  --dr-accent: #c9552a;",
    "  /* Brighter than the play button on purpose. The same orange at 13px on a",
    "     dark track reads as a smudge, where at 30px it reads as a button. This is",
    "     the app's own --alert. */",
    "  --dr-hot: #ff8f2e;",
    "  /* The ink at half strength, as a colour rather than an opacity: the",
    "     knob is rendered inside the track, so an opacity there fades the",
    "     knob as well. Matches the name along the same row. */",
    "  --dr-rail: rgba(240, 239, 234, .5);",
    "  position: relative;",
    "  height: 100%;",
    "  /* Chrome may hand back a window taller than the one asked for, and the",
    "     watcher that corrects it is Windows only. So nothing is capped and",
    "     nothing is centred in the slack: the controls hug the top, the name",
    "     and the fader are pushed to the bottom, and a window left too tall",
    "     looks like a window left too tall rather than a strip adrift. */",
    "  display: flex;",
    "  flex-direction: column;",
    "  overflow: hidden;",
    "  background: var(--dr-bg);",
    "  color: var(--dr-ink);",
    "  font-family: \"Archivo\", \"Helvetica Neue\", Arial, sans-serif;",
    "  user-select: none;",
    "}",
    ".dr-strip, .dr-strip * { box-sizing: border-box; }",
    "@media (prefers-color-scheme: light) {",
    "  .dr-strip { --dr-bg: #f4f2ec; --dr-ink: #1b1b19; --dr-rail: rgba(27, 27, 25, .5); --dr-viz: var(--dr-ink); }",
    "}",
    ".dr-top {",
    "  display: grid;",
    "  grid-template-columns: auto minmax(0, 1fr) auto;",
    "  align-items: center;",
    "  gap: 9px;",
    "  flex: 0 0 auto;",
    "  /* Room at the right for the corner button, which is out of the flow. */",
    "  padding: 18px 28px 3px 9px;",
    "}",
    ".dr-play {",
    "  width: 30px; height: 30px; padding: 0;",
    "  border: 0; border-radius: 50%;",
    "  background: var(--dr-accent); color: #fff;",
    "  display: grid; place-items: center; cursor: pointer;",
    "}",
    ".dr-play svg { width: 12px; height: 12px; fill: currentColor; }",
    ".dr-play .dr-pause { display: none; }",
    ".dr-play[aria-pressed=\"true\"] .dr-pause { display: block; }",
    ".dr-play[aria-pressed=\"true\"] .dr-go { display: none; }",
    ".dr-who { min-width: 0; }",
    ".dr-station {",
    "  font-family: \"Barlow Condensed\", \"Archivo\", sans-serif;",
    "  font-weight: 700; font-size: 16px; line-height: 1.05;",
    "  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;",
    "}",
    ".dr-now {",
    "  margin-top: 1px; font-size: 9.5px; opacity: .6;",
    "  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;",
    "}",
    "/* The countdown, which comes and goes on its own while the transport",
    "   text beside it stays put. Emptied only after the fade has run, so it",
    "   goes out rather than vanishing. */",
    ".dr-note { opacity: 0; transition: opacity .22s ease; }",
    ".dr-strip.is-noting .dr-note { opacity: 1; }",
    ".dr-note:not(:empty)::before { content: \"\\00a0\\00b7\\00a0\"; }",
    "/* One number per frame, whichever of the four is showing: --dr-vu is the",
    "   level, written on the button that holds them all, and every child reads",
    "   it by inheritance. The same bargain .tuner strikes with its own --vu, and",
    "   the reason this is a second document's worth of paint and not more.",
    "",
    "   46x20 for all four -- the width the twelve bars already came to -- so",
    "   nothing in the row moves when one is swapped for another. */",
    ".dr-viz {",
    "  appearance: none; border: 0; background: none; padding: 0; color: inherit;",
    "  cursor: pointer; position: relative; flex: none;",
    "  width: 46px; height: 26px; margin-right: 10px; --dr-vu: 0; --dr-thump: 0;",
    "  /* One colour for all five, white on the dark face. Every visualisation",
    "     draws in currentColor, so this is the only place it is decided; the",
    "     light face swaps it for the ink, where white would vanish. */",
    "  color: var(--dr-viz, #fff);",
    "}",
    ".dr-viz > * { position: absolute; inset: 0; display: none; }",
    ".dr-viz[data-viz=\"bars\"] .dr-meter,",
    ".dr-viz[data-viz=\"needle\"] .dr-needle,",
    ".dr-viz[data-viz=\"matrix\"] .dr-matrix,",
    ".dr-viz[data-viz=\"scope\"] .dr-scope,",
    ".dr-viz[data-viz=\"sonar\"] .dr-sonar { display: flex; }",
    ".dr-viz:focus-visible { outline: 2px solid var(--dr-hot); outline-offset: 2px; border-radius: 3px; }",
    ".dr-viz svg { width: 100%; height: 100%; overflow: visible; }",
    "",
    "/* All five are the strip's own ink, near enough white on the dark face.",
    "   Orange is kept for the two places it means something: the top of the",
    "   needle's travel, and the cap at the middle of the speaker. */",
    "",
    "/* Bars. The shares are deliberately uneven -- a smooth arch scaled by one",
    "   number reads as a single object breathing in and out -- and so are the",
    "   transition times, for the same reason a beat later: twelve bars that",
    "   settle in exactly the same time are one bar drawn twelve times. */",
    ".dr-meter { align-items: flex-end; gap: 2px; }",
    ".dr-meter i {",
    "  width: 2px; border-radius: 1px; background: currentColor; opacity: .55;",
    "  height: calc(2px + var(--dr-vu, 0) * var(--dr-w, 1) * 24px);",
    "  transition: height .05s linear;",
    "}",
    ".dr-meter i:nth-child(3n) { transition-duration: .085s; }",
    ".dr-meter i:nth-child(3n+1) { transition-duration: .035s; }",
    ".dr-strip.is-live .dr-meter i { opacity: 1; }",
    "",
    "/* Needle. Drawn, so it can carry a scale without four more elements;",
    "   everything but the pointer is static. The transition is there because",
    "   this is handed the raw level rather than the ballistic one -- see",
    "   paintStripLevel -- and a needle that snaps between readings reads as",
    "   broken where a bar does not. Short, so it still flicks. */",
    ".dr-needle { opacity: .8; }",
    ".dr-needle path, .dr-needle line { fill: none; stroke: currentColor; }",
    ".dr-arc { stroke-width: 1; opacity: .55; }",
    ".dr-arc-hot { stroke-width: 1.8; stroke: currentColor; opacity: .95; }",
    ".dr-ticks path { stroke-width: 1; opacity: .7; }",
    ".dr-pointer {",
    "  stroke-width: 1.7; stroke-linecap: round;",
    "  transform-box: view-box; transform-origin: 23px 24px;",
    "  transform: rotate(calc((var(--dr-vu, 0) - .5) * 110deg));",
    "  transition: transform .05s linear;",
    "}",
    ".dr-pivot { fill: currentColor; stroke: none; opacity: .85; }",
    ".dr-strip.is-live .dr-needle { opacity: 1; }",
    "",
    "/* Matrix. clamp() is doing the work of an if: the inner term goes negative",
    "   below the dot's threshold and past 1 above it, multiplied up so the",
    "   crossing is a step rather than a ramp. Unlit dots stay faintly on, or it",
    "   is not a grid, it is a few lights in the dark. */",
    ".dr-viz[data-viz=\"matrix\"] .dr-matrix { display: grid; }",
    ".dr-matrix { grid-template-columns: repeat(6, 1fr); gap: 2px; }",
    ".dr-matrix i {",
    "  width: 3px; height: 3px; border-radius: 50%; background: currentColor;",
    "  align-self: center; justify-self: center;",
    "  opacity: calc(.18 + .82 * clamp(0, (var(--dr-vu, 0) * var(--dr-w, 1) - var(--dr-row, 0)) * 60, 1));",
    "}",
    "",
    "/* Scope. The only one that is not a function of --dr-vu: its points are",
    "   written from the samples themselves, off an analyser at the far end of",
    "   the graph, so it answers the volume and the tone controls. Silence is a",
    "   flat line because silence is a flat line. */",
    ".dr-trace {",
    "  fill: none; stroke: currentColor; stroke-width: 1.3;",
    "  stroke-linejoin: round; stroke-linecap: round;",
    "  vector-effect: non-scaling-stroke; opacity: .75;",
    "}",
    ".dr-strip.is-live .dr-trace { opacity: 1; }",
    "",
    "/* Sonar, which is the Tivoli face's loudspeaker at an eighth the size. The",
    "   cone swells, the cap swells harder, and the rings' REACH is the level",
    "   rather than their rate: quiet programme moves the middle only, and it",
    "   takes something loud to run a wave out to the surround. Reading the",
    "   custom property inside the keyframe's own calc() is Tivoli's trick and",
    "   the reason the rings need no work per frame. */",
    ".dr-sonar { align-items: center; justify-content: center; }",
    "/* The dot the rings leave from. It was the bright point of a gradient",
    "   across a cone, placed at 42%/36% -- which is where a highlight goes on",
    "   a curved surface, and is not the middle. A circle knows where its own",
    "   middle is. */",
    "/* The woofer: full at the middle and fading out towards its edge, and",
    "   pushed out on each beat by --dr-thump. No transition -- the envelope",
    "   that drives it already has its own attack and decay, and a transition",
    "   on top would round the attack off, which is the whole of a thump. */",
    ".dr-sonar b {",
    "  position: absolute; left: 50%; top: 50%; width: 6px; height: 6px;",
    "  margin: -3px 0 0 -3px; border-radius: 50%;",
    "  background: radial-gradient(circle, currentColor 0 28%,",
    "    color-mix(in srgb, currentColor 55%, transparent) 62%,",
    "    color-mix(in srgb, currentColor 22%, transparent) 100%);",
    "  opacity: .75;",
    "  transform: scale(calc(1 + var(--dr-vu, 0) * .2 + var(--dr-thump, 0) * .8));",
    "}",
    ".dr-strip.is-live .dr-sonar b { opacity: 1; }",
    ".dr-sonar i {",
    "  position: absolute; left: 50%; top: 50%; width: 22px; height: 22px;",
    "  margin: -11px 0 0 -11px; border-radius: 50%;",
    "  border: 1.5px solid currentColor;",
    "  opacity: 0; animation: dr-ping 1.45s linear infinite;",
    "}",
    ".dr-sonar i:nth-child(2) { animation-delay: .48s; }",
    ".dr-sonar i:nth-child(3) { animation-delay: .97s; }",
    "@keyframes dr-ping {",
    "  0%   { transform: scale(.18); opacity: 0; }",
    "  14%  { opacity: calc(.35 + var(--dr-vu, 0) * .65); }",
    "  70%  { opacity: calc(.18 + var(--dr-vu, 0) * .55); }",
    "  100% { transform: scale(calc(.4 + var(--dr-vu, 0) * 1.35)); opacity: 0; }",
    "}",
    "@media (prefers-reduced-motion: reduce) {",
    "  .dr-sonar i { animation: none; opacity: .3; transform: scale(.7); }",
    "  .dr-sonar b, .dr-pointer, .dr-meter i { transition: none; }",
    "}",
    "/* Shown only while the window is bigger than it should be, in the band",
    "   the extra height leaves between the controls and the foot. Takes no",
    "   clicks: the strip underneath stays live, and the click that dismisses",
    "   this is the same click that resizes the window. */",
    "/* Top left, and not centred: this is only ever drawn when Chrome has",
    "   ignored the size asked for, and the window it hands back in that case",
    "   lands at the bottom right, mostly off the screen. The middle of it is",
    "   off the screen as well. The top left corner is the part still showing,",
    "   so it is the only place this can be read.",
    "",
    "   On a plate, because it is sitting over the strip's own controls",
    "   stretched across a window twelve times too wide, and it has to read as",
    "   the thing to deal with first.",
    "",
    "   pointer-events: none on purpose. The click target is the whole window",
    "   -- every FIT_ON event on either document calls fitPip -- so this must",
    "   not become the only thing that works, nor swallow a click aimed past",
    "   it. It says click here and it means click anywhere; here is simply",
    "   where the pointer already is. */",
    ".dr-hint {",
    "  position: absolute; top: 10px; left: 8px; max-width: calc(100% - 18px);",
    "  display: none; align-items: center; gap: 7px;",
    "  padding: 10px 15px; border-radius: 9px;",
    "  pointer-events: none;",
    "  font-size: 13.5px; font-weight: 600; letter-spacing: .01em; line-height: 1.25;",
    "  color: var(--dr-hot);",
    "  background: color-mix(in srgb, var(--dr-bg) 88%, transparent);",
    "  border: 1px solid color-mix(in srgb, var(--dr-hot) 45%, transparent);",
    "  box-shadow: 0 6px 20px rgba(0, 0, 0, .45);",
    "}",
    ".dr-strip.is-roomy .dr-hint { display: flex; }",
    "/* Out of the row and into the corner, where a window's own controls live. */",
    ".dr-unpin {",
    "  position: absolute; top: 3px; right: 3px;",
    "  width: 22px; height: 22px; padding: 0;",
    "  border: 0; background: none; cursor: pointer;",
    "  /* The knob's orange, not the strip's ink: the two things here that",
    "     are not the play button should read as the same kind of thing. */",
    "  color: var(--dr-hot); opacity: .75;",
    "  display: grid; place-items: center;",
    "}",
    ".dr-unpin:hover { opacity: 1; }",
    ".dr-unpin svg { width: 13px; height: 13px; }",
    ".dr-foot {",
    "  display: grid;",
    "  grid-template-columns: auto auto minmax(0, 1fr);",
    "  align-items: center;",
    "  gap: 7px;",
    "  /* The space, whatever there is of it, goes above this. */",
    "  margin-top: auto;",
    "  padding: 0 9px 7px;",
    "  font-size: 8.5px;",
    "}",
    ".dr-name { letter-spacing: .1em; text-transform: uppercase; opacity: .5; white-space: nowrap; }",
    "/* Reads as one line with the name -- 'DESKSIDE RADIO MINI - 23:41' -- so",
    "   the fader gets the whole of the rest of the row. */",
    ".dr-clock::before { content: \"\\00b7\"; margin-right: 7px; font-weight: 700; opacity: .7; }",
    ".dr-vol {",
    "  -webkit-appearance: none; appearance: none;",
    "  /* Tall enough to hold the knob; the rail is the track below. */",
    "  width: 100%; height: 12px;",
    "  /* Nothing painted here. Chrome draws the track pseudo-element over",
    "     the input's own background, so a colour set on this rule is a",
    "     colour nobody sees -- four attempts at it changed nothing. */",
    "  background: none;",
    "}",
    "/* The rail: the ink at half strength, matching the name along the same",
    "   row. It took four goes to get a colour onto it, so both reasons are",
    "   written down.",
    "",
    "   One: the colour has to go here rather than on the input, and this",
    "   rule needs appearance:none of its own, or Chrome paints its default",
    "   track over whatever is set.",
    "",
    "   Two: it has to be a colour and not an opacity. The knob is rendered",
    "   inside the track, so an opacity here fades the knob along with the",
    "   rail -- which is exactly what it did. */",
    ".dr-vol::-webkit-slider-runnable-track {",
    "  /* Without this Chrome paints its own track over the background set",
    "     here, which is what made every colour tried on this rule invisible. */",
    "  -webkit-appearance: none; appearance: none;",
    "  height: 3px; border-radius: 2px;",
    "  background: var(--dr-rail);",
    "}",
    ".dr-vol::-webkit-slider-thumb {",
    "  -webkit-appearance: none; appearance: none;",
    "  width: 12px; height: 12px; border-radius: 50%;",
    "  background: var(--dr-hot);",
    "  /* Sat on a 3px rail from a 12px knob. */",
    "  margin-top: -4.5px;",
    "  /* A ring of the strip's own background, so the knob keeps its edge wherever",
    "     along the track it sits. */",
    "  box-shadow: 0 0 0 2px var(--dr-bg);",
    "}",
    "/* And the same two parts under the names Firefox gives them, which has",
    "   had one of these windows since 151. Written as their own rules rather",
    "   than added to the selector lists above: a list containing a",
    "   pseudo-element the engine does not know is dropped whole, which would",
    "   take the working half down with the unknown one.",
    "",
    "   No margin-top here. Firefox centres its thumb on the track already. */",
    ".dr-vol::-moz-range-track {",
    "  height: 3px; border-radius: 2px; border: 0;",
    "  background: var(--dr-rail);",
    "}",
    ".dr-vol::-moz-range-thumb {",
    "  width: 12px; height: 12px; border-radius: 50%; border: 0;",
    "  background: var(--dr-hot);",
    "  box-shadow: 0 0 0 2px var(--dr-bg);",
    "}",
    ".dr-clock { font-family: \"IBM Plex Mono\", monospace; font-size: 9.5px; letter-spacing: .02em; opacity: .5; }",
    "/* The floating document's own page rules. There is no body.app in there to",
    "   carry them, and this sheet is written in rather than linked: a file:// sheet",
    "   is not reliably fetched by a document whose own URL is about:blank. */",
    "/* The strip's tooltips. The same neutral plate the radio wears, spelled",
    "   out here because this document never sees app.css. */",
    ".tip {",
    "  position: fixed; inset: auto; margin: 0; overflow: visible;",
    "  width: max-content; max-width: 220px; padding: 6px 9px;",
    "  border: 1px solid #d6d2c9; border-radius: 6px;",
    "  background: #ffffff; color: #1d1d1b;",
    "  box-shadow: 0 10px 24px -12px rgba(0,0,0,.5);",
    "  font: 11.5px/1.3 \"Archivo\", \"Helvetica Neue\", Arial, sans-serif;",
    "  pointer-events: none; opacity: 0;",
    "  transition: opacity .12s ease, overlay .12s allow-discrete, display .12s allow-discrete;",
    "}",
    ".tip:popover-open { opacity: 1; }",
    "@starting-style { .tip:popover-open { opacity: 0; } }",
    "@media (prefers-reduced-motion: reduce) { .tip { transition: none; } }",
    ".tip::after {",
    "  content: \"\"; position: absolute; width: 8px; height: 8px;",
    "  background: inherit; border: 1px solid #d6d2c9; transform: rotate(45deg);",
    "}",
    ".tip[data-side=\"top\"]::after    { bottom: -4px; left: var(--tip-ax, 50%); margin-left: -4px; border-top: 0; border-left: 0; }",
    ".tip[data-side=\"bottom\"]::after { top: -4px;    left: var(--tip-ax, 50%); margin-left: -4px; border-bottom: 0; border-right: 0; }",
    ".tip[data-side=\"left\"]::after   { right: -4px;  top: var(--tip-ay, 50%);  margin-top: -4px;  border-left: 0; border-bottom: 0; }",
    ".tip[data-side=\"right\"]::after  { left: -4px;   top: var(--tip-ay, 50%);  margin-top: -4px;  border-right: 0; border-top: 0; }",
    "html.dr-pip, body.dr-pip { margin: 0; height: 100%; overflow: hidden; background: #16171a; }",
    "@media (prefers-color-scheme: light) {",
    "  html.dr-pip, body.dr-pip { background: #f4f2ec; }",
    "}"
  ].join('\n');

  var STRIP_HTML =
    '<div class="dr-top">' +
      '<button type="button" class="dr-play" aria-pressed="false" aria-label="Play">' +
        '<svg class="dr-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>' +
        '<svg class="dr-pause" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>' +
      '</button>' +
      '<div class="dr-who">' +
        '<div class="dr-station"></div>' +
        '<div class="dr-now"><span class="dr-status"></span><span class="dr-note"></span></div>' +
      '</div>' +
      '<button type="button" class="dr-viz" data-viz="bars"' +
        ' aria-label="Change the visualisation" data-tip="Change the visualisation">' +
        '<span class="dr-meter" aria-hidden="true"></span>' +
        /* The needle is drawn rather than built from borders: an arc, a scale,
           a hot stretch at the top of the travel and a pivot, all of it static,
           with one line that turns. */
        '<span class="dr-needle" aria-hidden="true">' +
          '<svg viewBox="0 0 46 26">' +
            /* A 110-degree scale on a 20-unit radius, struck about the pivot at
               23,24. The hot stretch is the last 25 degrees of it. */
            '<path class="dr-arc" d="M6.6 12.5 A20 20 0 0 1 39.4 12.5"/>' +
            '<path class="dr-arc-hot" d="M33 6.7 A20 20 0 0 1 39.4 12.5"/>' +
            '<g class="dr-ticks">' +
              '<path d="M9.1 14.3 L6.6 12.5"/><path d="M15.2 8.9 L13.8 6.3"/>' +
              '<path d="M23 7 L23 4"/><path d="M30.8 8.9 L32.2 6.3"/>' +
              '<path d="M36.9 14.3 L39.4 12.5"/>' +
            '</g>' +
            '<line class="dr-pointer" x1="23" y1="24" x2="23" y2="6"/>' +
            '<circle class="dr-pivot" cx="23" cy="24" r="1.8"/>' +
          '</svg>' +
        '</span>' +
        '<span class="dr-matrix" aria-hidden="true"></span>' +
        /* The trace carries no shape of its own. Its points are written from
           the samples each frame, so silence is a flat line because silence
           is a flat line. */
        '<span class="dr-scope" aria-hidden="true">' +
          '<svg viewBox="0 0 46 26" preserveAspectRatio="none">' +
            '<polyline class="dr-trace" points="0,13 46,13"/>' +
          '</svg>' +
        '</span>' +
        '<span class="dr-sonar" aria-hidden="true">' +
          '<i></i><i></i><i></i><b></b>' +
        '</span>' +
      '</button>' +
    '</div>' +
    '<button type="button" class="dr-unpin" aria-label="Expand to main radio" data-tip="Expand to main radio">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>' +
      '</svg>' +
    '</button>' +
    '<div class="dr-foot">' +
      /* The one place the window can be named. The bar along the top is
         the browser's and shows the page's origin; a page is not allowed
         to write there, which is the whole point of it. */
      '<span class="dr-name">Deskside Radio Mini</span>' +
      '<time class="dr-clock">--:--</time>' +
      '<input type="range" class="dr-vol" min="0" max="100" step="any" aria-label="Volume">' +
    '</div>' +
    '<div class="dr-hint">Click here to show Deskside Radio Mini</div>';

  function buildStrip(doc) {
    var s = doc.createElement('style');
    s.textContent = STRIP_CSS;
    doc.head.appendChild(s);

    var root = doc.createElement('div');
    root.className = 'dr-strip';
    root.innerHTML = STRIP_HTML;

    var meter = root.querySelector('.dr-meter');
    for (var i = 0; i < PIN_BARS; i++) {
      var bar = doc.createElement('i');
      /* An arch, roughed up. The sine keeps the ends shorter than the
         middle, which is what a meter looks like; the second term breaks
         the symmetry so it does not read as one object breathing. Fixed
         rather than random, so it is the same meter every time. */
      var arch = 0.40 + 0.60 * Math.sin((i + 1) / (PIN_BARS + 1) * Math.PI);
      var w = arch * (0.72 + 0.28 * Math.abs(Math.sin(i * 2.399963)));
      bar.style.setProperty('--dr-w', w.toFixed(3));
      meter.appendChild(bar);
    }

    /* The matrix, on the same arch across six columns rather than twelve.
       Its rows carry a threshold instead of a height: the dot lights when the
       level times its column's share passes that. Written top row first,
       because that is the order a grid fills, so the thresholds count down. */
    var matrix = root.querySelector('.dr-matrix');
    var COLS = 6, ROWS = 4;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var dot = doc.createElement('i');
        var march = 0.40 + 0.60 * Math.sin((c + 1) / (COLS + 1) * Math.PI);
        var mw = march * (0.72 + 0.28 * Math.abs(Math.sin(c * 2.399963)));
        dot.style.setProperty('--dr-w', mw.toFixed(3));
        /* The bottom row lights on any signal at all; the top only when the
           column is close to full. */
        dot.style.setProperty('--dr-row', (((ROWS - 1 - r) / ROWS) + 0.02).toFixed(3));
        matrix.appendChild(dot);
      }
    }

    var o = {
      doc: doc, root: root, meter: meter,
      viz: root.querySelector('.dr-viz'),
      station: root.querySelector('.dr-station'),
      now: root.querySelector('.dr-status'),
      note: root.querySelector('.dr-note'),
      play: root.querySelector('.dr-play'),
      vol: root.querySelector('.dr-vol'),
      clock: root.querySelector('.dr-clock')
    };

    /* The chosen one, and the click that moves to the next. Saved rather
       than kept in the strip, which is torn down at every unpin. */
    o.viz.setAttribute('data-viz', vizName(state.miniViz));
    o.viz.addEventListener('click', function () {
      state.miniViz = nextViz(state.miniViz);
      save();
      o.viz.setAttribute('data-viz', state.miniViz);
    });

    o.play.addEventListener('click', function () {
      if (state.intendedPlaying) stopPlayback();
      else { el.overlay.hidden = true; startPlayback(); }
    });

    /* The same bargain the radio's own fader strikes: the sound follows the
       slider, the write to storage waits for it to settle. */
    o.vol.addEventListener('input', function () {
      setVolume(+o.vol.value, true);
      clearTimeout(stripVolTimer);
      stripVolTimer = setTimeout(save, 250);
    });

    /* Back to the middle. A fader this short is easy to knock, and there is
       no numeric readout beside it to put right by eye. 50 because that is
       what a fresh install starts at -- read from DEFAULTS rather than
       written again here, so the two cannot drift apart. */
    o.vol.addEventListener('dblclick', function () {
      clearTimeout(stripVolTimer);
      slideVolumeTo(DEFAULTS.volume);
    });

    root.querySelector('.dr-unpin').addEventListener('click', function () { unpin(true); });
    return o;
  }

  /* Back to the middle, walked rather than jumped.

     A range input has nothing to transition: its knob is drawn from the
     value, and setting the value moves it at once. So the value itself is
     eased, on the floating window's clock -- the radio's window is behind
     it and occluded, and Chrome throttles the timers of a window it cannot
     see, which is what made the placard lag when it followed on this
     window's own.

     The value is written straight to the input as well as through
     setVolume: the double-click has focused it, and paintStripFade will not
     touch a fader that has focus. */
  var volAnim = null, volAnimWin = null;

  function slideVolumeTo(target) {
    if (!strip) return;
    if (volAnim && volAnimWin) { volAnimWin.cancelAnimationFrame(volAnim); }
    volAnim = null;
    volAnimWin = (pipWin && !pipWin.closed) ? pipWin : window;

    var from = state.volume;
    if (from === target) { setVolume(target, false); return; }

    var t0 = 0, MS = 190;
    var step = function (ts) {
      if (!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / MS);
      // Away quickly, settling in: the ease of a control being let go of.
      var e = 1 - Math.pow(1 - k, 3);
      var v = Math.round(from + (target - from) * e);
      setVolume(v, true);
      if (strip) strip.vol.value = v;
      if (k < 1) { volAnim = volAnimWin.requestAnimationFrame(step); return; }
      volAnim = null;
      setVolume(target, false);
      if (strip) strip.vol.value = target;
    };
    volAnim = volAnimWin.requestAnimationFrame(step);
  }

  function paintStrip() {
    if (!strip) return;
    var st = currentStation();
    var nm = st ? st.name : '';
    var playing = !!state.intendedPlaying;
    if (strip.station.textContent !== nm) strip.station.textContent = nm;
    if (strip.now.textContent !== statusText) strip.now.textContent = statusText;
    strip.play.setAttribute('aria-pressed', playing ? 'true' : 'false');
    strip.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    strip.root.classList.toggle('is-live', status === 'live');
    paintStripFade();
    paintStripNote();
    // Kept in step with the radio's, since the station can change under it.
    if (pipWin && !pipWin.closed) pipWin.document.title = document.title;
  }

  /* The setting times the handover fade, which is what the radio's own
     fader shows -- see paintFade. Reading only the setting meant the sound
     dipped through a slot change while the knob stayed where it was.

     Never onto the one being dragged: writing the value back would stamp
     over the listener's thumb an event at a time. */
  function paintStripFade() {
    if (!strip || strip.doc.activeElement === strip.vol) return;
    // Unrounded, for the same reason as paintFade: see the note there.
    var shown = Math.max(0, Math.min(100, state.volume * fadeMul));
    if (+strip.vol.value !== shown) strip.vol.value = shown;
  }

  /* What the schedule is about to do, for the last half-minute before it
     does it. Set by updateHandover, which is the one place that knows. */
  var stripNote = '';

  function setStripNote(text) {
    if (text === stripNote) return;
    stripNote = text;
    paintStripNote();
  }

  function paintStripNote() {
    if (!strip) return;
    if (stripNote) {
      strip.note.textContent = stripNote;
      strip.root.classList.add('is-noting');
      return;
    }
    strip.root.classList.remove('is-noting');
    /* The words stay until the fade has finished with them. On the floating
       window's clock: the radio's is behind it and throttled. */
    var w = (pipWin && !pipWin.closed) ? pipWin : window;
    w.setTimeout(function () {
      if (!stripNote && strip) strip.note.textContent = '';
    }, 260);
  }

  function paintStripClock(hhmm) {
    if (strip && strip.clock.textContent !== hhmm) strip.clock.textContent = hhmm;
  }

  /* The raw level, not the needle's. The needle is damped on purpose -- a
     VU movement is meant to be read, not watched -- but twelve bars two
     pixels wide have no such duty, and following the ballistics made them
     look stuck. The curve is there because ordinary programme material
     sits low on a VU scale, and a meter that never leaves the bottom third
     of its travel is not telling anybody anything. */
  function paintStripLevel(v) {
    if (!strip) return;
    /* Down from 0.6, then 0.42, then 0.52, and now up to 0.8. The first was
       too low in the travel and the rest were too high -- everything pinned
       near the top with nowhere left to go, which is not liveliness, it is a
       meter that has run out of room. Above 0.5 the curve is gentler than
       square root, so peaks still reach the top and ordinary programme sits
       where it can be seen to move. Does not touch the tuner's own needle. */
    var shown = Math.pow(Math.max(0, Math.min(1, v)), 0.8);
    /* On the button, not the bars: all four read it from there by
       inheritance, so changing visualisation changes nothing about what
       this does or how often. */
    strip.viz.style.setProperty('--dr-vu', shown.toFixed(3));
  }

  /* The scope, and only when it is the one showing. Everything else in here
     costs one custom property a frame between them; this costs a string of
     two dozen numbers, which is worth it for the one visualisation that is
     the signal rather than a picture of its loudness.

     No analyser, or not playing, and it is left flat -- which is also what
     silence draws, so there is nothing to special-case. */
  /* The woofer's beat. Below about 150 Hz is where a kick lives, and the
     beat is that band jumping clear of its own recent average -- so a loud
     sustained passage does not hold the cone out, and a quiet track with a
     real kick still thumps. */
  var THUMP_HZ = 150;
  var thumpAvg = 0, thumpEnv = 0, thumpLast = 0, thumpBins = null;

  function paintStripThump(ts) {
    if (!strip || !strip.viz || strip.viz.getAttribute('data-viz') !== 'sonar') return;
    var dt = thumpLast ? Math.min(100, ts - thumpLast) : 16;
    thumpLast = ts;

    var e = 0;
    if (analyser && ctx && freqData) {
      /* The one transform this costs, and only while the speaker is showing. */
      analyser.getByteFrequencyData(freqData);
      var top = Math.max(2, Math.ceil(THUMP_HZ / (ctx.sampleRate / analyser.fftSize)));
      /* From bin 1: bin 0 is DC, which is not a beat. */
      for (var i = 1; i < top; i++) e += freqData[i];
      e = e / ((top - 1) * 255);
    }

    /* The running average, about 400ms. */
    thumpAvg += (e - thumpAvg) * (1 - Math.exp(-dt / 400));
    /* A beat is the band clearing its average by a margin. */
    var kick = Math.max(0, Math.min(1, (e - thumpAvg * 1.12) * 5));
    /* Instant attack, 130ms decay: roughly a real cone coming back. */
    thumpEnv = kick > thumpEnv ? kick : thumpEnv * Math.exp(-dt / 130);
    strip.viz.style.setProperty('--dr-thump', thumpEnv.toFixed(3));
  }

  var SCOPE_PTS = 30;
  /* How much of the buffer the box shows, in samples. About 7ms at 44.1k,
     which is a few cycles of the low mids -- enough to read as a wave.
     The whole 1024 was 23ms, and drawing that across 46 pixels aliased
     everything above a few hundred hertz into noise that changed
     completely every frame. */
  var SCOPE_SPAN = 320;
  /* Where each point was last frame. The trace moves instead of
     teleporting, which is most of what made it look frantic. One array,
     kept between frames, nothing allocated per frame. */
  var scopePrev = null;

  /* How loud this buffer is, not whether anything is in it.

     The difference cost four rounds. Asking 'is anything here' with a floor
     of 0.0004 -- around -68 dBFS, below the noise on a quiet line -- meant a
     buffer carrying nothing but residue answered yes, won the choice, and
     shut out the one with the programme in it. The trace was drawn from real
     samples the whole time and every one of them was inaudibly small.

     Sixty-four samples is plenty to compare two buffers, and cheap enough to
     ask every frame. */
  function peakOfBuf(buf) {
    if (!buf) return 0;
    var step = Math.max(1, Math.floor(buf.length / 64));
    var hi = 0;
    for (var i = 0; i < buf.length; i += step) {
      var a = buf[i] < 0 ? -buf[i] : buf[i];
      if (a > hi) hi = a;
    }
    return hi;
  }

  function paintStripScope() {
    if (!strip || !strip.viz) return;
    /* The attribute, not the setting. They are written from each other and
       should never differ -- and they are two things, so proving they do not
       differ costs more than reading the one that actually drives the
       display. */
    if (strip.viz.getAttribute('data-viz') !== 'scope') return;
    /* Looked up now rather than kept from build time. A handle captured once
       is a handle that can have been null once. */
    var trace = strip.root.querySelector('.dr-trace');
    if (!trace) return;

    /* The far tap first -- it sits after the tone and the fader, so its trace
       answers both, which is what a scope on the speaker leads would show.

       And the meter's own analyser behind it, because the far tap has not
       been made to work and I would rather draw the right shape from the
       wrong end of the graph than draw a flat line. That one is demonstrably
       live: every other visualisation in this strip moves off it. The cost of
       the fallback is that the trace stops answering the volume control. */
    var buf = null;
    if (scopeAn && scopeData) {
      scopeAn.getFloatTimeDomainData(scopeData);
      /* A real floor, about -46 dBFS. Below this there is nothing to draw
         whatever the samples technically say. */
      if (peakOfBuf(scopeData) > 0.005) buf = scopeData;
    }
    /* And the meter's own buffer behind it, taken when it is the louder of
       the two -- which also covers the far tap being silent. The cost of
       falling back is that the trace stops answering the volume control,
       since this one is tapped before it. */
    if (peakOfBuf(timeData) > peakOfBuf(buf)) buf = timeData;

    /* Nothing in either buffer draws a square wave, which no signal makes
       and silence certainly does not. It is there to tell one failure from
       another: a flat line now means this function never wrote, where a
       square wave means it wrote and had nothing to write. Drawn flat, the
       two were indistinguishable, and four rounds of looking at a flat line
       told us nothing at all. */
    if (!scopePrev || scopePrev.length !== SCOPE_PTS) {
      scopePrev = new Float32Array(SCOPE_PTS);
    }

    /* The tail of the buffer, not the head: getFloatTimeDomainData hands back
       the last fftSize samples, so the front of it is 23ms stale. */
    var span = buf ? Math.min(SCOPE_SPAN, buf.length) : 0;
    var base = buf ? buf.length - span : 0;

    var pts = [];
    for (var i = 0; i < SCOPE_PTS; i++) {
      var x = (i / (SCOPE_PTS - 1)) * 46;
      var v = buf ? buf[base + Math.floor(i / (SCOPE_PTS - 1) * (span - 1))]
                  : ((i % 8) < 4 ? 0.42 : -0.42);
      /* 13 is the middle of the 26-unit box and 11 keeps a full-scale
         excursion just inside it. */
      /* Broadcast programme rarely peaks near full scale, so it is lifted
         before the clamp -- which then keeps the overdriven case inside the
         box rather than letting it draw outside. */
      var lift = Math.max(-1, Math.min(1, (v || 0) * 2.4));
      /* Where it was, mostly, plus where it is. Enough memory to carry the
         movement across frames and not so much that it lags the music. */
      scopePrev[i] = scopePrev[i] * 0.55 + lift * 0.45;
      /* 13 is the middle of the 26-unit box; 12 of the 13 either side is as
         near the edges as a rounded stroke can go without clipping. */
      var y = 13 - scopePrev[i] * 12;
      pts.push(x.toFixed(1) + ',' + y.toFixed(1));
    }
    trace.setAttribute('points', pts.join(' '));
  }

  /* Chrome will not open the floating window at the size asked for --
     measured on a profile with nothing remembered, 440x150, 440x240 and
     600x400 all came back 1119x700, which is the opener's own viewport.
     resizeTo does work on one of these windows, but wants a live user
     activation, and requestWindow spends the one that opened it.

     So the size is taken on the next gesture. The listeners go on before
     the request, not after: the click that follows the opening pointerdown
     is the first activation going spare, and waiting for the promise to
     resolve first was a race with it. They stay on until the resize lands,
     so any later press in either window finishes the job.

     resizeTo sets the outer size, and this window carries an origin bar the
     radio's does not, so the frame is measured rather than assumed. */
  /* Four, not one. requestWindow spends the activation that opened the
     window, and the promise usually resolves after the click has already
     been and gone -- so the same press is watched at every moment it can
     still be worth something, and whichever lands after the window exists
     is the one that pays. */
  var FIT_ON = ['pointerdown', 'pointerup', 'mouseup', 'click'];
  var pipFitted = false;

  /* Asked for twice, from both sides of the glass.

     User activation belongs to a Window, and every attempt from here has
     spent one this window no longer has. The floating window is its own
     Window and was created by a gesture, so it may hold an activation
     nothing has touched -- and a call made from inside it, in its own task,
     is a different question to the browser than the same call reached
     across from here. Both are tried; whichever is allowed wins, and if
     neither is, the next press does it. */
  function askForSize(win) {
    var w = PIN_W + (win.outerWidth - win.innerWidth);
    var h = PIN_H + (win.outerHeight - win.innerHeight);
    try { win.resizeTo(w, h); } catch (e) { /* from out here, then */ }
    try {
      win.setTimeout(function () {
        try { win.resizeTo(w, h); } catch (e) { /* nor from in there */ }
      }, 0);
    } catch (e) { /* window already gone */ }
  }

  function fitPip() {
    if (pipFitted || !pipWin || pipWin.closed) return;
    if (Math.abs(pipWin.innerWidth - PIN_W) < 8 && Math.abs(pipWin.innerHeight - PIN_H) < 8) {
      pipFitted = true;
      stopFitting();
      return;
    }
    askForSize(pipWin);
    setTimeout(function () {
      if (pipWin && !pipWin.closed && Math.abs(pipWin.innerHeight - PIN_H) < 20) {
        pipFitted = true;
        stopFitting();
        checkRoomy();
      }
    }, 150);
  }

  /* Bigger than it was asked for by enough to be worth saying so. Only
     until it has been fitted once -- after that the size is the listener's
     business and this has nothing useful to add. */
  function checkRoomy() {
    if (!strip || !pipWin || pipWin.closed) return;
    var roomy = !pipFitted &&
      (pipWin.innerWidth > PIN_W + 40 || pipWin.innerHeight > PIN_H + 40);
    strip.root.classList.toggle('is-roomy', roomy);
  }

  function startFitting() {
    pipFitted = false;
    FIT_ON.forEach(function (ev) { document.addEventListener(ev, fitPip, true); });
  }

  function alsoFitFrom(win) {
    try {
      FIT_ON.forEach(function (ev) { win.document.addEventListener(ev, fitPip, true); });
    } catch (e) { /* gone already */ }
  }

  function stopFitting() {
    FIT_ON.forEach(function (ev) { document.removeEventListener(ev, fitPip, true); });
    try {
      if (pipWin && !pipWin.closed) {
        FIT_ON.forEach(function (ev) { pipWin.document.removeEventListener(ev, fitPip, true); });
      }
    } catch (e) { /* gone */ }
  }

  /* ---------- getting this window out of the way ----------
     There is no way for a page to minimise its own window, and Chrome will
     not let one be pushed off the edge of the screen either -- see the note
     in restoreBox, which measured exactly that. So it is put where it
     cannot be seen instead: shrunk to a placard and parked inside the
     floating strip's own rectangle. The strip is always on top and the
     placard is smaller, so the placard is covered.

     It follows the strip, because a window fires no event for having been
     dragged and the two would otherwise come apart the first time the
     strip is moved. And it comes back on unpin, and only then. */

  /* Smaller than the strip by a good margin on both axes, so that what
     lag there is has room to be wrong in without the placard showing at
     the edges. */
  var STUB_W = 120, STUB_H = 64;
  /* Where the radio's window stood before it was stowed, and the flag the
     sizing code reads to keep its hands off while it is. Both at once, on
     purpose: there is no state where one is true and the other is not. */
  var pinnedBox = null;
  var mainStub = null;
  var followTimer = null;
  /* When the window was stowed. The press that opens the strip is a click
     on the pin, and without this the placard's way back took that same
     click and shut the strip in the gesture that opened it. */
  var stowedAt = 0;

  var STUB_HTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"' +
    ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M9.5 3.5h5l-.6 6 3.1 3.2H7l3.1-3.2z"/><path d="M12 12.7V20.5"/>' +
    '</svg>' +
    '<b>Floating</b>' +
    '<span>Click to bring the radio back</span>';

  function showStub() {
    if (!mainStub) {
      mainStub = document.createElement('div');
      mainStub.className = 'dr-stub';
      mainStub.innerHTML = STUB_HTML;
      // On the placard, not the body: only a deliberate click on the thing
      // offering the way back should take it.
      mainStub.addEventListener('click', function () {
        if (Date.now() - stowedAt < 600) return;
        if (document.body.classList.contains('is-stowed')) unpin(true);
      });
      document.body.appendChild(mainStub);
    }
    mainStub.hidden = false;
    stowedAt = Date.now();
    document.body.classList.add('is-stowed');
  }

  function hideStub() {
    if (mainStub) mainStub.hidden = true;
    document.body.classList.remove('is-stowed');
  }

  /* Clamped into the strip's rectangle rather than merely centred on it:
     Chrome quietly moves a window back on screen, and a strip near an edge
     would otherwise leave this one peeping out beside it. */
  function followFloat() {
    if (!pinnedBox || !pipWin || pipWin.closed) return;
    var pw = pipWin.outerWidth, ph = pipWin.outerHeight;
    if (!pw || !ph) return;
    var x = Math.round(pipWin.screenX + Math.max(0, (pw - window.outerWidth) / 2));
    var y = Math.round(pipWin.screenY + Math.max(0, (ph - window.outerHeight) / 2));
    if (Math.abs(x - window.screenX) < 2 && Math.abs(y - window.screenY) < 2) return;
    try { window.moveTo(x, y); } catch (e) { /* nothing to be done */ }
  }

  /* Whose clock the follow runs on, because it matters more than the rate.

     A poll is needed at all because a window fires no event for having been
     dragged. The first version polled on this window's own timer and lagged
     badly enough to show at the edges: Chrome holds back timers in a window
     it considers occluded, and being occluded is the whole point of this
     one, so it was served at about once a second however often it asked.

     The floating strip is visible, focused and unthrottled, and it can move
     this window as readily as this window can. So the interval is its. */
  var followOwner = null;

  function startFollowing(win) {
    stopFollowing();
    followOwner = (win && !win.closed) ? win : window;
    try {
      followTimer = followOwner.setInterval(followFloat, 60);
    } catch (e) {
      followOwner = window;
      followTimer = window.setInterval(followFloat, 60);
    }
  }

  function stopFollowing() {
    if (!followTimer) return;
    try { (followOwner || window).clearInterval(followTimer); } catch (e) { /* window gone */ }
    followTimer = null;
    followOwner = null;
  }

  /* Only where the window is ours to size. In an ordinary tab resizeTo is
     ignored, so this would shrink nothing and park nothing; there the
     radio's window is left alone and the floating strip is the whole of
     the feature. */
  function sizeSelf(w, h) {
    try {
      window.resizeTo(w + (window.outerWidth - window.innerWidth),
                      h + (window.outerHeight - window.innerHeight));
    } catch (e) { /* left as it was */ }
  }

  /* Done before the strip is asked for, and this is the whole trick.

     Chrome ignores the size requestWindow is given and opens the floating
     window at the opener's viewport instead -- measured, on a profile with
     nothing remembered: 440x150, 440x240 and 600x400 all came back
     1119x700, which was this window's inner size at the time. Meanwhile
     this window can be resized whenever we like, because it is ours; it is
     only the floating one that wants an activation we have already spent.

     So rather than argue, this window becomes the size the strip should be
     and lets Chrome copy it. The placard goes up first so that what is
     briefly on screen is a placard and not a squashed radio. */
  function prepareOpener() {
    if (!windowIsOurs()) return;
    pinnedBox = { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight };
    showStub();
    sizeSelf(PIN_W, PIN_H);
  }

  /* And once the strip is up, the rest of the way down and out of sight. */
  function stowOpener() {
    if (!pinnedBox) return;
    sizeSelf(STUB_W, STUB_H);
    // After the resize, so the centring uses the size actually granted.
    followFloat();
    startFollowing(pipWin);
  }

  /* The size and place the radio had before it was stowed, written out as
     the box to open at next time. rememberBox is held off for the whole of
     a pin -- a placard's size is nobody's choice -- so on the way out this
     is the only thing that knows where the radio actually lives. */
  function keepTheBox() {
    if (!pinnedBox) return;
    var b = pinnedBox;
    state.windowBox = { x: b.x, y: b.y, w: b.w, h: b.h, t: state.theme };
    save();
  }

  function restoreMain() {
    stopFollowing();
    hideStub();
    if (!pinnedBox) return;
    var b = pinnedBox;
    // Cleared before the resize, or the guards would turn away the fit that
    // has to follow it.
    pinnedBox = null;
    try { window.resizeTo(b.w, b.h); window.moveTo(b.x, b.y); } catch (e) { /* nothing to do */ }
    /* Nothing was remembered or fitted for the whole of the pin, and the
       theme's height is what the window should be wearing now. */
    setTimeout(fitWindow, 0);
  }

  function pin() {
    if (!pinSupported() || pipWin || pinPending) return;
    pinPending = true;
    startFitting();
    prepareOpener();
    /* Not to influence the size Chrome gives -- it does not copy the opener,
       measured: 440x150 at the request, 1119x700 granted -- but so the
       placard is up and the shrink has landed before a second window
       appears over it. Transient activation lasts seconds, so the ask is
       still paid for by the press that started it. */
    setTimeout(openFloat, 80);
  }

  function openFloat() {

    /* disallowReturnToOpener takes away the back-to-tab button. Chrome puts
       it beside the close button and both merely shut the window, so with
       the strip carrying its own way back there were three controls for two
       meanings. One browser control, one meaning: the X closes the radio. */
    documentPictureInPicture.requestWindow({
      width: PIN_W,
      height: PIN_H,
      disallowReturnToOpener: true
    }).then(function (win) {
      pinPending = false;
      pipWin = win;
      var d = win.document;
      /* A window this new is not guaranteed to have been given a head and
         a body yet, and everything below writes into one or the other. */
      if (!d.documentElement) d.appendChild(d.createElement('html'));
      if (!d.head) d.documentElement.appendChild(d.createElement('head'));
      if (!d.body) d.documentElement.appendChild(d.createElement('body'));
      d.documentElement.className = 'dr-pip';
      d.body.className = 'dr-pip';
      /* Not what Windows shows. It captions this window with the opener's
         title regardless -- measured: named separately, both still
         enumerated as 'KISS 92.5 - Deskside Radio'. Set anyway, because it
         is this document's own name and screen readers use it. */
      d.title = document.title;

      /* Only the webfonts are linked, and by absolute URL: they are https
         and load here like anywhere, where a file:// sheet is not reliably
         fetched by a document whose own URL is about:blank. The strip's own
         rules are written in by buildStrip for that reason. */
      var fonts = document.querySelector('link[rel="stylesheet"][href*="fonts.googleapis"]');
      if (fonts) {
        var l = d.createElement('link');
        l.rel = 'stylesheet';
        l.href = fonts.href;
        d.head.appendChild(l);
      }

      strip = buildStrip(d);
      d.body.appendChild(strip.root);

      /* The strip's own tooltip, in the strip's own document. Same code,
         same rules -- its CSS rides along in STRIP_CSS, because a file://
         sheet is not reliably fetched by a window whose URL is about:blank. */
      stripTip = tipNode(d, d.body);
      wireTips(d);

      /* Escape is what a small window that appeared over everything else
         is expected to answer to. On the floating document, because that
         is the window with the focus once it opens. */
      d.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        unpin(true);
      });

      alsoFitFrom(win);
      fitPip();
      /* Long enough for the fitter to have had its turn, so that on Windows
         this is never seen at all. */
      win.setTimeout(checkRoomy, 700);
      win.addEventListener('resize', checkRoomy);

    /* Only ever the listener's doing. unpin() clears pipWin before it closes
       the window, so by the time this runs for a close of our own the check
       below has already failed -- which leaves this meaning one thing: the X
       was pressed, and the radio is being put away. */
      win.addEventListener('pagehide', function () {
        if (pipWin !== win) return;
        pipWin = null;
        strip = null;
        stripTip = null;
        stopFitting();
        keepTheBox();
        /* If the browser will not let the window go -- it is allowed to
           refuse -- the radio must not be left stowed behind a window that
           is no longer there. */
        try { window.close(); } catch (e) { /* then stay */ }
        setTimeout(function () { if (!window.closed) restoreMain(); }, 250);
      });


      stowOpener();
      paintStrip();
      paintStripClock(el.clock.textContent);
      // The needle stops itself when there is nothing to show; wake it so
      // the strip's meter is not stuck at whatever it was left at.
      startMeter();
    }).catch(function (err) {
      pinPending = false;
      stopFitting();
      // The window was made small for a strip that is not coming.
      restoreMain();
      /* Not swallowed. A window the browser declines to open is not worth a
         noise, but a fault in the code above is, and hiding one cost an
         afternoon of looking at a blank window with an empty console. */
      try { console.error('Deskside: pin failed', err); } catch (e) { /* no console */ }
    });
  }

  /* Idempotent on purpose: reached from the strip's own button, from Reset,
     and from the floating window being closed by hand. focusBack is for the
     routes where the listener is asking for the radio rather than putting
     it away -- Chrome's own close button leaves the radio's window wherever
     it was in the stack, which after an hour of other work is behind
     everything. */
  function unpin(focusBack) {
    stopFitting();
    var win = pipWin;
    pipWin = null;
    strip = null;
    stripTip = null;
    if (win && !win.closed) {
      try { win.close(); } catch (e) { /* already going */ }
    }
    restoreMain();
    if (focusBack) {
      try { window.focus(); } catch (e) { /* not allowed, and not important */ }
    }
  }

  (function wirePin() {
    var btn = $('pinTop');
    if (!btn) return;
    if (!pinSupported()) { btn.hidden = true; return; }
    /* pointerdown as well as click, so the click that follows is a fresh
       activation for fitPip to spend on resizeTo. pin() is a no-op once one
       is open or on the way, and click alone serves the keyboard, which
       produces no pointer event at all. */
    btn.addEventListener('pointerdown', function () { pin(); });
    btn.addEventListener('click', function () { pin(); });
  }());

  /* ---------- tooltips ----------
     The browser's own were a grey rectangle in a system font, on a delay
     nothing can change, and silent to anybody who reached the control with
     a keyboard. These are the app's, and they answer to focus as well as
     to the pointer.

     One element per document, moved and refilled rather than made and
     thrown away. It is a popover, so it paints in the top layer -- which is
     what gets it past the cabinet's overflow: hidden, the one thing that
     would otherwise cut off every tooltip in the top bar.

     What it cannot do, and the native one could: leave the window. The top
     layer is above the page's stacking and clipping, not above the frame.
     Hence the placement below, which has somewhere to go in every case. */

  var TIP_DELAY = 550;     // before the first one
  var TIP_WARM = 1200;     // after which the next is no longer immediate
  var TIP_GAP = 8, TIP_EDGE = 8;

  var tipEl = null, tipFor = null, tipTimer = null, tipLast = 0;

  /* Written by the code that owns the control, since these change: the tone
     sliders explain themselves only when the stream refused the analysed
     path, and the record button has three or four things to say. An empty
     string takes the tooltip away, which is what the title property did. */
  function tipOn(node, text) {
    if (!node) return;
    if (text) node.setAttribute('data-tip', text);
    else node.removeAttribute('data-tip');
    // Already on screen for this one: say the new thing, not the old.
    if (tipFor === node) { if (text) showTip(node); else hideTip(); }
  }

  function tipNode(doc, host) {
    var box = doc.createElement('div');
    box.className = 'tip';
    box.setAttribute('popover', 'manual');
    box.setAttribute('role', 'tooltip');
    box.id = 'dsr-tip';
    host.appendChild(box);
    return box;
  }

  function theTip() {
    if (tipEl && tipEl.isConnected) return tipEl;
    /* Inside the cabinet, so it travels with it -- and harmless there now
       the top layer does the escaping. */
    tipEl = tipNode(document, el.tuner || document.body);
    return tipEl;
  }

  /* Above if it fits, below if not, and beside if neither does. Measured
     first, because none of it can be decided without knowing how big the
     words came out. */
  function placeTip(box, node) {
    var win = node.ownerDocument.defaultView || window;
    box.style.left = '0px';
    box.style.top = '0px';
    box.removeAttribute('data-side');

    var r = node.getBoundingClientRect();
    var t = box.getBoundingClientRect();
    var vw = win.innerWidth, vh = win.innerHeight;
    var side, left, top;

    if (r.top - t.height - TIP_GAP >= TIP_EDGE) {
      side = 'top';
      top = r.top - t.height - TIP_GAP;
      left = r.left + r.width / 2 - t.width / 2;
    } else if (r.bottom + TIP_GAP + t.height <= vh - TIP_EDGE) {
      side = 'bottom';
      top = r.bottom + TIP_GAP;
      left = r.left + r.width / 2 - t.width / 2;
    } else {
      // Whichever hand has more room.
      side = (vw - r.right) >= r.left ? 'right' : 'left';
      left = side === 'right' ? r.right + TIP_GAP : r.left - t.width - TIP_GAP;
      top = r.top + r.height / 2 - t.height / 2;
    }

    // Back inside the window, whatever the above worked out.
    left = Math.max(TIP_EDGE, Math.min(left, vw - t.width - TIP_EDGE));
    top = Math.max(TIP_EDGE, Math.min(top, vh - t.height - TIP_EDGE));

    box.style.left = Math.round(left) + 'px';
    box.style.top = Math.round(top) + 'px';
    box.setAttribute('data-side', side);

    /* The point stays over the control even when the plate has been pushed
       back on screen, and clear of the corners, or it grows out of a curve. */
    if (side === 'top' || side === 'bottom') {
      var ax = r.left + r.width / 2 - left;
      box.style.setProperty('--tip-ax', Math.round(Math.max(12, Math.min(ax, t.width - 12))) + 'px');
    } else {
      var ay = r.top + r.height / 2 - top;
      box.style.setProperty('--tip-ay', Math.round(Math.max(12, Math.min(ay, t.height - 12))) + 'px');
    }
  }

  function showTip(node) {
    var text = node.getAttribute('data-tip');
    if (!text) return;
    var box = node.ownerDocument === document ? theTip() : stripTip;
    if (!box) return;

    box.textContent = text;
    try { if (!box.matches(':popover-open')) box.showPopover(); } catch (e) { /* already up */ }
    placeTip(box, node);

    if (tipFor && tipFor !== node) tipFor.removeAttribute('aria-describedby');
    tipFor = node;
    node.setAttribute('aria-describedby', 'dsr-tip');
    tipLast = Date.now();
  }

  function hideTip() {
    clearTimeout(tipTimer);
    tipTimer = null;
    if (tipFor) { tipFor.removeAttribute('aria-describedby'); tipFor = null; }
    [tipEl, stripTip].forEach(function (box) {
      if (!box || !box.isConnected) return;
      try { if (box.matches(':popover-open')) box.hidePopover(); } catch (e) { /* gone */ }
    });
  }

  function wantTip(node, now) {
    clearTimeout(tipTimer);
    /* No wait when one has only just been up: moving along a row of buttons
       should not make you wait again at each. */
    var wait = now || (Date.now() - tipLast < TIP_WARM) ? 0 : TIP_DELAY;
    tipTimer = setTimeout(function () { showTip(node); }, wait);
  }

  /* Delegated, and given a document so the mini radio's window can be wired
     with the same code. */
  function wireTips(doc) {
    var find = function (e) {
      var t = e.target;
      return t && t.closest ? t.closest('[data-tip]') : null;
    };

    doc.addEventListener('pointerover', function (e) {
      // A finger has no hover, and a tooltip it cannot dismiss is a nuisance.
      if (e.pointerType === 'touch') return;
      var node = find(e);
      if (!node || node === tipFor) return;
      wantTip(node, false);
    });

    doc.addEventListener('pointerout', function (e) {
      if (!find(e)) return;
      hideTip();
    });

    // Which the browser's own never did.
    doc.addEventListener('focusin', function (e) {
      var node = find(e);
      if (node) wantTip(node, true);
    });
    doc.addEventListener('focusout', hideTip);

    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hideTip();
    });

    // A press has been answered; the label for it is no longer wanted.
    doc.addEventListener('pointerdown', hideTip);
    doc.addEventListener('scroll', hideTip, true);
  }

  wireTips(document);
  window.addEventListener('resize', hideTip);

  // ---------- media session ----------
  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    var st = currentStation();
    if (!st) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: st.name, artist: st.band || '', album: 'Deskside Radio' });
      navigator.mediaSession.playbackState = status === 'live' ? 'playing' : 'paused';
    } catch (e) { /* unsupported */ }
  }
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', startPlayback);
      navigator.mediaSession.setActionHandler('pause', stopPlayback);
      navigator.mediaSession.setActionHandler('stop', stopPlayback);
    } catch (e) { /* unsupported */ }
  }

  // ---------- controls ----------
  el.play.addEventListener('click', function () {
    if (state.intendedPlaying) stopPlayback(); else { el.overlay.hidden = true; startPlayback(); }
  });
  var volumeSaveTimer;
  el.volume.addEventListener('input', function () {
    setVolume(+el.volume.value, true);
    clearTimeout(volumeSaveTimer);
    volumeSaveTimer = setTimeout(save, 250);
  });
  /* The sound follows the slider, the writing to storage waits for it to
     settle -- the same bargain the volume fader has always struck, which
     the tone controls were not in on. A drag was one stringify and one
     localStorage write per event. */
  var toneSaveTimer;
  function saveToneSoon() {
    clearTimeout(toneSaveTimer);
    toneSaveTimer = setTimeout(save, 250);
  }
  el.bass.addEventListener('input', function () { ensureGraph(); state.bass = +el.bass.value; rememberTone(); applyTone(); saveToneSoon(); });
  el.treble.addEventListener('input', function () { ensureGraph(); state.treble = +el.treble.value; rememberTone(); applyTone(); saveToneSoon(); });
  el.volume.addEventListener('input', function () { markFader(el.volume); });

  /* Double-click a fader to send it back where it started. It slides there
     rather than jumping, so the eye can follow the handle and the ear hears
     the level move instead of stepping. A range input cannot be animated in
     CSS, so the value itself is walked over a few frames. */
  var SLIDER_HOME = { volume: 50, bass: 0, treble: 0 };
  var GLIDE_MS = 260;

  function glide(input, to, onFrame, onDone) {
    var from = +input.value;
    if (from === to) { onFrame(to); if (onDone) onDone(); return; }

    // Someone who has asked for less motion gets the old instant jump.
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) { onFrame(to); if (onDone) onDone(); return; }

    // A second double-click, or a drag, cancels whatever is in flight.
    if (input._glide) cancelAnimationFrame(input._glide);
    var start = 0;

    function step(now) {
      if (!start) start = now;
      var t = Math.min(1, (now - start) / GLIDE_MS);
      // Ease out: leaves quickly, settles gently onto the mark.
      var eased = 1 - Math.pow(1 - t, 3);
      onFrame(t === 1 ? to : from + (to - from) * eased);
      if (t < 1) input._glide = requestAnimationFrame(step);
      else { input._glide = 0; if (onDone) onDone(); }
    }
    input._glide = requestAnimationFrame(step);
  }

  function stopGlide(input) {
    if (input._glide) { cancelAnimationFrame(input._glide); input._glide = 0; }
  }
  /* A finger on the fader owns it until it is lifted. pointercancel counts
     as lifted, and so does losing the pointer altogether -- without that a
     drag that ends off the control would leave the fade unable to move it
     again. */
  el.volume.addEventListener('pointerdown', function () { draggingFader = true; stopGlide(el.volume); });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    window.addEventListener(ev, function () {
      if (!draggingFader) return;
      draggingFader = false;
      paintFade();
    });
  });
  el.bass.addEventListener('pointerdown', function () { stopGlide(el.bass); });
  el.treble.addEventListener('pointerdown', function () { stopGlide(el.treble); });

  el.volume.addEventListener('dblclick', function () {
    glide(el.volume, SLIDER_HOME.volume,
      function (v) { setVolume(v, true); },
      function () { save(); });
  });
  el.bass.addEventListener('dblclick', function () {
    ensureGraph();
    glide(el.bass, SLIDER_HOME.bass, function (v) {
      state.bass = Math.round(v * 10) / 10;
      el.bass.value = state.bass;
      el.bassOut.value = showDb(Math.round(state.bass));
      markFader(el.bass);
      if (bassNode) bassNode.gain.value = state.bass;
    }, function () {
      state.bass = SLIDER_HOME.bass; rememberTone(); applyTone(); save();
    });
  });
  el.treble.addEventListener('dblclick', function () {
    ensureGraph();
    glide(el.treble, SLIDER_HOME.treble, function (v) {
      state.treble = Math.round(v * 10) / 10;
      el.treble.value = state.treble;
      el.trebleOut.value = showDb(Math.round(state.treble));
      markFader(el.treble);
      if (trebleNode) trebleNode.gain.value = state.treble;
    }, function () {
      state.treble = SLIDER_HOME.treble; rememberTone(); applyTone(); save();
    });
  });

  /* ---------- recording ----------
     Shift reveals it, and nothing else does: recording is not what the
     radio is for, and a record button sitting on the front of it all day
     would say otherwise. It stays up while it is running, whether Shift is
     down or not, because a recording nobody can see is a recording nobody
     can stop.

     The tap is built with the graph, so a station that refused the
     analysed path has nothing to record from. That is the same reason its
     meter is off and its tone controls are dead, and the button says so
     rather than disappearing.

     AAC in an MP4 container, at the user's asking. Opus in WebM is about
     half the size and Chrome will make it happily, but Windows will not
     play it without help, and a recording that will not open on the
     machine that made it is not much of a recording. */
  var REC_MIME = 'audio/mp4;codecs=mp4a.40.2';
  var recorder = null, recChunks = [], recStartedAt = 0, shiftHeld = false;
  /* Held up for a moment after stopping, so the button can say what
     happened before it goes. */
  var savedFlash = false;
  var SAVED_MS = 3000;

  function recBlockedReason() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported(REC_MIME)) {
      return 'This browser cannot record audio.';
    }
    if (audio === plainEl) return 'This stream blocks recording, the same way it blocks the meter.';
    if (!recTap) return 'Click anywhere first: recording needs the audio graph, and the graph waits for a click.';
    if (status !== 'live') return 'Nothing is playing.';
    return '';
  }

  function refreshRec() {
    if (!el.rec) return;
    var running = !!recorder;
    var up = shiftHeld || running || savedFlash;
    /* Shown by width rather than by display, so the controls beside it
       slide over instead of jumping. The attribute is dropped once, on the
       first pass: it is in the markup so that a page with no script does
       not offer a button that cannot work. */
    el.rec.hidden = false;
    el.rec.classList.toggle('is-up', up);
    if (!up) { el.rec.disabled = true; return; }
    /* Saying it on the button rather than anywhere else, because the button
       is the thing that was just pressed and therefore the thing being
       looked at. It is not disabled for this: disabled greys it, and a
       message worth showing is worth being able to read. */
    el.rec.classList.toggle('is-saved', savedFlash);
    if (savedFlash) {
      el.rec.disabled = false;
      el.rec.setAttribute('aria-pressed', 'false');
      tipOn(el.rec, 'Saved to your downloads');
      el.recWord.textContent = 'SAVED';
      return;
    }
    var why = running ? '' : recBlockedReason();
    el.rec.disabled = !!why;
    tipOn(el.rec, why || (running ? 'Stop recording and save it' : 'Record this station'));
    el.rec.setAttribute('aria-pressed', running ? 'true' : 'false');
    el.recWord.textContent = running ? 'STOP' : 'REC';
  }

  // yymmddhhmmss, local time, taken when the recording started.
  function recStamp(d) {
    return String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate()) +
      pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }

  /* A page cannot write to the Downloads folder; it can only hand the
     browser a file and let it land there, which is what a download is. */
  function saveRecording(blob, seconds) {
    var name = 'DSRadio-' + recStamp(new Date(recStartedAt)) + '-' + seconds + '.m4a';
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked late: the download reads from the blob after the click.
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function startRec() {
    if (recBlockedReason()) return;
    // Attached only while it is being read. See buildGraph.
    try { if (analyser) analyser.connect(recTap); }
    catch (e) { return; }
    recChunks = [];
    try {
      recorder = new MediaRecorder(recTap.stream, { mimeType: REC_MIME, audioBitsPerSecond: 96000 });
    } catch (e) {
      recorder = null;
      try { if (analyser) analyser.disconnect(recTap); } catch (e2) { /* never attached */ }
      refreshRec();
      return;
    }
    recStartedAt = Date.now();
    recorder.ondataavailable = function (e) { if (e.data && e.data.size) recChunks.push(e.data); };
    recorder.onstop = function () {
      var seconds = Math.max(1, Math.round((Date.now() - recStartedAt) / 1000));
      var blob = new Blob(recChunks, { type: 'audio/mp4' });
      recChunks = [];
      recorder = null;
      try { if (analyser) analyser.disconnect(recTap); } catch (e) { /* already gone */ }
      if (blob.size) {
        saveRecording(blob, seconds);
        /* The button stays up through this whether Shift is held or not,
           and takes itself away afterwards. Stopping a recording and
           having the control vanish in the same instant leaves nothing
           that says the file was written. */
        savedFlash = true;
        setTimeout(function () { savedFlash = false; refreshRec(); }, SAVED_MS);
      }
      refreshRec();
    };
    // A second at a time, rather than one allocation at the end of an hour.
    recorder.start(1000);
    refreshRec();
  }

  function stopRec() {
    if (!recorder) return;
    try { recorder.stop(); }
    catch (e) { recorder = null; recChunks = []; refreshRec(); }
  }

  if (el.rec) {
    el.rec.addEventListener('click', function () {
      if (recorder) stopRec(); else startRec();
    });
    window.addEventListener('keydown', function (e) {
      // Not while the drawer is up: the button is behind it.
      if (e.key !== 'Shift' || shiftHeld || el.settings.open) return;
      shiftHeld = true;
      refreshRec();
    });
    window.addEventListener('keyup', function (e) {
      if (e.key !== 'Shift') return;
      shiftHeld = false;
      refreshRec();
    });
    /* A window that loses focus with the key down never sees the keyup,
       and would be left showing the button for ever. */
    window.addEventListener('blur', function () {
      shiftHeld = false;
      refreshRec();
    });
  }

  // ---------- settings drawer ----------
  var draft = null;
  var slotGroup = 'weekday';

  /* ---------- drawer tabs ----------
     One ink bar slides between the tabs rather than each drawing its own
     border, so the strip keeps a single baseline and every tab is the same
     height whether or not it carries a count. */
  var PANES = ['stations', 'schedule', 'look', 'service'];
  var pane = 'stations';

  function moveInk(animate) {
    var strip = $('drawerTabs');
    var on = strip.querySelector('.dtab[aria-selected="true"]');
    if (!on) return;
    if (!animate) strip.classList.add('is-still');
    strip.style.setProperty('--ink-x', on.offsetLeft + 'px');
    strip.style.setProperty('--ink-w', on.offsetWidth + 'px');
    if (!animate) {
      void strip.offsetWidth;
      strip.classList.remove('is-still');
    }
  }

  function paneEl(key) { return $('pane' + key.charAt(0).toUpperCase() + key.slice(1)); }

  function showPane(next, animate) {
    if (PANES.indexOf(next) === -1) next = PANES[0];
    pane = next;
    refreshFolderBtn();
    PANES.forEach(function (key) {
      $('tab' + key.charAt(0).toUpperCase() + key.slice(1))
        .setAttribute('aria-selected', key === pane ? 'true' : 'false');
      paneEl(key).hidden = key !== pane;
    });
    moveInk(animate);
  }

  /* ---------- how tall the dialog opens ----------

     Once per visit, and then it holds. A box that resized itself as you
     moved along the tab strip drew the eye to the furniture rather than to
     the settings, and the tab you were reaching for moved while you
     reached for it.

     The height comes from the tallest pane, not the one on show. The
     drawer opens on Stations, and a box cut to Stations would grow a
     scrollbar the moment you went to Service. Hidden panes are display:
     none and so have no height to read, so each is unhidden, measured and
     hidden again within the same turn of the script -- nothing is painted
     in between, so there is nothing to see.

     Three quarters of the *desktop* is the ceiling, not three quarters of
     the window. The two are the same thing only when the radio is running
     full height, and it usually is not: on a display at 150% scaling a
     near-fullscreen window measured 630 CSS pixels, so a window-relative
     ceiling handed the dialog 470 and put a scrollbar through three
     stations that wanted 561. screen.availHeight is the work area the
     desktop actually offers, taskbar already taken off, and is reported
     in CSS pixels, so it needs no scaling of its own.

     What the window can show is still the hard limit -- a dialog taller
     than the window it lives in is cut off by the window, not scrolled --
     and that limit is the stylesheet's max-height, which clamps whatever
     is set here. Past either, the body scrolls, which is the honest
     answer when the settings really are taller than the screen. */
  var drawerCloseHooked = false;
  var DRAWER_CEILING = 0.75;

  function drawerRoom() {
    var screenRoom = window.screen && screen.availHeight ? screen.availHeight : 0;
    // No screen to ask, or a nonsense answer: fall back to the window.
    if (!screenRoom || screenRoom < window.innerHeight) screenRoom = window.innerHeight;
    return Math.round(screenRoom * DRAWER_CEILING);
  }
  // Enough to swallow sub-pixel rounding rather than round down into a bar.
  var DRAWER_SLACK = 12;

  function sizeDrawer() {
    var form = el.settings.querySelector('.drawer-form');
    if (!form || !el.settings.open) return;
    form.style.height = '';
    /* Below 640px the dialog is the whole screen and the stylesheet owns
       its height; an inline one would override it. */
    if (window.matchMedia && window.matchMedia('(max-width: 640px)').matches) return;

    var tallest = 0;
    PANES.forEach(function (key) {
      var p = paneEl(key);
      if (!p) return;
      var was = p.hidden;
      p.hidden = false;
      tallest = Math.max(tallest, p.scrollHeight);
      p.hidden = was;
    });
    if (!tallest) return;

    /* Everything that is not the scrolling body: the head, the tab strip,
       the footer and the form's own borders. Their total is whatever the
       form has beyond the body, which holds whether or not the body is
       being clamped at the time. */
    var body = form.querySelector('.drawer-body');
    var frame = form.offsetHeight - body.clientHeight;
    var want = Math.min(frame + tallest + DRAWER_SLACK, drawerRoom());

    /* The stylesheet will not let the dialog past 92vh, so showing `want`
       needs a window that much taller again. Asked for before the height
       is set, so the clamp has already relaxed by the time it is. */
    growForDrawer(Math.ceil(want / 0.92));
    form.style.height = want + 'px';
  }

  $('drawerTabs').addEventListener('click', function (e) {
    var btn = e.target.closest('.dtab');
    if (btn) showPane(btn.dataset.pane, true);
  });

  function renderCounts() {
    refreshSaveBtn();
    $('countStations').textContent = draft.stations.length || '';
    var weekday = draft.schedule.weekday.length, weekend = draft.schedule.weekend.length;
    $('countSchedule').textContent = (weekday + weekend) || '';
    // Which day is busy, legible without switching to it.
    $('countWeekday').textContent = weekday || '';
    $('countWeekend').textContent = weekend || '';
  }

  function openSettings() {
    /* The last four are not edited anywhere in the drawer. They are here
       because Import writes into the draft, and a field the draft does not
       carry is a field the import quietly loses. */
    draft = clone({
      stations: state.stations, schedule: state.schedule,
      scheduleEnds: state.scheduleEnds, scheduleV: state.scheduleV || 2, theme: state.theme,
      autoplay: state.autoplay, autoplayStationId: state.autoplayStationId,
      schedulerEnabled: !!state.schedulerEnabled,
      volume: state.volume, bass: state.bass, treble: state.treble
    });
    slotGroup = 'weekday';
    clearFieldMarks();
    openSlot = null;
    pendingSnap = null;
    clearFix();
    // Updates sit outside the draft: the switch takes effect as it is used.
    $('versionCheckOn').checked = !!state.versionCheck;
    // So does this one, and whether it is worth showing at all depends on
    // a system setting that can have changed since the drawer last opened.
    paintMotion();
    renderUpdateLine();
    renderDrawer();
    // Snapshot after the render, which fills in any blanks of its own.
    draftClean = draftSnapshot();
    resetFinder();
    refreshSaveBtn();
    $('saveMsg').textContent = '';
    /* Registered on the first open rather than at startup, which keeps it
       beside the code that does the borrowing. Ahead of the applyLook
       listener further down, so the window is its own again before the
       theme has a chance to fit it. */
    if (!drawerCloseHooked) {
      drawerCloseHooked = true;
      el.settings.addEventListener('close', giveBackWindow);
    }
    if (!el.settings.open) el.settings.showModal();
    // Offsets only exist once the dialog is laid out.
    showPane('stations', false);
    sizeDrawer();
    findReadme();
  }
  $('openSettings').addEventListener('click', function () {
    /* The drawer borrows height from this window, and while the radio is
       pinned this window is a placard a hundred pixels tall. So the radio
       comes back first, and the drawer opens on the window it was written
       for. */
    unpin(false);
    openSettings();
  });

  /* ---------- the read me ----------
     Which file it is depends on where this copy came from: the download
     ships User Reference Guide.html, the repository has README.md, and
     README.html and README.txt are what older downloads have. Rather than
     guess, ask for each in turn and link the first one that answers.

     Asking is the awkward part. A page opened from a disk may not read
     its own folder -- fetch is refused outright on file: URLs and XHR
     needs the flag the launcher deliberately stopped passing -- so
     neither can say whether a file is there. A preload link can: it is
     fetched the way a script is, which a page has always been allowed to
     do for its own folder, and it reports load or error without running
     a line of it. Both were measured; a plain script tag works too, but
     it executes the readme and leaves a syntax error in the console.

     If nothing answers, the link is left dead with the reason beside it,
     because a link that opens a browser error page is worse than one
     that says up front it has nowhere to go. */
  /* The new name first, the old one after it. An app folder installed
     before the rename still has README.html sitting in it, and the
     button that opens the guide should not go dead because a later
     version renamed the file. */
  var README_NAMES = ['User Reference Guide.html', 'README.html', 'README.txt', 'README.md'];

  /* A read me is a document, not a tab. It opens in a window of its own,
     sized to the page's measure and centred on the screen this window is
     on -- screen.availLeft and availTop describe the display the radio is
     sitting on, so a second monitor gets its own centre rather than the
     document appearing back on the primary one.

     Held to what the screen can take, because a laptop at 1366x768 would
     otherwise be handed a window taller than itself. If the browser
     refuses the popup outright, nothing is prevented and the link does
     what it always did. */
  var README_W = 1000, README_H = 1240;

  function openReadme(e) {
    /* Whatever was clicked: the button in Service, or one of the links in
       the prose that go to a section of the same file. */
    var from = (this && this.getAttribute) ? this : el.readmeLink;
    var href = from.getAttribute('href');
    if (!href) { e.preventDefault(); return; }
    // A deliberate new tab, a new window, or the middle button: theirs.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;

    var sw = screen.availWidth || screen.width || README_W;
    var sh = screen.availHeight || screen.height || README_H;
    var w = Math.max(360, Math.min(README_W, sw - 80));
    var h = Math.max(400, Math.min(README_H, sh - 80));
    var ox = screen.availLeft != null ? screen.availLeft : 0;
    var oy = screen.availTop != null ? screen.availTop : 0;
    /* The version in the query, so an update is not read through the
       cache. This is a file:// page in a named window: the name means
       the same window is reused, and the cache means the bytes can be
       the ones from before the update -- a manual describing a version
       that is no longer running, at a path that looks right. Nothing
       reads the query; it is there to be different. */
    var hash = '';
    var cut = href.indexOf('#');
    if (cut !== -1) { hash = href.slice(cut); href = href.slice(0, cut); }
    var fresh = href + (href.indexOf('?') === -1 ? '?v=' : '&v=') + APP_VERSION + hash;
    var win = window.open(fresh, 'dsradio-readme',
      // No noopener here: with it, window.open hands back null and
      // there would be no way to tell a refused popup from a working
      // one. The page it opens is this app's own file.
      'popup=yes,width=' + w + ',height=' + h +
      ',left=' + Math.round(ox + (sw - w) / 2) + ',top=' + Math.round(oy + (sh - h) / 2));
    if (!win) return;
    e.preventDefault();

    /* And again, now the window exists. The features above are read only
       when open() creates a window; this one is named, so pressing the
       button while the guide is already up reuses it and ignores every
       one of them -- including a height that has since changed. */
    try {
      win.resizeTo(w, h);
      win.moveTo(Math.round(ox + (sw - w) / 2), Math.round(oy + (sh - h) / 2));
    } catch (err) { /* not ours to size, which is answer enough */ }
    if (win.focus) win.focus();
  }

  function fileExists(name, done) {
    var link = document.createElement('link');
    var settled = false;
    function finish(ok) {
      if (settled) return;
      settled = true;
      link.remove();
      done(ok);
    }
    link.rel = 'preload';
    link.as = 'script';
    link.onload = function () { finish(true); };
    link.onerror = function () { finish(false); };
    // A browser that ignores preload entirely would otherwise never answer.
    setTimeout(function () { finish(false); }, 3000);
    link.href = name;
    document.head.appendChild(link);
  }

  /* Named once. The drawer's prose points at the manual in more than one
     place and will point at it in more again; a querySelectorAll spelled out
     at each call site is a list that goes out of step with itself. */
  function guideLinks(fn) {
    var all = document.querySelectorAll('a[data-guide]');
    for (var i = 0; i < all.length; i++) fn(all[i]);
  }

  var readmeChecked = false;
  function findReadme() {
    if (readmeChecked) return;
    readmeChecked = true;
    var i = 0;
    function next() {
      if (i >= README_NAMES.length) {
        el.readmeLink.classList.add('is-off');
        el.readmeLink.removeAttribute('href');
        el.readmeLink.setAttribute('aria-disabled', 'true');
        el.readmeMissing.hidden = false;
        /* And the ones in the prose go back to being the word they were.
           A link that goes nowhere is worse than no link: it reads as
           something broken rather than something absent. */
        guideLinks(function (a2) {
          a2.classList.add('is-off');
          a2.removeAttribute('href');
          a2.removeAttribute('target');
        });
        return;
      }
      var name = README_NAMES[i++];
      fileExists(name, function (ok) {
        if (!ok) return next();
        el.readmeLink.href = name;
        el.readmeMissing.hidden = true;
        // Only a page gets a window of its own; plain text is fine in a tab.
        if (/\.html?$/i.test(name)) el.readmeLink.addEventListener('click', openReadme);
        /* The links in the prose, now that there is a name to give them.
           Sections only exist in the page, so a .txt or .md manual gets the
           file and no fragment rather than a fragment that means nothing. */
        var page = /\.html?$/i.test(name);
        guideLinks(function (a2) {
          var sec = a2.getAttribute('data-guide');
          a2.href = page && sec ? name + '#' + sec : name;
          if (page) a2.addEventListener('click', openReadme);
        });
      });
    }
    next();
  }

  /* ---------- desktop shortcut ----------
     A page cannot write to the desktop; nothing in the browser is allowed
     to. What it can do is hand over the shortcut file itself, so the save
     dialog is where the desktop gets chosen. Windows takes a .url, which
     carries a custom icon; macOS takes a .webloc, which does not.
     The file name becomes the label under the icon, so it is the app name. */
  function appFolderUrl() {
    return location.href.replace(/[^/]*$/, '');
  }
  function windowsPathOf(url) {
    // file:///D:/Folder/x.ico back to D:\Folder\x.ico
    var p = decodeURIComponent(url.replace(/^file:\/\/\//, ''));
    return p.replace(/\//g, '\\');
  }
  function isMac() {
    var ua = navigator.userAgentData;
    if (ua && ua.platform) return /mac/i.test(ua.platform);
    return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  }

  /* The file still goes out, but Windows needs a word of explanation with
     it. Chrome will not hand over a .url under its own name: it treats the
     type as dangerous, because such a file can point anywhere, and renames
     it to .download on the way out — from http as well as from file://,
     and the File System Access API blocks the extension too. So the file is
     downloaded, and a panel says what to rename it to, with the helper
     script offered as the way round it. macOS has no such rule. */
  /* Whether there is a shortcut on the Desktop, which only something
     outside the page can know. The Windows launcher writes the answer into
     assets/shortcut.js at every start, the same door the settings seed and
     the version probe come through.

     Read once, at boot, and deliberately not re-read: it is a cosmetic
     toggle on an icon, and the launcher may still be writing the file as
     this loads. One launch behind is the worst it gets.

     Anything other than a clear yes leaves the button showing. Missing
     file, unreadable file, an error, or any platform where no launcher
     runs -- which is macOS and Linux, where this file will never exist and
     the top bar therefore stays exactly as it was. Never hide on not
     knowing: somebody whose shortcut has gone needs the button most. */
  function hideShortcutIfOneExists() {
    var btn = $('makeShortcut');
    if (!btn) return;

    /* Read more than once, because the launcher writes this file a moment
       AFTER it starts the browser -- deliberately, so that a directory
       listing never sits between a double-click and the radio. The page
       can therefore win the race and read yesterday's answer, or on the
       launch after an update, no answer at all. One read at boot left the
       button on screen for the whole session on a machine that had a
       shortcut the entire time.

       A few tries, widening, and then it stops. Also on the first focus,
       which is the cheap way to catch a window that was opened while the
       launcher was still going. */
    var tries = 0;
    function look() {
      var s = document.createElement('script');
      s.src = 'assets/shortcut.js?' + Date.now();
      s.onload = function () {
        s.remove();
        btn.hidden = window.DESKSIDE_HAS_SHORTCUT === true;
        again();
      };
      s.onerror = function () { s.remove(); again(); };
      document.head.appendChild(s);
    }
    function again() {
      if (btn.hidden || tries >= 3) return;
      tries++;
      setTimeout(look, tries * 1600);
    }
    look();
    window.addEventListener('focus', function () {
      if (btn.hidden) return;
      tries = 0;
      look();
    });
  }
  hideShortcutIfOneExists();

  /* ---------- start with Windows ----------

     The only control in Settings that is not a setting. Everything else here
     is something the app decides and remembers; this is a fact about the
     machine, and the app is the last thing to know it. So it is never saved
     and never assumed: it is shown from what the launcher wrote down, and
     read again after every flip.

     Read again because the flip can fail in ways nothing here can see. A page
     opened off a disk cannot write to the Startup folder -- no browser allows
     it -- so the switch navigates to desksideradio:, which the installer
     registered, and Windows runs a script of ours. The browser asks the
     listener first, and they may say no; they may also have no handler at all,
     on a folder that was unzipped by hand rather than installed. In both cases
     the switch has to go back to showing the truth rather than the wish.

     Nothing here works on macOS or Linux and the block stays hidden there. */
  var startupWanted = null;
  var startupTimer = null;
  var startupUntil = 0;

  /* How long to keep looking, and how often.

     The first flip goes through a browser permission dialog that somebody has
     to read, find the checkbox in, and answer. Forty-five seconds is not
     generous for that; the 1200ms this replaces was shorter than the sentence
     they are being asked to agree with, so it always reported a refusal
     against a question nobody had answered yet.

     Polling rather than waiting once, because the answer arrives out of band:
     another process writes a file, and there is no event for that. */
  var STARTUP_WAIT = 45000;
  var STARTUP_EVERY = 600;

  function startupIsOn() {
    return window.DESKSIDE_STARTS_WITH_WINDOWS === true;
  }

  /* Which of the two controls is on screen, and where it is set.

     The button stands in until a flip has actually worked once. That is the
     same moment the browser's permission was granted, so from then on the
     dialog is gone and a switch can behave like a switch. */
  function showStartupControl() {
    var go = $('startupGo'), sw = $('startupSwitch'), note = $('startupNote');
    if (!go || !sw) return;
    var used = !!state.startupUsed;
    go.hidden = used;
    sw.hidden = !used;
    if (note) note.hidden = used;
  }

  function showStartupState() {
    var box = $('startWithWindows');
    if (!box) return;
    var on = startupIsOn();
    box.checked = on;
    showStartupControl();

    /* Nothing was asked for, so there is nothing to report. Loose equality on
       purpose: var hoists startupWanted as undefined, and the first probe is
       later than the assignment only by the event loop. */
    if (startupWanted == null) return;

    if (on === startupWanted) {
      stopStartupPoll();
      startupSays('startupLine', on
        ? 'Set. The radio will open when you next sign in.'
        : 'Off. The radio will not open when you sign in.');
      startupWanted = null;
      /* It worked, so the permission behind it was granted: the dialog will
         not be back, and the control can be a switch from here on. */
      if (!state.startupUsed) { state.startupUsed = true; save(); showStartupControl(); }
      return;
    }

    /* Not yet is not the same as no. While there is budget left this says
       nothing and changes nothing: the dialog may still be on screen, and the
       script it leads to takes a moment to write. Announcing a refusal here
       is what made the control flip back behind the dialog. */
    if (Date.now() < startupUntil) return;

    /* Budget spent. The likeliest cause is a permission dialog that was
       dismissed, and the second likeliest a folder with no handler registered
       in it -- one unzipped by hand rather than installed. */
    stopStartupPoll();
    startupSays('startupLine', 'Windows did not do that. If your browser asked for '
      + 'permission and the answer was no, try again \u2014 or run '
      + '"Win - Start with Windows (On-Off).cmd" in your app folder.');
    startupWanted = null;
  }

  function stopStartupPoll() {
    startupUntil = 0;
    if (startupTimer) { clearInterval(startupTimer); startupTimer = null; }
    var go = $('startupGo');
    if (go) go.disabled = false;
  }

  function startupSays(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }

  function askStartup(want) {
    startupWanted = want;
    startupUntil = Date.now() + STARTUP_WAIT;
    startupSays('startupLine', want ? 'Asking Windows\u2026' : 'Removing it\u2026');

    var go = $('startupGo');
    if (go) go.disabled = true;

    /* Two words, and the handler accepts no others. Nothing from this page is
       interpolated into it: a registered protocol can be reached by any site in
       any browser, so what crosses the gap is a constant. */
    try {
      location.href = 'desksideradio:startup-' + (want ? 'on' : 'off');
    } catch (e) { /* no handler, and the poll will say so when it gives up */ }

    /* The answer arrives out of band: another process writes a file, and there
       is no event for that. Focus helps -- the dialog takes it and gives it
       back -- but it is not enough on its own, because the script it starts is
       still writing when focus returns, and because a browser told to stop
       asking never takes focus at all. */
    if (startupTimer) clearInterval(startupTimer);
    startupTimer = setInterval(reReadStartup, STARTUP_EVERY);
    reReadStartup();
  }

  /* The switch, once there is one. Put straight back where the machine has it:
     the browser moved it on click, and nothing has happened yet. It moves for
     real in showStartupState, when a read agrees. */
  $('startWithWindows').addEventListener('change', function () {
    var want = this.checked;
    this.checked = startupIsOn();
    askStartup(want);
  });

  /* And the button that stands in for it the first time. Nothing to put back
     here -- that is the whole reason it is a button. */
  $('startupGo').addEventListener('click', function () { askStartup(true); });

  /* Its own file, and not the one the shortcut button reads. That one is
     written by the launcher at start and describes the Desktop, which does not
     change while the radio is running. This changes precisely because somebody
     asked it to -- so the script that changes the entry writes it, on both
     paths, whether it was reached through the handler or double-clicked.

     Reading the launcher's file here was the first version of this, and the
     switch could never see its own work: the flip happened, nothing rewrote
     the file, and the answer from launch came back and put the switch where it
     had been. */
  function reReadStartup() {
    var s = document.createElement('script');
    s.src = 'assets/startup.js?' + Date.now();
    s.onload = function () { s.remove(); showStartupState(); };
    /* Unreadable means unchanged, which showStartupState reports as a failure
       -- correctly: if the file cannot be read, nothing can be known. */
    s.onerror = function () { s.remove(); showStartupState(); };
    document.head.appendChild(s);
  }

  /* At boot, and a couple more times: the launcher writes this a moment after
     it starts the browser, deliberately, so that nothing sits between a
     double-click and the radio. The page can win that race. */
  var startupTries = 0;
  function firstStartupRead() {
    reReadStartup();
    if (startupTries >= 2) return;
    startupTries++;
    setTimeout(firstStartupRead, startupTries * 1600);
  }
  /* Drawn before the first read comes back, or the row is empty for a moment.
     Both controls start hidden in the markup so that neither flashes on a
     machine where the pane does not apply at all. */
  showStartupControl();
  if ($('startWithWindows')) firstStartupRead();

  /* On every focus, not only after a flip. Somebody who ran the on-off script
     by hand while the radio was open should find the switch already correct
     rather than lying until the next launch. */
  window.addEventListener('focus', reReadStartup);

  $('makeShortcutPane').addEventListener('click', function () {
    $('makeShortcut').click();
  });

  $('makeShortcut').addEventListener('click', function () {
    var here = location.href.split('#')[0];
    var mac = isMac();
    var body, type, name;

    if (mac) {
      /* .fileloc, not .webloc. Both are property lists with a URL in them
         and Finder opens both, but they are not interchangeable: .webloc
         is for web addresses and .fileloc is for something on this disk,
         which is what this is. Handed a file:// URL inside a .webloc,
         Finder reports "The document content is not readable or is in the
         wrong format" -- it read the file and did not like what was in it.

         The URL is escaped on the way in. A plist is XML, so a folder name
         with an & in it produced a malformed document and exactly the same
         message, for a different reason. */
      body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
        '<plist version="1.0"><dict><key>URL</key><string>' + escapeHtml(here) + '</string></dict></plist>\n';
      type = 'text/plain';
      name = 'Deskside Radio.fileloc';
    } else {
      /* The shortcut keeps the theme that was showing when it was made:
         each theme ships its own .ico, and a per-theme path also sidesteps
         the Windows icon cache, which keys on the file it was told about. */
      var known = /^(dial|console|rams|editorial|retro|departures|marconi|tivoli)$/.test(state.theme);
      var icon = windowsPathOf(appFolderUrl() + 'assets/favicon-' + (known ? state.theme : 'dial') + '.ico');
      // .url files want CRLF and the icon given as a full path.
      body = ['[InternetShortcut]', 'URL=' + here, 'IconFile=' + icon, 'IconIndex=0', ''].join('\r\n');
      type = 'text/plain';
      name = 'Deskside Radio.url';
    }

    var blob = new Blob([body], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);

    var label = { dial: 'Analogue dial', console: 'Broadcast console', rams: 'Rams minimal', editorial: 'Editorial',
                  retro: 'Retro 8-bit', departures: 'Departures board', marconi: 'Marconi deco',
                  tivoli: 'Tivoli Model One' };
    var named = label[state.theme] || 'Deskside Radio';
    var theme = known ? state.theme : 'dial';

    if (mac) {
      setStatus(status, 'Shortcut downloaded · drag it to your Desktop');
      $('macIcon').src = 'assets/favicon-' + theme + '.ico';
      $('macIcon').alt = named + ' icon';
      $('macTheme').textContent = named;
      $('macHelp').showModal();
      return;
    }
    setStatus(status, 'Shortcut downloaded · see the panel');

    /* The panel shows the icon the shortcut will carry, which is the theme
       showing right now — the same file the .url above points at, so what
       is previewed here is literally what lands on the Desktop. */
    /* theme, label and named are worked out above, before the macOS branch
       returns, because that panel needs them too. They used to be declared
       here and read one line above the declaration, and since var hoists
       the name but not the value, every press of the button threw -- after
       the download, before showModal, so the file arrived and the panel
       explaining it never did. */
    $('shortcutIcon').src = 'assets/favicon-' + theme + '.ico';
    $('shortcutIcon').alt = named + ' icon';
    $('shortcutTheme').textContent = named;
    // Quoted: the folder has a space in it more often than not, and an
    // unquoted path runs whatever the first word happens to name.
    $('shortcutCmd').textContent = '"' + windowsPathOf(appFolderUrl()) + 'Win - Create Desktop Shortcut (Chrome).cmd" ' + theme;
    $('shortcutHelp').showModal();
  });

  $('shortcutCopy').addEventListener('click', function () {
    var btn = this;
    var cmd = $('shortcutCmd').textContent;
    try {
      navigator.clipboard.writeText(cmd).then(function () {
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = 'Copy command'; }, 1400);
      }, function () { btn.textContent = 'Select it above'; });
    } catch (e) {
      // A page opened from disk is often refused the clipboard outright.
      btn.textContent = 'Select it above';
    }
  });

  /* The footer button reads Close until the draft differs from what is
     saved, then becomes Save. Comparing serialised drafts is cheap at this
     size and catches every path, including reordering and deleting, which
     fire no input event. */
  var draftClean = null;
  function draftSnapshot() {
    if (!draft) return null;
    return JSON.stringify({
      stations: draft.stations, schedule: draft.schedule,
      scheduleEnds: draft.scheduleEnds, theme: draft.theme,
      autoplay: !!draft.autoplay, autoplayStationId: draft.autoplayStationId || null,
      schedulerEnabled: !!draft.schedulerEnabled,
      volume: draft.volume, bass: draft.bass, treble: draft.treble
    });
  }
  function draftIsDirty() { return draftClean !== null && draftSnapshot() !== draftClean; }
  function refreshSaveBtn() {
    var btn = $('saveBtn');
    var dirty = draftIsDirty();
    btn.textContent = dirty ? 'Save' : 'Close';
    btn.classList.toggle('is-dirty', dirty);
  }
  el.settings.addEventListener('input', refreshSaveBtn);
  el.settings.addEventListener('change', refreshSaveBtn);

  function renderDrawer() {
    renderThemeCards();
    renderStationRows();
    renderSlotRows();
    renderCounts();
    var tabs = el.settings.querySelectorAll('.tabs .tab');
    for (var t = 0; t < tabs.length; t++) {
      var on = tabs[t].dataset.group === slotGroup;
      tabs[t].classList.toggle('is-active', on);
      // The class is what it looks like; this is what it is.
      tabs[t].setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  /* A line under each thumbnail naming what the theme is borrowed from. The
     picture already shows the colours and the hardware, so repeating them
     in words says nothing; what it cannot show is where the thing came
     from, which is the part that makes the name make sense. */
  var THEME_CARDS = [
    { key: 'dial', label: 'Analogue dial', note: 'Wood-cabinet radios of the 1950s living room' },
    { key: 'console', label: 'Broadcast console', note: 'The on-air mixing desk of a radio control room' },
    { key: 'rams', label: 'Rams minimal', note: 'Homage to the work of German industrial designer Dieter Rams' },
    { key: 'editorial', label: 'Editorial', note: 'Type-led layouts from a printed magazine' },
    { key: 'retro', label: 'Retro 8-bit', note: 'Interface style of 80s home game consoles' },
    { key: 'departures', label: 'Departures board', note: 'Split-flap boards in airports and railway stations' },
    { key: 'marconi', label: 'Marconi deco', note: 'Art deco radio cabinets of the 1930s' },
    { key: 'tivoli', label: 'Model One', note: 'The Tivoli Model One, the one-knob tabletop radio of 2000' }
  ];
  function renderThemeCards() {
    var box = $('themeCards');
    box.innerHTML = '';
    THEME_CARDS.forEach(function (t) {
      var card = document.createElement('label');
      card.className = 'theme-card';
      card.innerHTML =
        '<input type="radio" name="theme" value="' + t.key + '">' +
        '<span class="theme-thumb" data-theme="' + t.key + '" aria-hidden="true">' +
          '<span class="tt"><span class="tt-cap"><b class="tt-call">CDSK</b><b class="tt-freq">68.0</b></span><span class="tt-glass"></span>' +
          '<span class="tt-keys"><i></i><i></i><i></i></span></span>' +
        '</span>' +
        '<span class="theme-label">' +
          '<span class="theme-name">' + escapeHtml(t.label) + '</span>' +
          '<span class="theme-note">' + escapeHtml(t.note) + '</span>' +
        '</span>';
      card.querySelector('input').checked = draft.theme === t.key;
      box.appendChild(card);
    });
  }

  el.settings.addEventListener('change', function (e) {
    if (e.target.name === 'theme') {
      draft.theme = e.target.value;
      // This listener runs after the generic one, so refresh the footer here.
      refreshSaveBtn();
      document.documentElement.setAttribute('data-theme', draft.theme);
      var cur = currentStation();
      if (cur) showName(cur.name);
    }
  });

  /* The picker lists the draft, not the saved state, so a station added
     in this sitting can be chosen as the launch station before saving. */
  function renderAutoplay() {
    var on = $('autoplayOn'), pick = $('autoplayStation');
    on.checked = !!draft.autoplay;
    on.closest('.autoplay').setAttribute('data-on', on.checked ? 'true' : 'false');
    $('autoplayHint').hidden = !on.checked;

    var named = draft.stations.filter(function (st) { return String(st.name || '').trim(); });
    pick.innerHTML = '';
    if (!named.length) {
      pick.appendChild(new Option('Name a station first', ''));
      pick.disabled = true;
      return;
    }
    pick.disabled = false;
    var chosen = null;
    named.forEach(function (st) {
      pick.appendChild(new Option(st.name, st.id));
      if (st.id === draft.autoplayStationId) chosen = st.id;
    });
    // A launch station that was deleted or renamed away falls to the first.
    if (!chosen) chosen = named[0].id;
    draft.autoplayStationId = chosen;
    pick.value = chosen;
  }

  $('autoplayOn').addEventListener('change', function () {
    draft.autoplay = this.checked;
    renderAutoplay();
  });
  $('autoplayStation').addEventListener('change', function () {
    draft.autoplayStationId = this.value || null;
  });

  /* One line per station, expanding to the full form. Six stations used to
     be eighteen form rows stacked on top of each other. `openStation` holds
     the id of the one card that is open, so it survives a re-render. */
  var openStation = null;

  /* Which fields a refused save is pointing at, keyed by the station's own
     id rather than its position, so re-ordering or deleting another
     station cannot make a mark describe the wrong field. Held here rather
     than on the DOM because the cards are rebuilt on every render. */
  var badFields = {};

  function markField(id, key, message) { badFields[id + '|' + key] = message; }

  function clearFieldMarks() {
    badFields = {};
    var box = $('stationRows');
    if (!box) return;
    var i, marked = box.querySelectorAll('.in.is-bad');
    for (i = 0; i < marked.length; i++) { marked[i].classList.remove('is-bad'); marked[i].removeAttribute('aria-invalid'); }
    var lines = box.querySelectorAll('.field-err');
    for (i = 0; i < lines.length; i++) lines[i].parentNode.removeChild(lines[i]);
    var cards = box.querySelectorAll('.card.has-err');
    for (i = 0; i < cards.length; i++) cards[i].classList.remove('has-err');
  }

  /* The moment a field is touched it stops being wrong. The old slot-card
     errors never cleared, so a field the listener had already corrected
     went on looking broken until the next save -- which taught them to
     ignore the red rather than read it. */
  function clearFieldMark(id, key, field) {
    if (!badFields[id + '|' + key]) return;
    delete badFields[id + '|' + key];
    field.classList.remove('is-bad');
    field.removeAttribute('aria-invalid');
    var line = field.parentNode.querySelector('.field-err');
    if (line) line.parentNode.removeChild(line);
    var card = field.closest('.card');
    if (card && !card.querySelector('.in.is-bad')) card.classList.remove('has-err');
  }

  // Re-painted after every render, because the render throws the DOM away.
  function applyFieldMarks() {
    var box = $('stationRows');
    for (var k in badFields) {
      if (!Object.prototype.hasOwnProperty.call(badFields, k)) continue;
      var cut = k.lastIndexOf('|');
      var id = k.slice(0, cut), key = k.slice(cut + 1), at = -1;
      for (var i = 0; i < draft.stations.length; i++) if (draft.stations[i].id === id) { at = i; break; }
      // The station it was about is gone, and so is the complaint.
      if (at === -1) { delete badFields[k]; continue; }
      var card = box.children[at];
      var field = card && card.querySelector('[data-k="' + key + '"]');
      if (!field) continue;
      field.classList.add('is-bad');
      field.setAttribute('aria-invalid', 'true');
      card.classList.add('has-err');
      var line = field.parentNode.querySelector('.field-err');
      if (!line) {
        line = document.createElement('p');
        line.className = 'field-err';
        field.parentNode.appendChild(line);
      }
      line.textContent = badFields[k];
    }
  }
  var reordering = false;
  var FOLD_MS = 200, SLIDE_MS = 260;

  function stillMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* Opening a card used to re-render the list, which threw away the very
     elements the transition needs. Only the class changes now. */
  function syncOpenCards() {
    var kids = $('stationRows').children;
    for (var k = 0; k < kids.length; k++) {
      var st = draft.stations[k];
      kids[k].classList.toggle('is-open', !!st && st.id === openStation);
    }
  }

  /* Reordering with a card open would slide two different heights past each
     other, so everything folds shut first. Then the rows trade places under
     a FLIP: measure where they are, re-render, put them back with a
     transform, and release it on the next frame. */
  function moveStation(i, dir) {
    if (reordering) return;
    var j = i + dir;
    if (j < 0 || j >= draft.stations.length) return;
    var box = $('stationRows');
    var still = stillMotion();
    var moved = draft.stations[i].id;

    function commit() {
      var first = {};
      var kids = box.children;
      for (var k = 0; k < kids.length; k++) {
        var st = draft.stations[k];
        if (st) first[st.id] = kids[k].getBoundingClientRect().top;
      }

      draft.stations.splice(j, 0, draft.stations.splice(i, 1)[0]);
      renderStationRows(); renderSlotRows(); renderCounts(); renderAutoplay();

      if (still) { reordering = false; return; }

      var next = box.children, sliding = [];
      for (var m = 0; m < next.length; m++) {
        var id = draft.stations[m] && draft.stations[m].id;
        var was = first[id];
        if (was == null) continue;
        var dy = was - next[m].getBoundingClientRect().top;
        if (!dy) continue;
        next[m].classList.add('is-sliding');
        if (id === moved) next[m].classList.add('is-lead');
        next[m].style.transition = 'none';
        next[m].style.transform = 'translateY(' + dy + 'px)';
        sliding.push(next[m]);
      }
      // Read layout back, or the inverted position never gets painted and
      // the cards simply appear in their new places.
      void box.offsetHeight;
      sliding.forEach(function (node) { node.style.transition = ''; node.style.transform = ''; });

      setTimeout(function () {
        sliding.forEach(function (node) { node.classList.remove('is-sliding', 'is-lead'); });
        reordering = false;
      }, SLIDE_MS);
    }

    reordering = true;
    if (openStation !== null && !still) {
      openStation = null;
      syncOpenCards();
      setTimeout(commit, FOLD_MS);
    } else {
      openStation = null;
      commit();
    }
  }

  /* Same reasoning as a slot, with more to lose: the URL, the colour and
     the station's own bass and treble go with it. The question names the
     station, and says so when the schedule is still pointing at it. */
  var pendingStationDelete = null;

  function askDeleteStation(index) {
    var st = draft.stations[index];
    if (!st) return;
    pendingStationDelete = index;
    var name = String(st.name || '').trim() || 'This station';
    var band = String(st.band || '').trim();
    $('stationDeleteWhat').textContent = name + (band ? ' \u00b7 ' + band : '') + '.';

    var used = 0;
    ['weekday', 'weekend'].forEach(function (g) {
      (draft.schedule[g] || []).forEach(function (sl) { if (sl.stationId === st.id) used += 1; });
    });

    /* Losing the last one is a different question from losing one of
       several, so it gets said outright rather than left to be discovered
       at the save, which is where it is actually refused. */
    var last = draft.stations.length === 1;
    var notes = [];
    if (last) notes.push('This is your only station. Delete it and there is nothing left to play, and Settings will not save until you add one back.');
    /* One sentence, not two. It said "The schedule uses it in 1 slot." and
       then "Its 1 slot go with it." -- the same fact twice, and the second
       one ungrammatical for a single slot. */
    if (used) {
      notes.push('The schedule uses it in ' + used + ' slot' + (used === 1 ? '' : 's') +
        ', which ' + (used === 1 ? 'goes' : 'go') + ' with it.');
    }

    var note = $('stationDeleteUsed');
    note.hidden = !notes.length;
    note.textContent = notes.join(' ');
    $('stationDeleteGo').textContent = last ? 'Delete anyway' : 'Delete station';

    $('confirmStation').showModal();
  }

  /* Click, not close: see the note on confirmDiscard. Submitting a nested
     dialog's form closes it without firing close, so only the button press
     is reliable. Matching the delete button alone means Esc and "Keep it"
     do nothing, which is what they should do. */
  $('confirmStation').addEventListener('click', function (e) {
    if (!e.target.closest('button[value="delete"]')) return;
    var index = pendingStationDelete;
    pendingStationDelete = null;
    if (index === null || index >= draft.stations.length) return;
    var st = draft.stations[index];
    var name = String(st.name || '').trim();
    /* Every slot that used it goes with it. A slot with nothing to play is
       not a slot, and the alternative -- reassigning them to a station
       nobody chose for that hour -- leaves a schedule that looks intact
       and does the wrong thing at seven in the morning. */
    var touched = 0;
    ['weekday', 'weekend'].forEach(function (g) {
      var keep = [];
      (draft.schedule[g] || []).forEach(function (sl) {
        if (sl.stationId !== st.id) { keep.push(sl); return; }
        touched += 1;
      });
      draft.schedule[g] = keep;
    });

    draft.stations.splice(index, 1);
    openStation = null;

    if (touched) {
      showFix(touched + ' slot' + (touched === 1 ? ' was' : 's were') +
        ' removed with ' + (name || 'that station') + '.', null);
    }
    ['weekday', 'weekend'].forEach(function (g) {
      draft.schedule[g] = Scheduler.settle(draft.schedule[g], draft.stations, null).slots;
    });
    renderStationRows(); renderSlotRows(); renderCounts(); renderAutoplay();
    // A splice is not an input event, so the footer label has to be told.
    refreshSaveBtn();
  });

  function renderStationRows() {
    var box = $('stationRows');
    box.innerHTML = '';
    draft.stations.forEach(function (st, i) {
      var card = document.createElement('div');
      card.className = 'card' + (st.id === openStation ? ' is-open' : '');
      card.style.setProperty('--c', st.color || '#8a8a84');

      var name = String(st.name || '').trim();
      var band = String(st.band || '').trim();
      card.innerHTML =
        /* The header is a div holding a toggle button, not one big button:
           the move and remove buttons used to sit inside it, and a button
           inside a button is not parseable — the browser hoisted them out of
           the header, where nothing was listening for their clicks. */
        '<div class="card-top">' +
          '<button type="button" class="card-toggle" data-act="toggle">' +
            /* The marker is the station colour and the open/closed state in
               one glyph: a play arrow with a heavily rounded tail, turned
               down when the card is open. */
            '<span class="card-mark" aria-hidden="true">' +
              '<svg viewBox="0 0 24 24" fill="currentColor">' +
                '<path d="M18.3 10.8 Q20 12 18.3 13.2 L11.2 18.9 Q8.3 22.2 6 16.5 Q4.2 12 6 7.5 Q8.3 1.8 11.2 5.1 Z"/>' +
              '</svg>' +
            '</span>' +
            '<span class="card-name' + (name ? '' : ' is-blank') + '">' + escapeHtml(name || 'Unnamed station') + '</span>' +
            '<span class="card-pill' + (band ? '' : ' is-empty') + '">' + escapeHtml(band || 'no frequency') + '</span>' +
          '</button>' +
          '<span class="card-acts">' +
            '<button type="button" class="mini" data-act="up" aria-label="Move up">&uarr;</button>' +
            '<button type="button" class="mini" data-act="down" aria-label="Move down">&darr;</button>' +
            '<button type="button" class="mini danger" data-act="del" aria-label="Remove">&times;</button>' +
          '</span>' +
        '</div>' +
        '<div class="card-fold">' +
        '<div class="card-body">' +
          '<div class="station-grid">' +
            /* The three fields a save can refuse are each in a wrapper
               that holds the grid cell, so the message goes under its own
               field and pushes the row down instead of being parked at the
               bottom of the card away from what it is about. */
            '<div class="fw fw-name"><input class="in" data-k="name" placeholder="Station name" aria-label="Name"' +
            ' data-tip="What the radio shows in large letters. Any name you like."></div>' +
            '<div class="fw fw-band"><input class="in in-band" data-k="band" placeholder="1010 AM" aria-label="Frequency"' +
            ' data-tip="The frequency printed on the tuning scale, e.g. 92.5 FM. Leave it empty for a stream with no dial position."></div>' +
            '<input class="in in-color" data-k="color" type="color" aria-label="Colour"' +
            ' data-tip="The colour this station is drawn in. The editorial and departures themes use it; the others ignore it.">' +
            '<div class="fw fw-url"><input class="in in-url" data-k="url" placeholder="https://stream.example.com/live.mp3" aria-label="Stream URL"' +
            ' data-tip="The direct address of the audio itself. MP3 and AAC play here; a .pls or .m3u is a list of streams rather than one and will not."></div>' +
            '<input class="in in-tag" data-k="tag" placeholder="AAC+ \u00b7 48 kbps \u00b7 Toronto" aria-label="Tagline"' +
            ' data-tip="The small line under the name. Found stations arrive with the format, the bitrate and the city; yours can say anything.">' +
          '</div>' +
        '</div>' +
        '</div>';

      var ins = card.querySelectorAll('.card-body .in');
      for (var k = 0; k < ins.length; k++) {
        ins[k].value = st[ins[k].dataset.k] || (ins[k].type === 'color' ? '#10307a' : '');
        ins[k].addEventListener('input', function (e) {
          var key = e.target.dataset.k;
          st[key] = e.target.value;
          clearFieldMark(st.id, key, e.target);
          if (key === 'name') {
            var label = card.querySelector('.card-name');
            var now = String(e.target.value || '').trim();
            label.textContent = now || 'Unnamed station';
            label.classList.toggle('is-blank', !now);
            renderAutoplay();
          }
          if (key === 'band') {
            var pill = card.querySelector('.card-pill');
            var b = String(e.target.value || '').trim();
            pill.textContent = b || 'no frequency';
            pill.classList.toggle('is-empty', !b);
          }
          if (key === 'color') card.style.setProperty('--c', e.target.value);
        });
      }

      card.querySelector('.card-top').addEventListener('click', function (e) {
        var act = (e.target.closest('[data-act]') || {}).dataset;
        act = act ? act.act : 'toggle';
        if (act === 'del') { askDeleteStation(i); return; }
        else if (act === 'up' && i > 0) { moveStation(i, -1); return; }
        else if (act === 'down' && i < draft.stations.length - 1) { moveStation(i, 1); return; }
        else { openStation = st.id === openStation ? null : st.id; syncOpenCards(); return; }
        renderStationRows(); renderSlotRows(); renderCounts(); renderAutoplay();
      });

      box.appendChild(card);
    });
    applyFieldMarks();
    renderAutoplay();
  }

  // Open a station card and put the cursor in one of its fields.
  function focusStationField(index, key, toBottom) {
    var st = draft.stations[index];
    if (!st) return;
    openStation = st.id;
    renderStationRows();
    var card = $('stationRows').children[index];
    var field = card && card.querySelector('[data-k="' + key + '"]');
    if (!field) return;
    /* The drawer body scrolls; focusing alone can leave it off screen.
       `toBottom` is for the card at the end of the list, where "nearest"
       scrolls it just into view at the bottom edge and leaves it half
       under the footer -- there, scrolling the list to its end puts the
       whole card on screen with the field in the middle of it. */
    var body = document.querySelector('.drawer-body');
    if (toBottom && body) body.scrollTop = body.scrollHeight;
    else if (field.scrollIntoView) field.scrollIntoView({ block: 'nearest' });
    field.focus();
    if (field.select) field.select();
  }
  $('addStation').addEventListener('click', function () {
    var fresh = { id: 'st_' + Date.now().toString(36), name: '', band: '', tag: '', url: '', color: '#2a6f4e', bass: 0, treble: 0 };
    draft.stations.push(fresh);
    openStation = fresh.id;
    renderStationRows();
    renderCounts();
    var last = $('stationRows').lastElementChild;
    if (last) { var f = last.querySelector('[data-k="name"]'); if (f) f.focus(); }
  });

  /* The note survives a change of group, because the fix it describes did
     not go anywhere -- but it has to say which day it happened on, or it
     reads as a claim about the day now showing. */
  function labelFixForGroup() {
    if (!undoSnap || undoSnap.group === slotGroup) return;
    var t = $('fixText').textContent;
    var prefix = (undoSnap.group === 'weekend' ? 'Weekend' : 'Weekdays') + ': ';
    if (t.indexOf(prefix) !== 0) $('fixText').textContent = prefix + t;
  }

  el.settings.querySelector('.tabs').addEventListener('click', function (e) {
    var tab = e.target.closest ? e.target.closest('[data-group]') : null;
    if (!tab) return;
    slotGroup = tab.dataset.group;
    // The card that was open belongs to the other day now.
    openSlot = null;
    pendingSnap = null;
    renderDrawer();
    labelFixForGroup();
  });

  /* ---------- schedule slots ----------
     A slot is a time range and a station, plus up to four settings it can
     impose when it becomes the active one. Each of those is opt-in, so the
     card shows a chip for whichever are switched on and keeps the controls
     folded away until the card is opened. */
  /* The open card, by slot id. It used to be the group name and an array
     index, which stopped meaning anything the moment the list sorted
     itself -- the card that opened was whichever slot had landed in that
     position. */
  var openSlot = null;

  /* One step back, and only one. The snapshot is taken when a time field
     is focused rather than on each keystroke, so typing 09:30 as 09, 09:3,
     09:30 undoes to what was there before, not to a value passed through
     on the way. It restores the times of every slot in the group and puts
     back anything settling removed; a station or a flag changed since is
     left alone, because those did not cause the fix. */
  var undoSnap = null;

  // Taken on focus, spent by the edit that follows it.
  var pendingSnap = null;

  function showFix(text, snap) {
    $('fixText').textContent = text;
    $('fixUndo').hidden = !snap;
    $('fixNote').hidden = false;
    undoSnap = snap || null;
  }

  function clearFix() {
    $('fixNote').hidden = true;
    $('fixText').textContent = '';
    undoSnap = null;
  }

  /* Several fixes at once read better as one sentence than as a list, and
     past two of them the detail stops being useful anyway. */
  function fixText(changes) {
    if (changes.length === 1) return changes[0].text;
    if (changes.length > 2) return changes.length + ' slots were shortened or removed to make room.';
    /* Two of them read as one sentence, and the reason only wants saying
       once at the end of it -- otherwise it is "to make room ... to make
       room", which is how a machine writes. */
    var first = changes[0].text.replace(/,? to make room\.$/, '').replace(/[.,]$/, '');
    return first + ', and ' + lowerFirst(changes[1].text);
  }
  function lowerFirst(t) { return t.charAt(0).toLowerCase() + t.slice(1); }

  function snapshotGroup() {
    return { group: slotGroup, slots: clone(draft.schedule[slotGroup]) };
  }

  /* The one way the drawer writes a schedule. Everything that can change a
     slot's times goes through here, so the draft is valid at every instant
     rather than at the save button. */
  function afterSlotEdit(anchor, before) {
    var r = Scheduler.settle(draft.schedule[slotGroup], draft.stations, anchor || null);
    draft.schedule[slotGroup] = r.slots;
    if (r.changes.length) showFix(fixText(r.changes), before);
    else if (before) clearFix();
    renderCounts();
    return r;
  }

  $('fixUndo').addEventListener('click', function () {
    if (!undoSnap) return;
    slotGroup = undoSnap.group;
    draft.schedule[slotGroup] = undoSnap.slots;
    openSlot = null;
    renderDrawer();
    renderSlotRows();
    showFix('Put back.', null);
    refreshSaveBtn();
  });

  var APPLIES = [
    { key: 'volume', flag: 'applyVolume', label: 'Volume', kind: 'range', min: 0, max: 100, home: 50, chip: 'vol' },
    { key: 'bass', flag: 'applyBass', label: 'Bass', kind: 'range', min: -12, max: 12, home: 0, chip: 'bass' },
    { key: 'treble', flag: 'applyTreble', label: 'Treble', kind: 'range', min: -12, max: 12, home: 0, chip: 'treble' },
    { key: 'theme', flag: 'applyTheme', label: 'Theme', kind: 'theme', home: 'dial', chip: 'theme' }
  ];

  function applyOn(slot, spec) {
    return spec.flag === 'applyVolume' ? slot.applyVolume !== false : !!slot[spec.flag];
  }
  function slotValue(slot, spec) {
    if (spec.kind === 'theme') return slot.theme || spec.home;
    return typeof slot[spec.key] === 'number' ? slot[spec.key] : spec.home;
  }
  function showValue(spec, v) {
    if (spec.kind === 'theme') {
      for (var i = 0; i < THEME_CARDS.length; i++) if (THEME_CARDS[i].key === v) return THEME_CARDS[i].label;
      return v;
    }
    if (spec.key === 'volume') return v + '%';
    return (v > 0 ? '+' : '') + v + ' dB';
  }

  function syncOpenSlots() {
    var kids = $('slotRows').children;
    for (var k = 0; k < kids.length; k++) {
      if (kids[k].className.indexOf('card') !== 0) continue;   // the empty hint
      kids[k].classList.toggle('is-open', kids[k].dataset.id === openSlot);
    }
  }

  /* The cards slide into their new order rather than being rebuilt, so a
     field keeps its focus and a listener keeps its card. Same measure,
     move, measure, invert as the station list, minus the folding: the card
     being edited has to stay open and in sight while it travels. */
  function reflowSlots() {
    var box = $('slotRows');
    var order = draft.schedule[slotGroup];
    var cards = {}, was = {};
    for (var i = 0; i < box.children.length; i++) {
      var c = box.children[i];
      if (!c.dataset || !c.dataset.id) continue;
      cards[c.dataset.id] = c;
      was[c.dataset.id] = c.getBoundingClientRect().top;
    }

    /* Moved only when it is in the wrong place, which it usually is not.
       appendChild on a node that is already in the document does not copy
       it, it MOVES it -- the browser detaches the subtree and puts it back
       -- and doing that between a mousedown and its mouseup throws the
       click away. Both land on the same element, at the same place, and no
       click event is ever dispatched.

       Which is how a slot switch came to need two presses. The first press
       moves focus out of whatever was focused, the card's focusout fires,
       its setTimeout(0) lands mid-press, and this loop re-inserted all
       fourteen unchanged cards. The press threw away its own click. The
       second press worked because focus was by then already inside the
       card, so no focusout, no reflow, nothing moved.

       It never showed up on the identical switch in Stations, which has no
       reflow behind it, and it survived every theory about animation and
       scrolling because the element really was exactly where it looked. */
    var moved = [];
    var prev = null;
    for (var j = 0; j < order.length; j++) {
      var card = cards[order[j].id];
      if (!card) continue;
      var shouldFollow = prev ? prev.nextSibling : box.firstChild;
      if (card !== shouldFollow) box.insertBefore(card, shouldFollow);
      prev = card;
      moved.push(card);
      delete cards[order[j].id];
    }
    // Anything the settle removed is no longer in the list.
    for (var gone in cards) if (cards.hasOwnProperty(gone)) cards[gone].remove();

    if (stillMotion()) return;
    for (var m = 0; m < moved.length; m++) {
      var dy = was[moved[m].dataset.id] - moved[m].getBoundingClientRect().top;
      if (!dy) continue;
      moved[m].style.transition = 'none';
      moved[m].style.transform = 'translateY(' + dy + 'px)';
    }
    void box.offsetWidth;
    for (var n = 0; n < moved.length; n++) {
      moved[n].style.transition = '';
      moved[n].style.transform = '';
      moved[n].classList.add('is-sliding');
    }
    setTimeout(function () {
      for (var q = 0; q < moved.length; q++) moved[q].classList.remove('is-sliding');
    }, SLIDE_MS);
  }

  /* Remove sits one small button away from the toggle that opens the card,
     and a slot carries times, a station and up to four applied settings
     with no undo behind it. So it asks, and the question names the slot
     rather than saying "are you sure" about nothing in particular. */
  var pendingSlotDelete = null;

  function askDeleteSlot(group, id) {
    var slot = (draft.schedule[group] || []).filter(function (x) { return x.id === id; })[0];
    if (!slot) return;
    pendingSlotDelete = { group: group, id: id };
    var st = draft.stations.filter(function (s) { return s.id === slot.stationId; })[0];
    $('slotDeleteWhat').textContent =
      (slot.start || '--:--') + ' to ' + (slot.end || '--:--') +
      (st && st.name ? ', ' + st.name : '') +
      ', on ' + (group === 'weekend' ? 'weekends' : 'weekdays') + '.';
    $('confirmSlot').showModal();
  }

  // Click, not close, for the same reason as the other two confirms.
  $('confirmSlot').addEventListener('click', function (e) {
    if (!e.target.closest('button[value="delete"]')) return;
    var target = pendingSlotDelete;
    pendingSlotDelete = null;
    if (!target) return;
    var slots = draft.schedule[target.group] || [];
    var at = -1;
    for (var i = 0; i < slots.length; i++) if (slots[i].id === target.id) { at = i; break; }
    if (at === -1) return;
    slots.splice(at, 1);
    openSlot = null;
    /* No note for this one. The dialog named the slot and asked; saying it
       again afterwards would be the app talking to itself. A slot that
       goes because an edit swallowed it is the other case, and that one is
       a consequence rather than a decision, so it gets the note. */
    clearFix();
    renderSlotRows();
    renderCounts();
    // A splice is not an input event, so the footer label has to be told.
    refreshSaveBtn();
  });

  /* What a slot says about itself beside its times, when it is not an
     ordinary span of one day. */
  function slotTag(slot) {
    var k = Scheduler.shapeOf(slot);
    if (!k) return '';
    if (k.kind === 'all') return 'all day';
    if (k.kind === 'wrap') return 'past midnight';
    return '';
  }

  function renderSlotRows() {
    var box = $('slotRows');
    box.innerHTML = '';
    var ends = $('dayEnd');
    if (ends) ends.value = (draft.scheduleEnds && draft.scheduleEnds[slotGroup]) === 'off' ? 'off' : 'play';

    var slots = draft.schedule[slotGroup];
    if (!slots.length) {
      var none = document.createElement('p');
      none.className = 'hint';
      none.textContent = 'No slots. Whatever you pick plays all day.';
      box.appendChild(none);
    }

    slots.forEach(function (slot) {
      var card = document.createElement('div');
      card.dataset.id = slot.id;
      card.className = 'card' + (slot.id === openSlot ? ' is-open' : '');
      var st = draft.stations.filter(function (x) { return x.id === slot.stationId; })[0];
      card.style.setProperty('--c', (st && st.color) || '#8a8a84');

      var chips = APPLIES.filter(function (spec) { return applyOn(slot, spec); })
        .map(function (spec) { return '<span class="chip">' + spec.chip + '</span>'; }).join('');

      card.innerHTML =
        /* Same shape as the station cards: the remove button cannot live
           inside the toggle button, or the parser lifts it out and its
           clicks never reach the header's listener. */
        '<div class="card-top">' +
          '<button type="button" class="card-toggle" data-act="toggle">' +
            '<span class="card-dot"></span>' +
            '<span class="card-name">' + escapeHtml(slot.start || '--:--') + ' to ' + escapeHtml(slot.end || '--:--') + '</span>' +
            '<span class="card-late">' + escapeHtml(slotTag(slot)) + '</span>' +
            '<span class="card-pill">' + escapeHtml(st ? (st.name || '(unnamed)') : 'Pick a station') + '</span>' +
            '<span class="chips">' + chips + '</span>' +
          '</button>' +
          '<span class="card-acts">' +
            '<button type="button" class="mini danger" data-act="del" aria-label="Remove">&times;</button>' +
          '</span>' +
        '</div>' +
        '<div class="card-fold">' +
        '<div class="card-body">' +
          '<div class="slot-inner">' +
            '<div class="slot-when">' +
              '<input class="in in-time" data-k="start" type="time" aria-label="Start" required' +
              ' data-tip="When this slot starts.">' +
              '<span class="to">to</span>' +
              '<input class="in in-time" data-k="end" type="time" aria-label="End" required' +
              ' data-tip="When this slot ends and hands over. The same time at both ends means all day.">' +
              '<select class="in" data-k="stationId" aria-label="Station"></select>' +
            '</div>' +
            '<p class="slot-note"></p>' +
            '<div class="slot-applies">' +
              '<span class="field-head">Apply when this slot starts</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '</div>';

      var sel = card.querySelector('[data-k="stationId"]');
      draft.stations.forEach(function (x) {
        var opt = new Option(x.name || '(unnamed)', x.id);
        if (x.id === slot.stationId) opt.selected = true;
        sel.appendChild(opt);
      });

      function paintHead() {
        card.querySelector('.card-name').textContent =
          (slot.start || '--:--') + ' to ' + (slot.end || '--:--');
        card.querySelector('.card-late').textContent = slotTag(slot);
        var note = card.querySelector('.slot-note');
        var k = Scheduler.shapeOf(slot);
        if (k && k.kind === 'wrap') {
          note.textContent = 'Runs past midnight. It counts as a ' +
            (slotGroup === 'weekend' ? 'weekend' : 'weekday') + ' slot because it starts on one.';
          note.hidden = false;
        } else if (k && k.kind === 'all') {
          note.textContent = 'Both times the same, so this plays all day.';
          note.hidden = false;
        } else {
          note.hidden = true;
        }
      }
      paintHead();

      var times = card.querySelectorAll('.slot-when .in');
      for (var t = 0; t < times.length; t++) {
        times[t].value = slot[times[t].dataset.k] != null ? slot[times[t].dataset.k] : '';

        /* Before the first keystroke, not on each one, so undoing lands on
           what was there rather than on a half-typed value passed through
           on the way. */
        times[t].addEventListener('focus', function () { pendingSnap = snapshotGroup(); });

        times[t].addEventListener('input', function (e) {
          var k = e.target.dataset.k;
          if (k === 'stationId') {
            slot.stationId = e.target.value;
            /* Times have not moved, so nothing needs settling and nothing
               needs to move. Patched where it stands: a re-render here
               would throw away the note the last edit just put up. */
            var picked = draft.stations.filter(function (x) { return x.id === slot.stationId; })[0];
            card.style.setProperty('--c', (picked && picked.color) || '#8a8a84');
            card.querySelector('.card-pill').textContent = picked ? (picked.name || '(unnamed)') : 'Pick a station';
            refreshSaveBtn();
            return;
          }

          /* A time input reads empty until every part of it is filled in,
             so half a time is not a change -- it is the middle of typing
             one, and writing it through would blank the header. */
          if (Scheduler.parseHHMM(e.target.value) === null) return;

          var before = pendingSnap || snapshotGroup();
          slot[k] = e.target.value;
          paintHead();

          var r = afterSlotEdit(slot, before);
          /* The cards are not reordered here. The field still has the
             cursor in it, and moving its card out from under the pointer
             mid-edit is the one thing that would make this feel unsafe.
             Whatever else moved is patched where it stands; the order
             catches up when the card is left. */
          r.changes.forEach(function (c) {
            var other = box.querySelector('[data-id="' + c.id + '"]');
            if (!other || other === card) return;
            /* Struck through rather than taken away. Its slot has gone
               and the card must not go on claiming otherwise, but pulling
               it out from under a field that still has the cursor in it
               would move everything below -- including, sometimes, the
               field being typed into. It leaves at the reflow. */
            if (c.kind === 'removed') { other.classList.add('is-going'); return; }
            var nameEl = other.querySelector('.card-name');
            if (nameEl) nameEl.textContent = c.slot.start + ' to ' + c.slot.end;
            var lateEl = other.querySelector('.card-late');
            if (lateEl) lateEl.textContent = slotTag(c.slot);
            var ins = other.querySelectorAll('.slot-when .in-time');
            for (var q = 0; q < ins.length; q++) ins[q].value = c.slot[ins[q].dataset.k];
            other.classList.remove('is-touched');
            void other.offsetWidth;
            other.classList.add('is-touched');
          });
          refreshSaveBtn();
        });
      }

      /* Leaving the card is when the list catches up. Anything half-typed
         springs back to what the slot actually holds, so a field can never
         be left showing something the schedule does not have. */
      card.addEventListener('focusout', function (e) {
        if (card.contains(e.relatedTarget)) return;
        setTimeout(function () {
          if (card.contains(document.activeElement)) return;
          var ins = card.querySelectorAll('.slot-when .in-time');
          for (var q = 0; q < ins.length; q++) ins[q].value = slot[ins[q].dataset.k] || '';
          pendingSnap = null;
          reflowSlots();
        }, 0);
      });

      var applies = card.querySelector('.slot-applies');
      APPLIES.forEach(function (spec) {
        var on = applyOn(slot, spec);
        var v = slotValue(slot, spec);
        var row = document.createElement('div');
        row.className = 'apply-row' + (on ? '' : ' is-off');

        var control = spec.kind === 'theme'
          ? '<select class="in" data-role="value" aria-label="' + spec.label + '">' +
              THEME_CARDS.map(function (th) {
                return '<option value="' + th.key + '"' + (th.key === v ? ' selected' : '') + '>' + th.label + '</option>';
              }).join('') + '</select>'
          : '<input type="range" data-role="value" min="' + spec.min + '" max="' + spec.max + '" value="' + v + '" aria-label="' + spec.label + '">';

        row.innerHTML =
          '<label class="switch">' +
            '<input type="checkbox" data-role="flag"' + (on ? ' checked' : '') + '>' +
            '<span class="switch-track" aria-hidden="true"></span>' +
            '<span class="switch-text">' + spec.label + '</span>' +
          '</label>' +
          control +
          (spec.kind === 'theme' ? '' : '<span class="apply-val"></span>');

        var flag = row.querySelector('[data-role="flag"]');
        var value = row.querySelector('[data-role="value"]');
        var out = row.querySelector('.apply-val');
        if (out) out.textContent = showValue(spec, v);

        flag.addEventListener('change', function () {
          slot[spec.flag] = flag.checked;
          row.classList.toggle('is-off', !flag.checked);
          renderSlotChips(card, slot);
        });
        value.addEventListener('input', function () {
          var next = spec.kind === 'theme' ? value.value : +value.value;
          slot[spec.key === 'theme' ? 'theme' : spec.key] = next;
          if (out) out.textContent = showValue(spec, next);
        });
        if (spec.kind === 'range') {
          value.addEventListener('pointerdown', function () { stopGlide(value); });
          value.addEventListener('dblclick', function () {
            glide(value, spec.home, function (v) {
              value.value = Math.round(v);
              if (out) out.textContent = showValue(spec, Math.round(v));
            }, function () {
              slot[spec.key] = spec.home;
            });
          });
        }

        applies.appendChild(row);
      });

      card.querySelector('.card-top').addEventListener('click', function (e) {
        var hit = e.target.closest('[data-act]');
        var act = hit ? hit.dataset.act : 'toggle';
        if (act === 'del') { askDeleteSlot(slotGroup, slot.id); return; }
        openSlot = slot.id === openSlot ? null : slot.id;
        // Only the class changes, so the fold has something to animate.
        syncOpenSlots();
      });

      box.appendChild(card);
    });
  }

  function renderSlotChips(card, slot) {
    card.querySelector('.chips').innerHTML = APPLIES
      .filter(function (spec) { return applyOn(slot, spec); })
      .map(function (spec) { return '<span class="chip">' + spec.chip + '</span>'; }).join('');
  }

  $('dayEnd').addEventListener('change', function () {
    if (!draft) return;
    if (!draft.scheduleEnds) draft.scheduleEnds = { weekday: 'play', weekend: 'play' };
    draft.scheduleEnds[slotGroup] = this.value === 'off' ? 'off' : 'play';
    refreshSaveBtn();
  });

  $('addSlot').addEventListener('click', function () {
    var slots = draft.schedule[slotGroup];
    /* Where it goes is worked out from what is free, not chained off
       whichever slot happens to be last in the array. That chaining is
       what produced a slot starting and ending at 23:00 on the third
       press -- which under the old reading matched nothing at all and was
       refused at the save. */
    var home = Scheduler.suggestSlot(slots);
    if (!home) {
      showFix('The day is full. Shorten a slot to make room for another.', null);
      return;
    }
    var fresh = {
      id: slotId(),
      start: home.start, end: home.end,
      stationId: draft.stations[0] ? draft.stations[0].id : '',
      // From the draft, not the live radio: this is what is being edited.
      volume: draft.volume != null ? draft.volume : state.volume, applyVolume: true,
      bass: 0, applyBass: false,
      treble: 0, applyTreble: false,
      theme: draft.theme || state.theme, applyTheme: false
    };
    slots.push(fresh);
    openSlot = fresh.id;
    clearFix();
    afterSlotEdit(fresh, null);
    renderSlotRows();
    renderCounts();
    var card = $('slotRows').querySelector('[data-id="' + fresh.id + '"]');
    if (card) {
      card.classList.add('is-new');
      if (card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
      var first = card.querySelector('.in-time');
      if (first) first.focus();
    }
  });

  /* ---------- station finder ----------
     City goes to open-meteo for coordinates, then radio-browser lists the
     stations near them. Both are public, key-free and CORS-open. */
  var finder = { city: null, cityTimer: null, stationTimer: null, cityAbort: null, stationAbort: null };

  function finderStatus(text, bad) {
    var box = $('finderStatus');
    box.textContent = text;
    box.className = 'finder-status' + (bad ? ' bad' : '');
  }

  $('finderToggle').addEventListener('click', function () {
    var open = this.getAttribute('aria-expanded') === 'true';
    this.setAttribute('aria-expanded', open ? 'false' : 'true');
    $('finderBody').hidden = open;
    if (!open) $('cityInput').focus();
  });

  function resetFinder() {
    finder.city = state.lastCity || null;
    $('cityInput').value = finder.city ? finder.city.label : '';
    $('stationInput').value = '';
    $('cityMenu').hidden = true;
    $('cityMenu').innerHTML = '';
    $('finderResults').innerHTML = '';
    finderStatus(finder.city
      ? 'Searching near ' + finder.city.label + '. Type a station name or frequency.'
      : 'Pick a city, then search by name or frequency.');
  }

  function debounce(slot, fn, ms) { clearTimeout(finder[slot]); finder[slot] = setTimeout(fn, ms); }
  function abortable(slot) {
    if (finder[slot]) finder[slot].abort();
    finder[slot] = typeof AbortController === 'function' ? new AbortController() : null;
    return finder[slot] ? finder[slot].signal : undefined;
  }

  $('cityInput').addEventListener('input', function () {
    var q = this.value.trim();
    finder.city = null;
    if (q.length < 2) { $('cityMenu').hidden = true; return; }
    debounce('cityTimer', function () {
      Directory.findCities(q, abortable('cityAbort')).then(function (cities) {
        var menu = $('cityMenu');
        menu.innerHTML = '';
        if (!cities.length) { menu.hidden = true; finderStatus('No place found called ' + q + '.'); return; }
        cities.forEach(function (c) {
          var li = document.createElement('li');
          li.textContent = c.label;
          li.addEventListener('mousedown', function (e) {
            e.preventDefault();
            finder.city = c;
            state.lastCity = c;
            save();
            $('cityInput').value = c.label;
            menu.hidden = true;
            runStationSearch();
          });
          menu.appendChild(li);
        });
        menu.hidden = false;
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        finderStatus('City lookup failed. Check the network, or type the stream URL by hand below.', true);
      });
    }, 320);
  });
  $('cityInput').addEventListener('blur', function () { setTimeout(function () { $('cityMenu').hidden = true; }, 120); });
  $('stationInput').addEventListener('input', function () { debounce('stationTimer', runStationSearch, 380); });

  function runStationSearch() {
    var opts = { name: $('stationInput').value.trim(), limit: 25 };
    if (finder.city) {
      opts.lat = finder.city.lat;
      opts.lon = finder.city.lon;
      opts.region = finder.city.region;
      opts.countryCode = finder.city.countryCode;
      opts.radiusKm = 60;
      /* The city goes in every found station's tagline. A city remembered
         by a version that did not keep the bare name has only the label,
         "Toronto, Ontario, Canada", whose first part is the city. */
      opts.cityName = finder.city.name || String(finder.city.label || '').split(',')[0].trim();
    }
    if (!opts.name && !finder.city) {
      $('finderResults').innerHTML = '';
      finderStatus('Pick a city, then search by name or frequency.');
      return;
    }
    finderStatus('Searching...');
    Directory.findStations(opts, abortable('stationAbort')).then(renderResults).catch(function (err) {
      if (err && err.name === 'AbortError') return;
      $('finderResults').innerHTML = '';
      finderStatus('Could not reach the station directory. Type the stream URL by hand below.', true);
    });
  }

  function renderResults(list) {
    var box = $('finderResults');
    box.innerHTML = '';
    if (!list.length) {
      finderStatus('Nothing found. Try a shorter name, or clear the city to search everywhere.');
      return;
    }
    finderStatus(list.length + ' found. Add the one you want, then press Save.');
    list.forEach(function (s) {
      var li = document.createElement('li');
      li.className = 'result' + (s.playable ? '' : ' is-unplayable');
      /* Call sign, then what band it is on, then the rest. The name
         almost always opens with the call sign when the directory has
         one, so repeating it there would only say what is already on the
         line above; it earns its place when it is buried instead. The
         band slot always says something, because "no frequency" is itself
         the useful fact about an internet-only station. Distance is still
         what ranks the list, it is just not worth a column. */
      var meta = [];
      var opens = String(s.name || '').trim().split(/[^A-Za-z0-9-]+/)[0].toUpperCase();
      if (s.callSign && s.callSign !== opens) meta.push(s.callSign);
      meta.push(s.band || 'Internet stream');
      if (s.tag) meta.push(s.tag);
      if (!s.playable) meta.push('playlist file, may not play');
      li.appendChild(span('result-name', s.name || 'Unnamed station'));
      li.appendChild(span('result-meta', meta.join(' \u00b7 ')));
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'result-add';
      btn.textContent = s.playable ? 'Add station' : 'Add anyway';
      tipOn(btn, s.playable ? '' : 'This link is a playlist file listing streams, not a stream, so it may not play. Adding it is still worth a try.');
      btn.addEventListener('click', function () {
        if (!addFoundStation(s)) return;
        li.classList.add('is-added');
        btn.textContent = 'Added';
        btn.disabled = true;
      });
      li.appendChild(btn);
      box.appendChild(li);
    });
  }

  function addFoundStation(s) {
    if (!draft) return false;
    var clash = draft.stations.filter(function (x) { return x.url === s.url; })[0];
    if (clash) { finderStatus(s.name + ' is already on the list.'); return false; }
    var entry = {
      id: s.id, name: s.name, band: s.band, tag: s.tag, url: s.url,
      color: Directory.pickColour(draft.stations.length), bass: 0, treble: 0
    };
    draft.stations = Directory.placeStation(draft.stations, entry);
    renderStationRows();
    renderSlotRows();
    renderCounts();
    finderStatus('Added ' + s.name + '. Press Save to keep it.');

    // Take the colour from the station artwork where the host allows it.
    if (s.favicon) {
      Directory.logoColour(s.favicon).then(function (hex) {
        if (!hex || !draft) return;
        if (draft.stations.indexOf(entry) === -1) return;
        entry.color = hex;
        renderStationRows();
      });
    }
    return true;
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function draftIsValid() {
    var msg = $('saveMsg');
    clearFieldMarks();
    if (!draft.stations.length) { msg.textContent = 'Keep at least one station.'; msg.className = 'save-msg bad'; return false; }

    /* Every offending field is marked, not only the first: a station
       missing both a name and an address used to be reported as one
       problem, fixed, and then refused again for the other. The first is
       the one that gets the cursor. */
    var bad = 0, firstAt = -1, firstKey = '';
    function blame(at, id, key, why) {
      markField(id, key, why);
      bad += 1;
      if (firstAt === -1) { firstAt = at; firstKey = key; }
    }
    for (var i = 0; i < draft.stations.length; i++) {
      var s = draft.stations[i];
      var nm = String(s.name || '').trim(), u = String(s.url || '').trim();
      if (!nm) blame(i, s.id, 'name', 'A name is needed.');
      if (!u) blame(i, s.id, 'url', 'A stream address is needed.');
      else if (!/^https?:\/\/\S+$/i.test(u)) blame(i, s.id, 'url', 'This needs to start with http:// or https://.');
    }
    if (bad) {
      msg.textContent = bad === 1 ? 'One field needs your attention.' : bad + ' fields need your attention.';
      msg.className = 'save-msg bad';
      showPane('stations', true);
      // Opens the card, paints every mark, and lands in the first of them.
      focusStationField(firstAt, firstKey);
      return false;
    }
    // Trimmed only once nothing is being refused, so a rejected save never
    // rewrites what is still in front of the listener.
    for (var t = 0; t < draft.stations.length; t++) {
      draft.stations[t].name = String(draft.stations[t].name || '').trim();
      draft.stations[t].url = String(draft.stations[t].url || '').trim();
    }
    /* Nothing here about the schedule any more. Every path that can write
       one goes through settle, so by the time the save button is pressed
       there is no such thing as an invalid schedule to refuse -- which is
       the whole point of the four changes before this one. */
    return true;
  }

  /* What goes in the frequency field of a station that has no transmitter.
     Deliberately words rather than a blank: blank reads as unfinished, and
     somebody coming back to the list a month later cannot tell whether
     they forgot to fill it in or there was nothing to fill in. */
  var WEB_STREAM = 'Web stream';

  /* Most stations carry their own frequency in their name -- NewsTalk 1010,
     KISS 92.5, 98.1 CHFI -- and the directory already knows how to read one
     out of a string, which is how a station added from the finder gets its
     dial position. The same reading is applied here to the ones typed in by
     hand or added before that existed.

     The codec and bitrate come off first. A name the finder wrote reads
     "BBC World Service AAC+ ... 101 kbps", and 101 sits squarely in the FM
     band, so left in place it would be read as 101 FM -- a real-looking
     frequency invented out of a bitrate, which is worse than no frequency
     at all. */
  function bandFromOwnName(name) {
    var clean = String(name == null ? '' : name)
      .split('·')[0]
      .replace(/(aac[+]?|mp3|ogg|opus|flac|he-aac|hls)/ig, ' ')
      .replace(/[0-9]+ ?kbps/ig, ' ')
      .replace(/ +/g, ' ')
      .trim();
    if (!clean) return '';
    try { return Directory.bandFromName(clean) || ''; } catch (e) { return ''; }
  }

  function stationsWithoutBand() {
    return draft.stations.filter(function (s) { return !String(s.band || '').trim(); });
  }

  /* The full length of the Saved plate: up, held, and away again. The
     drawer closes on the same number, so the two cannot drift apart. */
  var SAVED_PLATE_MS = 700;

  function commitSettings() {
    var msg = $('saveMsg');
    state.stations = draft.stations;
    /* Settled once more on the way out. It should find nothing -- every
       path into the draft has already been through the gate -- and if it
       ever does, that is a defect here rather than the listener's doing,
       so what it changed is said rather than written in silently. */
    var lateFixes = [];
    ['weekday', 'weekend'].forEach(function (g) {
      var r = Scheduler.settle(draft.schedule[g], draft.stations, null);
      draft.schedule[g] = r.slots;
      r.changes.forEach(function (c) { lateFixes.push(c.text); });
    });
    state.schedule = draft.schedule;
    state.scheduleEnds = draft.scheduleEnds;
    state.scheduleV = 2;
    clearFieldMarks();
    /* Normally nothing, and then the note goes with the rest of the visit.
       If the belt-and-braces settle did find something, that is a defect
       here rather than the listener's doing, and it is said rather than
       written in behind their back. */
    if (lateFixes.length) showFix(lateFixes.join(' '), null);
    else clearFix();
    state.theme = draft.theme;
    state.autoplay = !!draft.autoplay;
    state.autoplayStationId = draft.autoplayStationId;

    /* Nothing in the drawer edits these, so the only way they can differ
       is that a file was imported. The schedule switch lives outside the
       drawer, on the chip, and has to be told. */
    if (!!draft.schedulerEnabled !== !!state.schedulerEnabled) {
      state.schedulerEnabled = !!draft.schedulerEnabled;
      el.schedToggle.setAttribute('aria-pressed', state.schedulerEnabled);
      el.schedLabel.textContent = state.schedulerEnabled ? 'Schedule on' : 'Schedule off';
    }
    state.bass = draft.bass;
    state.treble = draft.treble;
    if (draft.volume !== state.volume) setVolume(draft.volume, true);

    if (!station(state.currentStationId)) state.currentStationId = state.stations[0].id;
    if (state.lastGood && !station(state.lastGood.stationId)) state.lastGood = null;
    save(); applyLook(); renderPresets(); renderStation(currentStation());
    lastSlot = null; seenOnce = false; tick();
    draftClean = draftSnapshot();
    // Deliberately no refreshSaveBtn() here: the drawer is closing, and
    // flipping the label back to Close under the cursor reads as a second,
    // different button. openSettings() resets it on the next visit.
    msg.textContent = 'Saved'; msg.className = 'save-msg good is-exit';

    /* Schedules are built one after another -- that is the shape of the
       task, an evening laid out slot by slot -- so saving from that tab
       keeps the drawer open and the tab where it was. The cards all fold
       shut, which is the thing a list of finished slots should look like
       and also clears the way for the next one. Everywhere else, saving is
       the end of the visit and the drawer goes.

       The button flips to Close on its own, because refreshSaveBtn reads
       the draft and the draft is now clean. */
    if (pane === 'schedule' || pane === 'stations') {
      /* Folded shut rather than re-rendered. A fresh render would draw the
         cards already closed, which is the same picture arrived at by a
         jump -- and the fold is the thing worth watching, because it is
         what says the work was taken. */
      openSlot = null;
      openStation = null;
      syncOpenSlots();
      syncOpenCards();
      refreshSaveBtn();
      return;
    }
    // Matches save-msg-cycle, so the drawer goes as the plate drops away.
    setTimeout(function () { if (el.settings.open) el.settings.close(); }, SAVED_PLATE_MS);
  }

  $('saveBtn').addEventListener('click', function () {
    // Nothing changed, so this is just a way out of the drawer.
    if (!draftIsDirty()) { el.settings.close(); return; }
    if (!draftIsValid()) return;
    /* No longer a question. A station with no frequency is nearly always
       an internet-only one, and the old dialog stopped the save to ask
       about something the answer to which was almost always "it hasn't
       got one". So it is filled in, the save goes through, and the dialog
       only reports what was done -- with a way to correct it for the
       minority that do broadcast. */
    var missing = stationsWithoutBand();
    if (!missing.length) { commitSettings(); return; }

    /* Read it out of the name where it is there, and call it a web stream
       where it is not. Either way the save goes through: the old dialog
       stopped to ask a question whose answer was almost always "it hasn't
       got one", and for the rest it was sitting in the name all along. */
    var guessed = [], unknown = [];
    missing.forEach(function (st) {
      var band = bandFromOwnName(st.name);
      if (band) { st.band = band; guessed.push(st); }
      else { st.band = WEB_STREAM; unknown.push(st); }
    });
    renderStationRows();

    /* Nothing to report when every one of them was readable: a frequency
       taken from the station's own name is not news. */
    if (!unknown.length) { commitSettings(); return; }
    $('bandMissingList').textContent = unknown.length === 1
      ? (unknown[0].name || 'One station') + ' has no frequency in its name, so it is down as a web stream.'
      : unknown.length + ' stations have no frequency in their names, so they are down as web streams: ' +
        unknown.map(function (s) { return s.name || 'unnamed'; }).join(', ') + '.';
    $('confirmBand').showModal();
  });

  $('confirmBand').addEventListener('close', function () {
    if (this.returnValue === 'save') { commitSettings(); return; }
    // Send them to the first frequency field that needs filling in. With the
    // cards collapsed that means opening the right one first.
    showPane('stations', true);
    /* The one to correct is the one just added, which is the last in the
       list -- so the list goes to the bottom and the cursor lands in the
       field, rather than leaving somebody to scroll and hunt for which of
       their stations it meant. Searched from the end for the same reason. */
    for (var i = draft.stations.length - 1; i >= 0; i--) {
      if (String(draft.stations[i].band || '').trim() !== WEB_STREAM) continue;
      focusStationField(i, 'band', true);
      break;
    }
  });

  /* The x and Esc both throw the draft away, so both have to ask when
     there is one worth keeping. Save is not offered here: the footer
     button is the way to save, and this question is about leaving. */
  function closeDrawer() {
    if (!draftIsDirty()) { el.settings.close(); return; }
    $('confirmDiscard').showModal();
  }
  $('drawerClose').addEventListener('click', closeDrawer);

  el.settings.addEventListener('cancel', function (e) {
    if (!draftIsDirty()) return;
    e.preventDefault();
    $('confirmDiscard').showModal();
  });

  /* The click, not the close event. Measured in Chrome: submitting this
     nested dialog's form sets returnValue and closes it synchronously
     without ever firing close, so a close listener here never runs. The
     drawer is then shut on a fresh task, because closing it while the top
     layer is still unwinding is ignored — the same hop commitSettings()
     already makes. Esc and "Keep editing" match nothing and do nothing. */
  $('confirmDiscard').addEventListener('click', function (e) {
    if (!e.target.closest('button[value="discard"]')) return;
    setTimeout(function () { if (el.settings.open) el.settings.close(); }, 0);
  });

  el.settings.addEventListener('close', applyLook);

  function resetEverything() {
    if (state.intendedPlaying) stopPlayback();
    // Defaults are not floating above everything.
    unpin(false);
    /* Which settings file this profile has already read is not a setting,
       and clearing it would undo the reset at the next launch: the export
       beside index.html would look new again and be imported straight back
       over the defaults. Reset means forget what I chose, not forget that
       I have seen that file. */
    var seenSeed = state.seedStamp, seenFrom = state.seedFrom;
    try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
    state = clone(DEFAULTS);
    state.seedStamp = seenSeed;
    state.seedFrom = seenFrom;
    noCors = {};
    provenCors = {};
    save();
    applyLook();
    renderPresets();
    setVolume(state.volume, true);
    applyTone();
    el.schedToggle.setAttribute('aria-pressed', state.schedulerEnabled);
    /* Read off the state rather than written out. It said "Schedule on"
       while the switch it labels was being set to off, because the default
       is off -- so a reset left the chip claiming the opposite of what it
       was doing, until something else happened to redraw it. */
    el.schedLabel.textContent = state.schedulerEnabled ? 'Schedule on' : 'Schedule off';
    var st = currentStation();
    if (st) renderStation(st);
    lastSlot = null; seenOnce = false;
    tick();
    draft = null;
    if (el.settings.open) el.settings.close();

    el.tuner.classList.remove('is-resetting');
    void el.tuner.offsetWidth;
    el.tuner.classList.add('is-resetting');
    clearTimeout(resetAnim);
    resetAnim = setTimeout(function () { el.tuner.classList.remove('is-resetting'); }, 1000);
  }
  var resetAnim;

  /* ---------- version check ----------
     One request a day to a static file on the repo, which is the whole of
     it: no identifiers go out, nothing is downloaded or installed, and the
     answer is a version string the listener can act on or ignore. The file
     sits on raw.githubusercontent.com rather than the API because that has
     no rate limit worth worrying about and sends the header a page opened
     from disk needs. Off in one click, and then nothing is ever sent. */
  var VERSION_URL = 'https://raw.githubusercontent.com/Markticulous/deskside-radio/main/version.json';
  var RELEASES_URL = 'https://github.com/Markticulous/deskside-radio/releases/latest';
  /* One link, and it is the same one the release page hands a first-time
     installer. That is the point: installing and updating stop being two
     procedures to explain and become one sentence. `latest` and not a
     version, or it freezes at whatever release wrote it.

     The installer works out the rest. With no index.html beside it -- and
     there is none in a Downloads folder -- it goes to the folder it
     installed to, which is an update.

     Offered only on Windows, because it is a .cmd. The radio runs just as
     well on a Mac and on Linux, where handing somebody a batch file is
     worse than saying nothing: it is an instruction that cannot be
     followed, from an app that ought to know better. */

  /* Windows or not, and nothing finer. The question is only ever whether
     to offer a .cmd, so the two answers are "yes" and "everything else".

     Asked in order of how much each source can be trusted, and it defaults
     to not-Windows whenever none of them is sure. Being wrong that way
     costs a Windows user one extra click through a page that works; being
     wrong the other way hands a Mac a file it cannot run. */
  function onWindows() {
    try {
      var d = navigator.userAgentData;
      if (d && d.platform) return d.platform === 'Windows';
      if (navigator.platform) return /^win/i.test(navigator.platform);
      return /Windows/i.test(navigator.userAgent || '');
    } catch (e) { return false; }
  }
  /* Six hours rather than a day. The radio is built to be left open for
     days at a time, which is the only case where the interval matters at
     all -- four requests a day to one static file against one. */
  var CHECK_EVERY = 6 * 60 * 60 * 1000;
  /* Opening the radio is the one moment the answer is actually wanted, so
     a launch does not wait out the six hours. It is not a free-for-all
     either: reopening the window four times in a minute should ask once.
     Ten minutes is long enough to cover that and short enough that a
     release published this morning is known about by this afternoon. */
  var BOOT_FLOOR = 10 * 60 * 1000;

  // 1.2.10 is newer than 1.2.9, which a string compare gets wrong.
  function newerThan(a, b) {
    var x = String(a || '').split('.'), y = String(b || '').split('.');
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var d = (parseInt(x[i], 10) || 0) - (parseInt(y[i], 10) || 0);
      if (d) return d > 0;
    }
    return false;
  }

  /* The block is shown only where it means something. On a machine with
     animation left on, a switch offering to re-enable scrolling that is
     already scrolling reads as a fault in the app. */
  function paintMotion() {
    var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var block = $('motionBlock');
    if (block) block.hidden = !reduced;
    var box = $('scrollAnyway');
    if (box) box.checked = !!state.scrollAnyway;
    document.documentElement.classList.toggle('scroll-anyway', reduced && !!state.scrollAnyway);
  }

  function updateAvailable() {
    return !!(state.versionLatest && newerThan(state.versionLatest, APP_VERSION));
  }

  /* What is on disk, as against what is running.

     Those come apart exactly once, and it is the case worth knowing about:
     the launcher has fetched a new version in the background while this
     window carried on playing the old one. Until the radio is opened again
     the files on disk are ahead of the page reading them.

     A page opened from a disk cannot fetch and cannot read a file. It can
     load a script, which is the same door the settings seed beside
     index.html comes through, so the build writes the number out as a line
     of JavaScript as well as the line of text the batch file reads.

     Measured rather than hoped for: a second read comes back with the new
     contents, and file:// does not serve it from cache. The query string
     is belt and braces for anything that would.

     null for a folder with no assets/version.js -- an install older than
     this, or an archive taken apart by hand. Not knowing reads as nothing
     pending, which is the safe way round: the reader is told the update
     will arrive on its own, which is true, rather than being sent to close
     a radio for an update that is not there. */
  function readDiskVersion() {
    return new Promise(function (res) {
      var s = document.createElement('script');
      s.src = 'assets/version.js?' + Date.now();
      s.onload = function () { s.remove(); res(window.DESKSIDE_ON_DISK || null); };
      s.onerror = function () { s.remove(); res(null); };
      document.head.appendChild(s);
    });
  }

  /* Asked at the moment of the click and never cached, because the whole
     point is that it changes under a window left open all afternoon. */
  function openUpdateNotice() {
    var box = $('updateReady');
    if (!box) return;
    var changes = $('updateReadyChanges');
    if (changes) changes.href = RELEASES_URL;

    readDiskVersion().then(function (disk) {
      var pending = !!(disk && newerThan(disk, APP_VERSION));
      var cancel = $('updateReadyCancel');
      var go = $('updateReadyGo');

      if (pending) {
        $('updateReadyTitle').textContent = 'Update pending';
        $('updateReadyBody').textContent =
          'Version ' + disk + ' update is pending on this machine. ' +
          'Close the radio and open it again to apply the update.';
        $('updateSteps').hidden = true;
        cancel.hidden = false;
        go.textContent = 'Close the radio';
        go.value = 'close';
      } else {
        $('updateReadyTitle').textContent = 'Update on the way';
        /* The number comes from the same check that put the notice on the
           screen, so it is always there in practice. Named anyway, because
           "Version  has been published" is what the missing case reads
           like and it is one word to avoid. */
        $('updateReadyBody').textContent =
          (state.versionLatest ? 'Version ' + state.versionLatest : 'A newer version') +
          ' has been published on GitHub. ' +
          'The radio app fetches it by itself the next time you open it, and runs ' +
          'it the time after. Nothing to do.';
        /* The "time after" is the part that reads as a fault rather than a
           design unless the reason is given, and it is given as a picture:
           published, fetched at the next launch, running at the one after. */
        var v = state.versionLatest || '';
        $('stepVerA').textContent = v;
        $('stepVerB').textContent = v;
        $('updateSteps').hidden = false;
        cancel.hidden = true;
        go.textContent = 'Got it';
        go.value = 'ok';
      }
      box.showModal();
      /* Focus put where the answer is, not where the tab order happens to
         start. showModal focuses the first focusable thing it finds, which
         is the "See what changed" link -- so the link wore the focus ring,
         looked like the default action, and WAS the default action: Enter
         opened a releases page instead of doing the thing the dialog is
         asking about. */
      go.focus();
    });
  }

  /* True only while a request is actually out. The button reads its state
     from this rather than being switched on and off by hand at each call
     site, which is how one of them ends up forgetting. */
  var checking = false;

  function syncCheckNow() {
    var b = $('checkNow');
    if (!b) return;
    b.disabled = checking || !state.versionCheck;
    b.textContent = checking ? 'Checking…' : 'Check now';
  }

  /* Year, month, day rather than the locale's own order. This line is read
     beside a version number, and 9/14/2026 is a different date in half the
     world. */
  function isoDay(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* The pill on the face of the radio, shown by exactly the test the
     Service line uses, so the two can never disagree about whether there
     is something to fetch. */
  function syncUpdatePill() {
    var pill = $('updatePill');
    if (!pill) return;
    var on = updateAvailable();
    /* Two different questions. The gear is marked for as long as the
       update exists and has not been installed -- that is a fact about
       the machine and the x does not get a vote on it. The pill is the
       announcement, and an announcement you have read should be able to
       stop talking until there is news again. */
    pill.hidden = !on || !!state.versionPillOff;
    var gear = $('openSettings');
    if (gear) gear.classList.toggle('has-update', on);
    /* And the tab, so the mark on the gear leads somewhere rather than
       leaving the drawer to be searched. Same fact, one level down. */
    var tab = $('tabService');
    if (tab) tab.classList.toggle('has-update', on);
    if (!on) return;
    var link = $('updatePillLink');
    if (link) {
      link.href = RELEASES_URL;
      tipOn(link, 'Version ' + state.versionLatest + ' has been published. Running ' + APP_VERSION + '.');
    }
  }

  function renderUpdateLine(note) {
    syncCheckNow();
    syncUpdatePill();
    var line = $('updateLine');
    if (!line) return;
    line.className = 'update-line';
    if (note) { line.textContent = note; return; }
    if (!state.versionCheck) { line.textContent = 'Checking is off. Nothing is sent.'; return; }

    var running = 'Running ' + escapeHtml(APP_VERSION);
    if (updateAvailable()) {
      line.className = 'update-line is-new';
      /* On Windows this line no longer asks for anything, because there
         is nothing to ask for: the opener fetches the new version at the
         next launch by itself. So it reports rather than instructs.

         Every version of this line that named a route was wrong for
         somebody. The Start menu entry only exists where the installer
         made one, so an archive unzipped by hand was sent to find
         something that had never been created. Naming the file, the Start
         menu entry and the way to reach the folder all at once left the
         reader to work out which of the three was theirs. A download link
         cost two security prompts that the copy already in the app folder
         costs none of. The pane above holds all of that now, for the few
         who have turned the updating off or will not wait for it.

         "it installs itself" is a promise, so it has to be true for
         somebody who switched it off -- and it is not. It is left as it
         is: the switch is a file in the app folder, put there by a script,
         and a page opened from a disk cannot see whether it exists. The
         pane above says how to turn it off two paragraphs from here,
         which is where somebody who did it will be looking.

         Off Windows there is no opener doing this and the releases page is
         the whole answer, so that branch is one link -- the page it lands
         on is also the page that says what changed. */
      var head = running + ' · <b class="new-ver">New v' + escapeHtml(state.versionLatest) + ' available</b> · ';
      line.innerHTML = onWindows()
        ? head + 'it installs itself · ' +
          '<a href="' + RELEASES_URL + '" target="_blank" rel="noopener">what changed</a>'
        : head +
          '<a href="' + RELEASES_URL + '" target="_blank" rel="noopener"><b>get it from GitHub</b></a>';
      return;
    }
    /* Never checked reads differently from checked and found nothing, and
       that difference is most of what this line is for. */
    line.innerHTML = state.versionLastCheck
      ? running + ' · last checked ' + isoDay(state.versionLastCheck) + ' · <b>Up to date</b>'
      : running + ' · not checked yet';
  }

  /* `floor` is how long ago a check has to have been for this one to be
     worth making. It defaults to the six hours, and a launch passes its
     own much shorter one. `force` ignores both and is what Check now is. */
  function checkVersion(force, floor) {
    if (!state.versionCheck) { renderUpdateLine(); return; }
    var wait = floor == null ? CHECK_EVERY : floor;
    if (!force && Date.now() - (state.versionLastCheck || 0) < wait) { renderUpdateLine(); return; }
    if (typeof fetch !== 'function') return;
    checking = true;
    renderUpdateLine('Asking GitHub…');
    fetch(VERSION_URL, { cache: 'no-store' }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (data) {
      checking = false;
      state.versionLastCheck = Date.now();
      if (data && typeof data.version === 'string') state.versionLatest = data.version;
      /* Every check that comes back starts the notice again, which is what
         makes the x a snooze rather than a mute: press it and the pill is
         gone for the rest of the day, and it is back the next time the
         radio has actually been out to look. */
      state.versionPillOff = false;
      save();
      // The line says "Up to date" either way now, so a press needs no
      // wording of its own to show that something happened.
      renderUpdateLine();
      if (updateAvailable()) $('appVersion').classList.add('is-stale');
    }).catch(function () {
      // Offline, or GitHub is having a day. Say so and try again tomorrow.
      checking = false;
      renderUpdateLine('Could not reach GitHub just now · running ' + APP_VERSION);
    });
  }

  $('scrollAnyway').addEventListener('change', function () {
    state.scrollAnyway = this.checked;
    save();
    paintMotion();
    /* The names were measured against a box that was not scrolling; they
       have to be measured again now that they are, or nothing knows how
       far to travel. */
    measureNames();
  });

  /* Windows can be changed while the radio is open, and the media query
     says so without a reload. */
  if (window.matchMedia) {
    var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    var onMotion = function () { paintMotion(); measureNames(); };
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotion);
    else if (motionQuery.addListener) motionQuery.addListener(onMotion);
  }

  $('checkNow').addEventListener('click', function () { checkVersion(true); });

  var PILL_OUT_MS = 90;
  /* On Windows the notice opens the dialog rather than the releases page,
     because the dialog can say something the releases page cannot: whether
     this machine already has the new version. Off Windows nothing fetches
     anything on its own, so the link is the whole answer and is left as it
     is.

     Modified clicks are left alone in both. Ctrl-click means "open in a
     tab" everywhere else on the machine and has to go on meaning it here,
     which is the same guard the station links use. */
  $('updatePillLink').addEventListener('click', function (e) {
    if (!onWindows()) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    e.preventDefault();
    openUpdateNotice();
  });

  /* Locked. Escape is how a window gets dismissed by somebody who has not
     read it, and this one is asking which of two things to do -- closing it
     unanswered leaves the reader exactly where they were, holding the same
     question. A dialog element treats Escape as a cancel event, so refusing
     the cancel is the whole of it. The backdrop is not a dismiss either;
     dialog never made it one. */
  $('updateReady').addEventListener('cancel', function (e) { e.preventDefault(); });

  $('updateReady').addEventListener('close', function () {
    if (this.returnValue !== 'close') return;
    window.close();
  });

  $('updatePillClose').addEventListener('click', function () {
    state.versionPillOff = true;
    save();
    /* Let it be seen going. The setting is written first, so whatever
       happens to the animation the pill is dismissed -- syncUpdatePill is
       what actually hides it, and it is called either way. */
    var pill = $('updatePill');
    var still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (!pill || still) { syncUpdatePill(); return; }
    pill.classList.add('is-going');
    setTimeout(function () {
      pill.classList.remove('is-going');
      syncUpdatePill();
    }, PILL_OUT_MS);
  });

  $('versionCheckOn').addEventListener('change', function () {
    state.versionCheck = this.checked;
    save();
    if (state.versionCheck) checkVersion(true);
    else renderUpdateLine();
  });

  /* Shift, on the Service tab, offers a way into the folder the app is
     running from -- the one place its own files, its readme and its
     scripts all are, and which on a normal install is buried under
     %LOCALAPPDATA% where nobody would go looking.

     Behind Shift rather than on the tab, because it sits next to Reset and
     two ordinary-looking buttons where one of them wipes everything is a
     row asking for the wrong press.

     What it can actually do is worth being exact about: a page cannot
     start a program, so this cannot open Explorer. It opens the folder as
     a listing in a browser window, which is the most a file:// page is
     allowed. Everything in it can be opened from there. */
  var shiftForFolder = false;

  function refreshFolderBtn() {
    var b = $('openFolderBtn');
    if (!b) return;
    b.hidden = !(shiftForFolder && el.settings.open && pane === 'service');
  }

  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Shift' || shiftForFolder) return;
    shiftForFolder = true;
    refreshFolderBtn();
  });
  window.addEventListener('keyup', function (e) {
    if (e.key !== 'Shift') return;
    shiftForFolder = false;
    refreshFolderBtn();
  });
  /* A window that loses focus with the key down never sees the keyup. */
  window.addEventListener('blur', function () {
    shiftForFolder = false;
    refreshFolderBtn();
  });

  $('openFolderBtn').addEventListener('click', function () {
    var btn = this;
    /* The page's own directory, whatever it was opened from -- a clone, an
       install under %LOCALAPPDATA%, a folder on a stick. Nothing is
       hard-coded, so it is right wherever this copy happens to live. */
    var folder = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');

    /* Both, because neither on its own is what somebody wants. The listing
       is a browser's, not Explorer's -- a page cannot start a program, and
       the one way to reach the real file manager would be a protocol
       handler in the registry, which this app does not write to. So the
       path goes on the clipboard as well, in the backslash form Explorer's
       address bar and a command prompt both take, and pasting it there is
       the two seconds this cannot do for you. */
    var win = windowsPathOf(folder).replace(/[\\/]+$/, '');

    /* The copy has to finish before the new window takes the focus.
       Writing to the clipboard needs the document focused, and opening the
       listing first -- or even in the same tick, since the write is async
       -- hands the focus away before the write runs and it is refused. So
       the window is opened once the clipboard has settled, either way. */
    function say(word) {
      btn.textContent = word;
      setTimeout(function () { btn.textContent = 'Open app folder'; }, 1600);
    }
    function show() { window.open(folder, '_blank', 'noopener'); }

    try {
      navigator.clipboard.writeText(win).then(
        function () { say('Path copied'); show(); },
        function () { say('Opened it'); show(); }
      );
    } catch (e) {
      // A page opened from disk is sometimes refused the clipboard outright.
      say('Opened it');
      show();
    }
  });

  $('resetBtn').addEventListener('click', function () {
    var box = $('confirmReset');
    if (box && !box.open) box.showModal();
  });
  $('confirmReset').addEventListener('close', function () {
    if (this.returnValue === 'reset') resetEverything();
  });

  $('exportBtn').addEventListener('click', function () {
    /* Written as a script that assigns a global, rather than as bare
       JSON. Left beside index.html it then seeds a fresh profile on its
       first run, and a page has always been allowed to load its own
       scripts -- where reading the same bytes as data would need the
       browser opened with the run of the disk. Import reads it either
       way, so an older .json export still works. */
    /* app and appVersion go first so the first line of the file says what
       it is and what wrote it, readable without knowing the format. app
       is also the only honest way to refuse somebody else's JSON: an
       array called stations is not a rare thing to find in a file. */
    var body = 'window.DESKSIDE_SEED = ' + JSON.stringify({ app: SEED_APP, appVersion: APP_VERSION, seedV: SEED_V, exportedAt: stampNow(), stations: state.stations, schedule: state.schedule, scheduleEnds: state.scheduleEnds, scheduleV: state.scheduleV || 2, schedulerEnabled: !!state.schedulerEnabled, theme: state.theme, volume: state.volume, bass: state.bass, treble: state.treble, autoplay: state.autoplay, autoplayStationId: state.autoplayStationId }, null, 2) + ';\n';
    var blob = new Blob([body], { type: 'text/javascript' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'deskside-radio-settings.js';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  /* One reading of an export file, shared by the Import button and the seed
     that a fresh profile picks up off disk. Throws on anything that is not
     one of ours, which is what both callers want to hear about. */
  /* When the export was written, in the local time of the machine that
     wrote it, to the second. Deliberately not a UTC timestamp: this is
     read by a person deciding which of two files on their desktop is the
     one they meant, and 19:42:07 is what their clock said. Sortable as
     text for the same length of string, which is all the sorting anyone
     needs of it. */
  function stampNow() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  /* Which version of the app wrote an export, or null for one written
     before the stamp existed -- which is any file older than 1.4.8. */
  function versionOfExport(data) {
    var v = data && data.appVersion;
    return (typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v)) ? v : null;
  }

  function importSettingsInto(target, data) {
    if (!data || typeof data !== 'object') throw new Error('not an export');
    /* Unstamped is the ordinary case for a file written before 1.4.8 and
       is accepted. Stamped with somebody else's name is not: that is a
       file that says plainly it is not ours, and reading it anyway would
       be the app insisting it knows better. */
    if (data.app && data.app !== SEED_APP) throw new Error('not an export');
    if (!Array.isArray(data.stations)) throw new Error('no stations');
    target.stations = data.stations.map(cleanStation).filter(Boolean);
    if (!target.stations.length) throw new Error('no stations');
    var sched = (data.schedule && typeof data.schedule === 'object') ? data.schedule : {};
    target.schedule = { weekday: cleanSlots(sched.weekday), weekend: cleanSlots(sched.weekend) };

    /* An imported file gets the same reading as a stored one: equal times
       meant nothing when it was written and mean all day now. */
    if (data.scheduleV !== 2) {
      ['weekday', 'weekend'].forEach(function (g) {
        target.schedule[g] = target.schedule[g].filter(function (sl) {
          var a = Scheduler.parseHHMM(sl.start), b = Scheduler.parseHHMM(sl.end);
          return !(a !== null && a === b);
        });
      });
    }
    target.scheduleV = 2;

    /* Settled here rather than left for the save button, which no longer
       refuses anything. What it had to change is handed back so the drawer
       can say so -- an import is the one path where the fixes are worth
       mentioning and cannot be undone, the alternative being a schedule
       that does not work. */
    target.importFixes = [];
    ['weekday', 'weekend'].forEach(function (g) {
      var r = Scheduler.settle(target.schedule[g], target.stations, null);
      target.schedule[g] = r.slots;
      r.changes.forEach(function (c) { target.importFixes.push(c.text); });
    });
    /* A file old enough to have no scheduleEnds is read as "keep playing"
       rather than as the default. The difference matters here and nowhere
       else: importing a file written before the setting existed must not
       be able to switch a radio off at the end of the day on its own. */
    var e = (data.scheduleEnds && typeof data.scheduleEnds === 'object') ? data.scheduleEnds : {};
    target.scheduleEnds = {
      weekday: e.weekday === 'off' ? 'off' : 'play',
      weekend: e.weekend === 'off' ? 'off' : 'play'
    };

    /* Everything the file carries, not merely the parts that show in a
       list. Whether the schedule was running is a setting like any other
       and was being written into the export and thrown away on the way
       back in: a schedule exported switched on came back switched off,
       silently, and the drawer then looked as though it had forgotten it.
       The level and the tone travelled the same way. An older export has
       none of these fields, and an absent field leaves what is there --
       so importing one of those still changes nothing it did not mean to.
       An empty schedule cannot run, which is the same rule load() keeps. */
    if (typeof data.schedulerEnabled === 'boolean') target.schedulerEnabled = data.schedulerEnabled;
    if (!target.schedule.weekday.length && !target.schedule.weekend.length) target.schedulerEnabled = false;
    if (typeof data.volume === 'number' && isFinite(data.volume)) {
      target.volume = Math.max(0, Math.min(100, Math.round(data.volume)));
    }
    if (typeof data.bass === 'number') target.bass = clampTone(data.bass);
    if (typeof data.treble === 'number') target.treble = clampTone(data.treble);

    if (THEMES.indexOf(data.theme) !== -1) target.theme = data.theme;
    target.autoplay = !!data.autoplay;
    target.autoplayStationId = data.autoplayStationId || null;
    return target;
  }

  /* An export is a script now, which read as text is the same JSON with
     an assignment in front of it. Older exports are the JSON alone. */
  function parseExport(text) {
    return JSON.parse(String(text)
      .replace(/^\s*(?:window\.)?DESKSIDE_SEED\s*=\s*/, '')
      .replace(/;\s*$/, ''));
  }

  $('importFile').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var data = parseExport(r.result);
        /* Said rather than assumed. Every older format is read here -- a
           schedule written under the old reading of equal times, a file
           with no scheduleEnds, one from before the schedule switch was
           exported at all -- and all of it is brought forward without
           asking. What cannot be brought forward is the listener's memory
           of which file they just picked, so the version that wrote it is
           named. An unstamped file is any export older than 1.4.8. */
        var from = versionOfExport(data);
        importSettingsInto(draft, data);
        renderDrawer();
        refreshSaveBtn();
        var fixes = draft.importFixes || [];
        var when = (typeof data.exportedAt === 'string' && data.exportedAt) ? ', exported ' + data.exportedAt : '';
        var src = (from === APP_VERSION ? 'Imported' : from ? 'Imported from v' + from
          : 'Imported from a file older than v1.4.8') + when;
        $('saveMsg').textContent = fixes.length
          ? src + ', with ' + fixes.length + ' schedule fix' + (fixes.length === 1 ? '' : 'es') + '. Press Save to keep it.'
          : src + '. Press Save to keep it.';
        $('saveMsg').className = 'save-msg good';
        /* No Undo offered: the only thing to go back to is a schedule that
           does not work. The file said one thing, the schedule can only be
           the other, and the difference is worth naming. */
        if (fixes.length) {
          showPane('schedule', true);
          showFix(fixes.length === 1 ? fixes[0] : fixes.length + ' slots in the imported file were shortened, removed or given a station.', null);
        }
      } catch (e) { $('saveMsg').textContent = 'That file is not a Deskside Radio export.'; $('saveMsg').className = 'save-msg bad'; }
    };
    r.readAsText(f);
    this.value = '';
  });

  // ---------- boot ----------
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', function () {
    // Background tabs get their timers throttled, so re-align on return.
    if (!document.hidden) { tick(); startTicking(); }
  });

  /* A launcher-made shortcut opens the radio in its own browser profile,
     which starts with empty storage: no stations, no schedule, default
     theme. So look for an export sitting beside index.html and take the
     settings from that.

     Read on every launch, not only on the first one. Each shortcut has a
     profile of its own and storage cannot cross between them, so the file
     beside index.html is the only thing all of them can see -- and while
     it was read once per profile and never again, "export from Chrome"
     changed nothing in Edge or Firefox no matter how many times it was
     done. Now the file is read every time and imported whenever its
     contents differ from the last version this profile took, which is
     what makes an export the way to move settings between browsers.

     The stamp is what stops it fighting the drawer: settings changed in
     this browser and not exported leave the file alone, so nothing is
     read back over them. Exporting is the deliberate act that says this
     file is now the word, and the next launch of every other shortcut
     agrees. Whoever exported last wins, which is the only rule that can
     be stated in one sentence.

     It is loaded as a script rather than read as data, which is why the
     export writes one. Reading a file off disk from a file:// page needs
     --allow-file-access-from-files, and that flag does not stop at the
     one file it was wanted for: it turns every script on the page into a
     reader of anything the user can open -- their browser history, their
     keys, their documents -- for the life of the shortcut, in exchange
     for a convenience that runs once per profile. A script tag needs no
     flag, because a page has always been allowed to load its own
     scripts. A missing file is the ordinary case and is not an error. */
  /* Enough of a fingerprint to tell one export from the next. Not a
     checksum against tampering -- a file anyone can edit cannot be
     defended by a number sitting next to it -- only an answer to "is this
     the same file I read last time". djb2 over the serialised seed. */
  function stampOf(text) {
    var h = 5381;
    for (var i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return text.length + '.' + h.toString(36);
  }

  function seedSettings(done) {
    var tag = document.createElement('script');
    var finished = false;
    function go() {
      if (finished) return;
      finished = true;
      tag.remove();
      try {
        if (window.DESKSIDE_SEED) {
          var stamp = stampOf(JSON.stringify(window.DESKSIDE_SEED));
          /* A profile with nothing stored takes the file whatever it says,
             because there is nothing of its own to lose. One that has been
             used takes it only when the file has changed since it last
             did -- otherwise every launch would read the same settings
             back over whatever had been changed since. */
          if (stored === null || state.seedStamp !== stamp) {
            var into = stored === null ? clone(DEFAULTS) : state;
            var seeded = normalise(importSettingsInto(into, window.DESKSIDE_SEED));
            seeded.seedStamp = stamp;
            seeded.seedFrom = versionOfExport(window.DESKSIDE_SEED);
            state = seeded;
            if (!station(state.currentStationId)) state.currentStationId = state.stations[0].id;
            save();
          }
        }
      } catch (e) { /* not one of ours: carry on with what is stored */ }
      try { delete window.DESKSIDE_SEED; } catch (e) { window.DESKSIDE_SEED = null; }
      done();
    }
    tag.onload = go;
    tag.onerror = go;
    tag.src = 'deskside-radio-settings.js';
    document.head.appendChild(tag);
    // A file that is there but never settles must not hold the boot up.
    setTimeout(go, 800);
  }

  function boot() {
    applyLook();
    TunerUI.init(el.tuner);
    renderPresets();
    setVolume(state.volume, true);
    applyTone();
    el.schedToggle.setAttribute('aria-pressed', state.schedulerEnabled);
    el.schedLabel.textContent = state.schedulerEnabled ? 'Schedule on' : 'Schedule off';
    applySlotNow(state.schedulerEnabled ? Scheduler.activeSlot(state.schedule, new Date()) : null);
    var onDisplay = resolveTarget();
    if (onDisplay.station) {
      state.currentStationId = onDisplay.station.id;
      // renderStation loads this station's tone on the way past.
      renderStation(onDisplay.station);
    }
    tick();
    startTicking();
    /* Said once, on the first launch after an update.

       A profile with no version recorded is not necessarily new. Nothing
       before 1.4.12 wrote this field, so every install updating from an
       older one arrives here with stations, a window box and a theme --
       plainly an install that has been running for weeks -- and was told
       it was a first install and given nothing. Which is what happened on
       the first real update to carry this, where the announcement was the
       thing being updated to.

       Empty storage is what a first install actually looks like. stored
       is what was read before any of this ran, so it answers that
       exactly: null means nothing had ever been saved here. */
    var ranBefore = state.ranVersion;
    if (ranBefore !== APP_VERSION) {
      var wasHere = ranBefore || stored !== null;
      state.ranVersion = APP_VERSION;
      save();
      if (wasHere) announceVersion();
    }
    $('appVersion').textContent = 'v' + APP_VERSION;
    if (updateAvailable()) $('appVersion').classList.add('is-stale');
    // What the last check found, remembered across launches.
    syncUpdatePill();
    /* Stamped on the root so the stylesheet can pick between the two
       versions of a paragraph that only differ by platform, the same way
       it picks a theme. Doing it here rather than in markup because only
       the script can ask what it is running on. */
    document.documentElement.setAttribute('data-os', onWindows() ? 'windows' : 'other');
    /* The pane is shown everywhere -- the paragraphs inside it answer for
       each platform -- but the switch only has something to talk to on
       Windows. Hidden by attribute rather than by the .os-win class: that
       rule sets display: block and the row is a flex row, so the class
       would lay it out wrongly on the one platform it is meant to show it
       on. .switch-row[hidden] is what answers this. */
    if (!onWindows()) {
      var row = document.querySelector('#startupBlock .switch-row');
      if (row) row.hidden = true;
      var line = $('startupLine');
      if (line) line.hidden = true;
    }

    // Not on the critical path: let the radio come up first.
    paintMotion();
    /* Two of them, and both are needed. The first is the launch: whatever
       the stored answer says, a window that has just been opened asks
       again unless it asked in the last ten minutes. The second is what
       made "every six hours" true -- there was no repeat at all before, so
       a radio left open for a week checked exactly once, at launch, and
       went on reporting that week-old answer as "Up to date". The
       interval is the same six hours the gate uses, so the two can never
       drift apart. */
    setTimeout(function () { checkVersion(false, BOOT_FLOOR); }, 3000);
    setInterval(function () { checkVersion(false); }, CHECK_EVERY);
    el.tuner.classList.add('is-quiet');
    meterQuiet = true;
    startMeter();

    /* Play on launch. probeAutoplay() finds out whether this browser will
       start audio unasked — the launcher shortcut sees to that — and builds
       the graph first when it will, so the meter and tone come up with the
       sound rather than waiting for a click. Either way playback is attempted
       and only a refusal (NotAllowedError in tune()) raises the tap panel.
       That includes the case of a session left playing, which used to put the
       panel up pre-emptively without ever asking the browser. */
    var launch = Scheduler.bootTarget(state, new Date());
    var launchStation = launch && station(launch.stationId) ? launch : null;
    var resumeLast = !launchStation && state.intendedPlaying && !!onDisplay.station;

    if (launchStation) {
      state.currentStationId = launchStation.stationId;
      renderStation(station(launchStation.stationId));
      launching = true;
    } else if (!resumeLast) {
      setStatus('idle', 'Idle');
    }
    if (launchStation || resumeLast) probeAutoplay(startPlayback);
  }

  /* Nothing stored means either a first run or a fresh profile, and the
     second is what the launcher makes. Either way, look for a settings
     file before drawing anything, so the radio comes up already itself.
     Declared with var above its use in seedSettings on purpose: it is
     read there, and hoisting is what lets the reader of that function
     see the answer it is given. */
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* storage unavailable */ }
  seedSettings(boot);
})();
