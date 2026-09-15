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
  var APP_VERSION = '1.3.0';

  var DEFAULTS = {
    stations: [
      { id: 'cfrb', name: 'NewsTalk 1010', band: '1010 AM', tag: "Toronto's news, traffic and weather, all day.",
        url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/CFRBAM.mp3', color: '#10307a', bass: 0, treble: 0 },
      /* CBC hands out an HLS playlist rather than a plain stream. Every
         current desktop browser plays it off the element, Chrome included,
         so it needs no library — see the note in radio-directory.js about
         judging a stream by whether it holds up, not by its extension. */
      { id: 'cbc1', name: 'CBC Radio 1 Toronto', band: '99.1 FM', tag: 'CBLA-FM',
        url: 'https://cbcradiolive.akamaized.net/hls/live/2041036/ES_R1ETR/master.m3u8', color: '#a8321c', bass: 0, treble: 0 },
      { id: 'kiss', name: 'KISS 92.5', band: '92.5 FM', tag: "Toronto's hit music station.",
        url: 'https://rogers-hls.leanstream.co/rogers/tor925.stream/icy', color: '#e11d74', bass: 0, treble: 0 }
    ],
    schedule: { weekday: [], weekend: [] },
    /* What each day group does once its last slot has ended and nothing
       follows: 'play' leaves whatever is on playing, 'off' stops. Kept
       beside the schedule rather than inside it, because the slots are a
       list and this is a property of the day. */
    scheduleEnds: { weekday: 'play', weekend: 'play' },
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
    volumeCurve: 2,
    autoplay: false,
    autoplayStationId: null,
    lastCity: null,
    bass: 0,
    treble: 0,
    lastGood: null,
    versionCheck: true,
    versionLastCheck: 0,
    versionLatest: null
  };

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
      var ends = (s && s.scheduleEnds && typeof s.scheduleEnds === 'object') ? s.scheduleEnds : {};
      merged.scheduleEnds = {
        weekday: ends.weekday === 'off' ? 'off' : 'play',
        weekend: ends.weekend === 'off' ? 'off' : 'play'
      };
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

      // Settings saved before the fader was rebuilt in decibels.
      if (merged.volumeCurve !== 2) {
        merged.volume = Signal.migrateVolume(merged.volume);
        merged.volumeCurve = 2;
        if (merged.lastGood) merged.lastGood.volume = Signal.migrateVolume(merged.lastGood.volume);
        ['weekday', 'weekend'].forEach(function (group) {
          (merged.schedule[group] || []).forEach(function (slot) { slot.volume = Signal.migrateVolume(slot.volume); });
        });
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
  var recTap = null;
  var timeData = null, freqData = null;

  var status = 'idle';   // idle | connecting | live | reconnecting | stopped
  var attempts = 0;
  var retryTimer = null;
  var liveSince = 0;
  var lastTime = -1, stuckSince = 0;
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
    catch (e) { ctx = null; analyser = null; gainNode = null; bassNode = null; trebleNode = null; }
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
        catch (e) { ctx = null; analyser = null; gainNode = null; bassNode = null; trebleNode = null; }
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
    /* No band means an internet-only station, and a separator with nothing
       after it reads as something that failed to load. */
    setStatus('live', st && st.band ? 'Live \u00b7 ' + st.band : 'Live');
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
    try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (e) { /* already idle */ }
    audio = next;
  }

  function setStatus(s, text) {
    var was = status;
    status = s;
    // Connecting, live, reconnecting: all of them have a needle to move.
    if (s !== 'stopped' && s !== 'idle') startMeter();
    /* Coming out of a handover: the level was taken to nothing before the
       change, so the station that replaced it is brought up rather than
       dropped in at full. Waiting for 'live' rather than ramping from the
       moment it was tuned means the rise is heard on the audio and not
       spent on a connection. */
    if (s === 'live' && was !== 'live' && fadeMul < 1) fadeGain(1, RETURN_FADE_MS);
    refreshRec();
    el.status.textContent = text;
    el.led.classList.toggle('live', s === 'live');
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
    el.bass.title = el.treble.title = toneOff ? 'This stream would not load on the analysed path, so tone control is unavailable.' : '';
    el.play.setAttribute('aria-pressed', state.intendedPlaying ? 'true' : 'false');
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
  var hlsVariant = {};
  var hlsTried = {};
  var hlsLadder = {};
  var hlsStep = {};

  function resolveHlsThenTune(st, volume) {
    var master = st.url;
    hlsTried[master] = true;
    fetchText(master)
      .then(function (text) {
        var ladder = Directory.listHlsVariants(text, master);
        if (ladder.length) {
          hlsLadder[master] = ladder;
          hlsStep[master] = 0;
          hlsVariant[master] = ladder[0];
        }
        tune(st, volume);
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
    clearTimeout(retryTimer); retryTimer = null;
    state.currentStationId = st.id;
    useElement(elementFor(st));
    loadTone(st);
    setVolume(typeof volume === 'number' ? volume : state.volume, true);
    renderStation(st);
    audio.src = hlsVariant[st.url] || st.url;
    audio.load();
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
    state.intendedPlaying = true;
    // Pressing play makes it the listener's again, not the schedule's.
    scheduleStopped = false;
    startMeter();
    // Whatever a handover left behind, a deliberate press starts at full.
    clearInterval(fadeTimer); fadeTimer = null;
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
      target = Signal.rmsToVu(Math.sqrt(sum / timeData.length));
      /* Filling this costs a 2048-point transform, and in every theme
         but Editorial the canvas it feeds is display:none. */
      if (TunerUI.scopeShowing(el.tuner)) {
        analyser.getByteFrequencyData(freqData);
        TunerUI.drawBars(el.tuner, freqData);
      }
    }
    if (!holding) level = Signal.vuBallistics(level, target, dt);
    TunerUI.setLevel(el.tuner, level);

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
  }

  /* Ramped on a timer rather than with the Web Audio scheduler, because
     the no-CORS path has no scheduler: it is an element's volume property
     and nothing else. One shape for both, and a fade nobody can hear the
     seams of at 25 steps a second. */
  function fadeGain(to, ms, done) {
    clearInterval(fadeTimer);
    var from = fadeMul, started = Date.now();
    if (ms <= 0) { fadeMul = to; applyGain(); if (done) done(); return; }
    fadeTimer = setInterval(function () {
      var t = Math.min(1, (Date.now() - started) / ms);
      fadeMul = from + (to - from) * t;
      applyGain();
      if (t >= 1) { clearInterval(fadeTimer); fadeTimer = null; if (done) done(); }
    }, 40);
  }

  function setVolume(v, silent) {
    v = Math.max(0, Math.min(100, Math.round(v)));
    state.volume = v;
    applyGain();
    el.volume.value = v;
    el.volumeOut.value = v;
    markFader(el.volume);
    if (!silent) save();
  }

  /* A range input says nothing in CSS about where it sits between its
     ends, and a theme drawn as a knob has to turn something by exactly
     that. One number per fader, 0 at the low end and 1 at the high. */
  function markFader(input) {
    var lo = +input.min, hi = +input.max;
    var at = hi > lo ? (+input.value - lo) / (hi - lo) : 0;
    // On the wrapper, not the input: a theme that draws the control as a
    // knob builds it out of the wrapper's own pseudo-elements, and those
    // can only read what the wrapper has.
    (input.parentElement || input).style.setProperty('--turn', at.toFixed(4));
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

    if (left <= HANDOVER_FADE_MS && !el.schedToggle.classList.contains('is-handing')) {
      el.schedToggle.classList.add('is-handing');
      if (state.intendedPlaying && status === 'live') fadeGain(0, Math.max(300, left));
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

      /* Nothing is in force. Whether that is the end of the day or a gap
         in the middle of it is the difference between turning the radio
         off and leaving it alone -- the setting says "when the day's last
         slot ends", and a midday gap is not that.

         Which group's setting applies is the group of the slot that just
         ended, not the group of the day it ended on: a Friday night slot
         running to one in the morning is a weekday slot, and it is the
         weekday setting that decides what happens when it stops. */
      if (!slot && !first && state.intendedPlaying) {
        var ends = state.scheduleEnds || {};
        var over = Scheduler.dayIsOver(state.schedule, now);
        if (over && ends[groupOfSlot(ended)] === 'off') {
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
            clearInterval(fadeTimer); fadeTimer = null;
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
       the day it ends on. */
    var label = st ? st.name : 'Free play';
    if (!st) {
      var ending = Scheduler.activeSlot(state.schedule, now);
      var ends = state.scheduleEnds || {};
      if (ending && Scheduler.dayIsOver(state.schedule, n.at) && ends[groupOfSlot(ending)] === 'off') {
        label = 'Radio off';
      }
    }
    setNextUp(label + ' at ' + when + day);
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
    el.band.textContent = st.band || 'Internet stream';
    TunerUI.setName(el.name, st.name);
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
    var box = {
      x: window.screenX, y: window.screenY,
      w: window.outerWidth, h: window.outerHeight
    };
    // Minimised, or caught mid-drag, is not a position worth keeping.
    if (!(box.w > 200 && box.h > 200)) return;
    var had = state.windowBox;
    if (had && had.x === box.x && had.y === box.y && had.w === box.w && had.h === box.h) return;
    state.windowBox = box;
    save();
  }

  /* Clamped to the screen in front of the user now, not the one the box
     was saved on: a second monitor that has since been unplugged would
     otherwise put the window somewhere it cannot be reached. */
  function restoreBox() {
    var box = state.windowBox;
    if (!box || !windowIsOurs()) return false;
    var w = Math.min(box.w, screen.availWidth);
    var h = Math.min(box.h, screen.availHeight);
    var x = Math.max(0, Math.min(box.x, screen.availWidth - w));
    var y = Math.max(0, Math.min(box.y, screen.availHeight - h));
    try {
      window.resizeTo(w, h);
      window.moveTo(x, y);
    } catch (e) { return false; }
    return true;
  }

  function fitWindow(pass) {
    if (!mayFit || keepBox || !windowIsOurs() || !el.tuner) return;
    /* Settings has the window on loan. Sizing it to the radio now would
       shut the drawer's room out from under it, and the second pass would
       then remember the borrowed size as the listener's own. */
    if (borrowedBox) return;
    pass = pass || 0;

    /* Measured with the scrollbar suppressed, which is what took this from
       three resizes to one. The first measurement used to be taken with a
       scrollbar present; that narrows the tuner, which makes it taller than
       it will be once the bar goes, so the window was sized to a height it
       then had to be corrected away from. Correcting it in front of the
       user is the flicker. Take the bar out of the measurement and the
       first answer is the right one. */
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

    if (Math.abs(w - window.outerWidth) > 1 || Math.abs(h - window.outerHeight) > 1) {
      try { window.resizeTo(w, h); } catch (e) { return; }
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
     back exactly as it was when the drawer closes. Nothing here goes near
     rememberBox, which is reached only through fitWindow, so a borrowed
     size is never mistaken for a size the listener chose. */
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
    if (sizedOnce) { keepBox = false; mayFit = true; fitWindow(); return; }
    sizedOnce = true;
    if (restoreBox()) { keepBox = true; mayFit = true; return; }

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

  function applyLook() {
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
      TunerUI.setName(el.name, st.name);
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
  el.volume.addEventListener('pointerdown', function () { stopGlide(el.volume); });
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
      el.rec.title = 'Saved to your downloads';
      el.recWord.textContent = 'SAVED';
      return;
    }
    var why = running ? '' : recBlockedReason();
    el.rec.disabled = !!why;
    el.rec.title = why || (running ? 'Stop recording and save it' : 'Record this station');
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
    draft = clone({
      stations: state.stations, schedule: state.schedule,
      scheduleEnds: state.scheduleEnds, scheduleV: state.scheduleV || 2, theme: state.theme,
      autoplay: state.autoplay, autoplayStationId: state.autoplayStationId
    });
    slotGroup = 'weekday';
    clearFieldMarks();
    openSlot = null;
    pendingSnap = null;
    clearFix();
    // Updates sit outside the draft: the switch takes effect as it is used.
    $('versionCheckOn').checked = !!state.versionCheck;
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
  $('openSettings').addEventListener('click', openSettings);

  /* ---------- the read me ----------
     Which file it is depends on where this copy came from: the download
     ships README.html, the repository has README.md, and README.txt is
     what older downloads have. Rather than guess, ask for each in turn
     and link the first one that answers.

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
  var README_NAMES = ['README.html', 'README.txt', 'README.md'];

  /* A read me is a document, not a tab. It opens in a window of its own,
     sized to the page's measure and centred on the screen this window is
     on -- screen.availLeft and availTop describe the display the radio is
     sitting on, so a second monitor gets its own centre rather than the
     document appearing back on the primary one.

     Held to what the screen can take, because a laptop at 1366x768 would
     otherwise be handed a window taller than itself. If the browser
     refuses the popup outright, nothing is prevented and the link does
     what it always did. */
  var README_W = 1040, README_H = 940;

  function openReadme(e) {
    var href = el.readmeLink.getAttribute('href');
    if (!href) { e.preventDefault(); return; }
    // A deliberate new tab, a new window, or the middle button: theirs.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;

    var sw = screen.availWidth || screen.width || README_W;
    var sh = screen.availHeight || screen.height || README_H;
    var w = Math.max(360, Math.min(README_W, sw - 80));
    var h = Math.max(400, Math.min(README_H, sh - 80));
    var ox = screen.availLeft != null ? screen.availLeft : 0;
    var oy = screen.availTop != null ? screen.availTop : 0;
    var win = window.open(href, 'dsradio-readme',
      // No noopener here: with it, window.open hands back null and
      // there would be no way to tell a refused popup from a working
      // one. The page it opens is this app's own file.
      'popup=yes,width=' + w + ',height=' + h +
      ',left=' + Math.round(ox + (sw - w) / 2) + ',top=' + Math.round(oy + (sh - h) / 2));
    if (!win) return;
    e.preventDefault();
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
        return;
      }
      var name = README_NAMES[i++];
      fileExists(name, function (ok) {
        if (!ok) return next();
        el.readmeLink.href = name;
        el.readmeMissing.hidden = true;
        // Only a page gets a window of its own; plain text is fine in a tab.
        if (/\.html?$/i.test(name)) el.readmeLink.addEventListener('click', openReadme);
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
      var icon = windowsPathOf(appFolderUrl() + 'favicon-' + (known ? state.theme : 'dial') + '.ico');
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
      $('macIcon').src = 'favicon-' + theme + '.ico';
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
    $('shortcutIcon').src = 'favicon-' + theme + '.ico';
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
      autoplay: !!draft.autoplay, autoplayStationId: draft.autoplayStationId || null
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
      if (cur) TunerUI.setName(el.name, cur.name);
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
    if (used) notes.push('The schedule uses it in ' + used + ' slot' + (used === 1 ? '' : 's') + '.');

    /* Asked rather than left dangling. A slot pointing at a station that
       is gone used to show the first station in its dropdown while
       refusing to save, which looks like the app being wrong about a field
       the listener can see is right. */
    var fates = $('stationDeleteFates'), pick = $('slotFateStation');
    fates.hidden = !used || last;
    if (!fates.hidden) {
      pick.innerHTML = '';
      draft.stations.forEach(function (other) {
        if (other.id === st.id) return;
        pick.appendChild(new Option(other.name || '(unnamed)', other.id));
      });
      var move = fates.querySelector('input[value="move"]');
      if (move) move.checked = true;
    }
    if (last && used) notes.push('Its ' + used + ' slot' + (used === 1 ? '' : 's') + ' go with it.');
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
    /* Decided before the station goes, while its id still means
       something. With no choice on offer -- it was the only station --
       every slot that used it goes too, because a slot with nothing to
       play is not a slot. */
    var fates = $('stationDeleteFates');
    var chosen = fates.hidden ? 'drop' : (fates.querySelector('input[name="slotFate"]:checked') || {}).value;
    var moveTo = chosen === 'move' ? $('slotFateStation').value : null;
    var touched = 0;
    ['weekday', 'weekend'].forEach(function (g) {
      var keep = [];
      (draft.schedule[g] || []).forEach(function (sl) {
        if (sl.stationId !== st.id) { keep.push(sl); return; }
        touched += 1;
        if (moveTo) { sl.stationId = moveTo; keep.push(sl); }
      });
      draft.schedule[g] = keep;
    });

    draft.stations.splice(index, 1);
    openStation = null;

    if (touched) {
      var to = draft.stations.filter(function (x) { return x.id === moveTo; })[0];
      showFix(moveTo
        ? touched + ' slot' + (touched === 1 ? '' : 's') + ' now play' + (touched === 1 ? 's' : '') + ' ' + ((to && to.name) || 'another station') + '.'
        : touched + ' slot' + (touched === 1 ? ' was' : 's were') + ' removed with ' + (name || 'that station') + '.', null);
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
            '<div class="fw fw-name"><input class="in" data-k="name" placeholder="Station name" aria-label="Name"></div>' +
            '<div class="fw fw-band"><input class="in in-band" data-k="band" placeholder="1010 AM" aria-label="Frequency"></div>' +
            '<input class="in in-color" data-k="color" type="color" aria-label="Colour">' +
            '<div class="fw fw-url"><input class="in in-url" data-k="url" placeholder="https://stream.example.com/live.mp3" aria-label="Stream URL"></div>' +
            '<input class="in in-tag" data-k="tag" placeholder="Tagline (optional)" aria-label="Tagline">' +
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
  function focusStationField(index, key) {
    var st = draft.stations[index];
    if (!st) return;
    openStation = st.id;
    renderStationRows();
    var card = $('stationRows').children[index];
    var field = card && card.querySelector('[data-k="' + key + '"]');
    if (!field) return;
    // The drawer body scrolls; focusing alone can leave it off screen.
    if (field.scrollIntoView) field.scrollIntoView({ block: 'nearest' });
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

    var moved = [];
    for (var j = 0; j < order.length; j++) {
      var card = cards[order[j].id];
      if (!card) continue;
      box.appendChild(card);
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
              '<input class="in in-time" data-k="start" type="time" aria-label="Start" required>' +
              '<span class="to">to</span>' +
              '<input class="in in-time" data-k="end" type="time" aria-label="End" required>' +
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
      btn.title = s.playable ? '' : 'This link is a playlist file listing streams, not a stream, so it may not play. Adding it is still worth a try.';
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

  function stationsWithoutBand() {
    return draft.stations.filter(function (s) { return !String(s.band || '').trim(); });
  }

  /* The full length of the Saved plate: up, held, and away again. The
     drawer closes on the same number, so the two cannot drift apart. */
  var SAVED_PLATE_MS = 1150;

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
    var missing = stationsWithoutBand();
    if (!missing.length) { commitSettings(); return; }
    $('bandMissingList').textContent = missing.length === 1
      ? (missing[0].name || 'One station') + ' has no frequency yet.'
      : missing.length + ' stations have no frequency yet: ' + missing.map(function (s) { return s.name || 'unnamed'; }).join(', ') + '.';
    $('confirmBand').showModal();
  });

  $('confirmBand').addEventListener('close', function () {
    if (this.returnValue === 'save') { commitSettings(); return; }
    // Send them to the first frequency field that needs filling in. With the
    // cards collapsed that means opening the right one first.
    showPane('stations', true);
    for (var i = 0; i < draft.stations.length; i++) {
      if (String(draft.stations[i].band || '').trim()) continue;
      focusStationField(i, 'band');
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
    try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
    state = clone(DEFAULTS);
    noCors = {};
    provenCors = {};
    save();
    applyLook();
    renderPresets();
    setVolume(state.volume, true);
    applyTone();
    el.schedToggle.setAttribute('aria-pressed', state.schedulerEnabled);
    el.schedLabel.textContent = 'Schedule on';
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
  /* Six hours rather than a day. The radio is built to be left open for
     days at a time, which is the only case where the interval matters at
     all -- four requests a day to one static file against one. */
  var CHECK_EVERY = 6 * 60 * 60 * 1000;

  // 1.2.10 is newer than 1.2.9, which a string compare gets wrong.
  function newerThan(a, b) {
    var x = String(a || '').split('.'), y = String(b || '').split('.');
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var d = (parseInt(x[i], 10) || 0) - (parseInt(y[i], 10) || 0);
      if (d) return d > 0;
    }
    return false;
  }

  function updateAvailable() {
    return !!(state.versionLatest && newerThan(state.versionLatest, APP_VERSION));
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
    pill.hidden = !on;
    // The gear carries the same mark: the pill says what, this says where.
    var gear = $('openSettings');
    if (gear) gear.classList.toggle('has-update', on);
    if (!on) return;
    pill.href = RELEASES_URL;
    pill.title = 'Version ' + state.versionLatest + ' has been published. Running ' + APP_VERSION + '.';
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
      line.innerHTML = running + ' · <b>New v' + escapeHtml(state.versionLatest) + ' available</b> · ' +
        '<a href="' + RELEASES_URL + '" target="_blank" rel="noopener">Download it</a>';
      return;
    }
    /* Never checked reads differently from checked and found nothing, and
       that difference is most of what this line is for. */
    line.innerHTML = state.versionLastCheck
      ? running + ' · last checked ' + isoDay(state.versionLastCheck) + ' · <b>Up to date</b>'
      : running + ' · not checked yet';
  }

  function checkVersion(force) {
    if (!state.versionCheck) { renderUpdateLine(); return; }
    if (!force && Date.now() - (state.versionLastCheck || 0) < CHECK_EVERY) { renderUpdateLine(); return; }
    if (typeof fetch !== 'function') return;
    checking = true;
    renderUpdateLine('Asking GitHub…');
    fetch(VERSION_URL, { cache: 'no-store' }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (data) {
      checking = false;
      state.versionLastCheck = Date.now();
      if (data && typeof data.version === 'string') state.versionLatest = data.version;
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

  $('checkNow').addEventListener('click', function () { checkVersion(true); });

  $('versionCheckOn').addEventListener('change', function () {
    state.versionCheck = this.checked;
    save();
    if (state.versionCheck) checkVersion(true);
    else renderUpdateLine();
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
    var body = 'window.DESKSIDE_SEED = ' + JSON.stringify({ stations: state.stations, schedule: state.schedule, scheduleEnds: state.scheduleEnds, scheduleV: state.scheduleV || 2, theme: state.theme, volume: state.volume, bass: state.bass, treble: state.treble, autoplay: state.autoplay, autoplayStationId: state.autoplayStationId }, null, 2) + ';\n';
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
  function importSettingsInto(target, data) {
    if (!data || !Array.isArray(data.stations)) throw new Error('no stations');
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
    var e = (data.scheduleEnds && typeof data.scheduleEnds === 'object') ? data.scheduleEnds : {};
    target.scheduleEnds = {
      weekday: e.weekday === 'off' ? 'off' : 'play',
      weekend: e.weekend === 'off' ? 'off' : 'play'
    };
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
        importSettingsInto(draft, parseExport(r.result));
        renderDrawer();
        refreshSaveBtn();
        var fixes = draft.importFixes || [];
        $('saveMsg').textContent = fixes.length
          ? 'Imported, with ' + fixes.length + ' schedule fix' + (fixes.length === 1 ? '' : 'es') + '. Press Save to keep it.'
          : 'Imported. Press Save to keep it.';
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
     theme. So on a first run only, look for an export sitting beside
     index.html and take the settings from that.

     It is loaded as a script rather than read as data, which is why the
     export writes one. Reading a file off disk from a file:// page needs
     --allow-file-access-from-files, and that flag does not stop at the
     one file it was wanted for: it turns every script on the page into a
     reader of anything the user can open -- their browser history, their
     keys, their documents -- for the life of the shortcut, in exchange
     for a convenience that runs once per profile. A script tag needs no
     flag, because a page has always been allowed to load its own
     scripts. A missing file is the ordinary case and is not an error. */
  function seedSettings(done) {
    var tag = document.createElement('script');
    var finished = false;
    function go() {
      if (finished) return;
      finished = true;
      tag.remove();
      try {
        if (window.DESKSIDE_SEED) {
          var seeded = normalise(importSettingsInto(clone(DEFAULTS), window.DESKSIDE_SEED));
          state = seeded;
          if (!station(state.currentStationId)) state.currentStationId = state.stations[0].id;
          save();
        }
      } catch (e) { /* not one of ours: carry on with defaults */ }
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
      renderStation(onDisplay.station);
      // The sliders showed the tone left in place rather than this station's.
      loadTone(onDisplay.station);
    }
    tick();
    startTicking();
    $('appVersion').textContent = 'v' + APP_VERSION;
    if (updateAvailable()) $('appVersion').classList.add('is-stale');
    // What the last check found, remembered across launches.
    syncUpdatePill();
    // Not on the critical path: let the radio come up first.
    setTimeout(function () { checkVersion(false); }, 3000);
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
     second is what the launcher makes. Look for a settings file before
     drawing anything, so the radio comes up already itself. */
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* storage unavailable */ }
  if (stored === null) seedSettings(boot); else boot();
})();
