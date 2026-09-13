/* Deskside Radio — state, audio engine, stream watchdog, metering, scheduler tick, UI. */
(function () {
  'use strict';

  var KEY = 'radio.v1';
  var THEMES = ['dial', 'console', 'rams', 'editorial', 'retro', 'departures', 'marconi', 'tivoli'];
  // Bump on release, and publish the same number in version.json.
  var APP_VERSION = '1.2.2';

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
    schedulerEnabled: false,
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
      if (THEMES.indexOf(merged.theme) === -1) merged.theme = DEFAULTS.theme;
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
    status = s;
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

  function resolvePlaylistThenTune(st, volume) {
    var original = st.url;
    playlistTried[original] = true;
    setStatus('connecting', 'Reading playlist');
    fetch(original, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : ''; })
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
    fetch(master, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : ''; })
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
    attempts = 0;
    ensureGraph();
    var target = resolveTarget();
    tune(target.station, target.volume);
  }

  function stopPlayback() {
    state.intendedPlaying = false;
    awaitingTap = false;
    launching = false;
    userStopping = true;
    clearTimeout(retryTimer); retryTimer = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    attempts = 0;
    setStatus('stopped', 'Stopped');
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
  function meterLoop(ts) {
    requestAnimationFrame(meterLoop);
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
      analyser.getByteFrequencyData(freqData);
      TunerUI.drawBars(el.tuner, freqData);
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
  }

  function setVolume(v, silent) {
    v = Math.max(0, Math.min(100, Math.round(v)));
    state.volume = v;
    var gain = Signal.volumeToGain(v);
    // The curve tops out at unity, so both paths can carry it unchanged and
    // the fader behaves the same whether or not the analyser tap is in use.
    if (gainNode && audio === corsEl) { corsEl.volume = 1; gainNode.gain.value = gain; }
    else audio.volume = gain;
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
    var way = isMac() ? "" : " To start it on its own, run Create Desktop Shortcut.cmd in the app folder.";
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

  var lastSlotKey;
  function slotKey(slot) { return slot ? slot.start + '|' + slot.end + '|' + slot.stationId + '|' + slot.volume : null; }

  function tick() {
    var now = new Date();
    el.clock.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
    var slot = state.schedulerEnabled ? Scheduler.activeSlot(state.schedule, now) : null;
    var key = slotKey(slot);
    if (key !== lastSlotKey) {
      var first = lastSlotKey === undefined;
      lastSlotKey = key;
      if (slot && !first && state.intendedPlaying) {
        var st = station(slot.stationId);
        if (st) {
          /* Whatever the slot applies wins over what is in use now. Tone is
             written onto the station before tuning, because tone belongs to
             the station and tune() reads it from there. */
          var want = Scheduler.slotSettings(slot);
          if (want.bass !== null) st.bass = want.bass;
          if (want.treble !== null) st.treble = want.treble;
          attempts = 0;
          tune(st, want.volume === null ? state.volume : want.volume);
          if (want.theme !== null && want.theme !== state.theme) {
            state.theme = want.theme;
            applyLook();
            save();
          }
        }
      }
    }
    renderNext(now);
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

  function renderNext(now) {
    el.schedNext.setAttribute('aria-hidden', state.schedulerEnabled ? 'false' : 'true');
    // Leave the old text in place while the chip is off: it is clipped to
    // zero width by CSS, and keeping it is what gives the slide something
    // to collapse.
    if (!state.schedulerEnabled) { return; }
    var n = Scheduler.nextChange(state.schedule, now);
    if (!n) { el.schedNext.textContent = 'No slots yet'; return; }
    var st = n.slot ? station(n.slot.stationId) : null;
    var when = pad(n.at.getHours()) + ':' + pad(n.at.getMinutes());
    var sameDay = n.at.toDateString() === now.toDateString();
    var day = sameDay ? '' : ' ' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][n.at.getDay()];
    el.schedNext.textContent = (st ? st.name : 'Free play') + ' at ' + when + day;
  }

  el.schedToggle.addEventListener('click', function () {
    state.schedulerEnabled = !state.schedulerEnabled;
    el.schedToggle.setAttribute('aria-pressed', state.schedulerEnabled);
    el.schedLabel.textContent = state.schedulerEnabled ? 'Schedule on' : 'Schedule off';
    lastSlotKey = undefined;
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
      fitWindow();
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
  if (document.fonts) {
    if (document.fonts.ready) document.fonts.ready.then(measurePresetNames);
    if (document.fonts.addEventListener) {
      document.fonts.addEventListener('loadingdone', measurePresetNames);
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
  function windowIsOurs() {
    var frame = window.outerHeight - window.innerHeight;
    return frame > 0 && frame < 60;
  }

  function fitWindow(pass) {
    if (!windowIsOurs() || !el.tuner) return;
    pass = pass || 0;
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

    if (Math.abs(w - window.outerWidth) > 1 || Math.abs(h - window.outerHeight) > 1) {
      try { window.resizeTo(w, h); } catch (e) { return; }
    }

    /* Settle rather than measure once. The first measurement is taken with
       a scrollbar still present, which narrows the tuner and so makes it
       taller than it will be once the bar goes; and a resize does not land
       within a frame, so re-reading immediately gets the old size back.
       Three passes is comfortably enough to converge, and each one is a
       no-op when nothing moved. */
    if (pass < 3) setTimeout(function () { fitWindow(pass + 1); }, 120);
  }

  function applyLook() {
    document.documentElement.setAttribute('data-theme', state.theme);
    requestAnimationFrame(function () {
      var st = currentStation();
      if (!st) return;
      TunerUI.setNeedle(el.tuner, st.band);
      TunerUI.setName(el.name, st.name);
    });
    // After the theme has painted, so the new height is the one measured.
    requestAnimationFrame(function () { fitWindow(); });
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
  el.bass.addEventListener('input', function () { ensureGraph(); state.bass = +el.bass.value; rememberTone(); applyTone(); save(); });
  el.treble.addEventListener('input', function () { ensureGraph(); state.treble = +el.treble.value; rememberTone(); applyTone(); save(); });
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

  function showPane(next, animate) {
    if (PANES.indexOf(next) === -1) next = PANES[0];
    pane = next;
    PANES.forEach(function (key) {
      var cap = key.charAt(0).toUpperCase() + key.slice(1);
      $('tab' + cap).setAttribute('aria-selected', key === pane ? 'true' : 'false');
      $('pane' + cap).hidden = key !== pane;
    });
    moveInk(animate);
  }

  $('drawerTabs').addEventListener('click', function (e) {
    var btn = e.target.closest('.dtab');
    if (btn) showPane(btn.dataset.pane, true);
  });

  function renderCounts() {
    refreshSaveBtn();
    $('countStations').textContent = draft.stations.length || '';
    var slots = draft.schedule.weekday.length + draft.schedule.weekend.length;
    $('countSchedule').textContent = slots || '';
  }

  function openSettings() {
    draft = clone({
      stations: state.stations, schedule: state.schedule, theme: state.theme,
      autoplay: state.autoplay, autoplayStationId: state.autoplayStationId
    });
    slotGroup = 'weekday';
    // Updates sit outside the draft: the switch takes effect as it is used.
    $('versionCheckOn').checked = !!state.versionCheck;
    renderUpdateLine();
    renderDrawer();
    // Snapshot after the render, which fills in any blanks of its own.
    draftClean = draftSnapshot();
    resetFinder();
    refreshSaveBtn();
    $('saveMsg').textContent = '';
    if (!el.settings.open) el.settings.showModal();
    // Offsets only exist once the dialog is laid out.
    showPane('stations', false);
  }
  $('openSettings').addEventListener('click', openSettings);

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
      body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
        '<plist version="1.0"><dict><key>URL</key><string>' + here + '</string></dict></plist>\n';
      type = 'application/xml';
      name = 'Deskside Radio.webloc';
    } else {
      /* The shortcut keeps the theme that was showing when it was made:
         each theme ships its own .ico, and a per-theme path also sidesteps
         the Windows icon cache, which keys on the file it was told about. */
      var known = /^(dial|console|rams|editorial|retro|departures|marconi|tivoli)$/.test(state.theme);
      var icon = windowsPathOf(appFolderUrl() + (known ? 'favicon-' + state.theme + '.ico' : 'favicon.ico'));
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

    if (mac) {
      setStatus(status, 'Shortcut downloaded · drag it to your Desktop');
      return;
    }
    setStatus(status, 'Shortcut downloaded · see the panel');

    /* The panel shows the icon the shortcut will carry, which is the theme
       showing right now — the same file the .url above points at, so what
       is previewed here is literally what lands on the Desktop. */
    var theme = known ? state.theme : 'dial';
    var named = label[state.theme] || 'Deskside Radio';
    var label = { dial: 'Analogue dial', console: 'Broadcast console', rams: 'Rams minimal', editorial: 'Editorial',
                  retro: 'Retro 8-bit', departures: 'Departures board', marconi: 'Marconi deco' };
    $('shortcutIcon').src = known ? 'favicon-' + theme + '.ico' : 'favicon.ico';
    $('shortcutIcon').alt = named + ' icon';
    $('shortcutTheme').textContent = named;
    $('shortcutCmd').textContent = windowsPathOf(appFolderUrl()) + 'Create Desktop Shortcut.cmd ' + theme;
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
      stations: draft.stations, schedule: draft.schedule, theme: draft.theme,
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
    for (var t = 0; t < tabs.length; t++) tabs[t].classList.toggle('is-active', tabs[t].dataset.group === slotGroup);
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
    { key: 'tivoli', label: 'Model One', note: 'The one-knob tabletop radio of the late 1990s' }
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
    if (used) notes.push('The schedule points at it from ' + used + ' slot' + (used === 1 ? '' : 's') + ', which will need another station.');
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
    draft.stations.splice(index, 1);
    openStation = null;
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
            '<input class="in" data-k="name" placeholder="Station name" aria-label="Name">' +
            '<input class="in in-band" data-k="band" placeholder="1010 AM" aria-label="Frequency">' +
            '<input class="in in-color" data-k="color" type="color" aria-label="Colour">' +
            '<input class="in in-url" data-k="url" placeholder="https://stream.example.com/live.mp3" aria-label="Stream URL">' +
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
    if (field) { field.focus(); field.select(); }
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

  el.settings.querySelector('.tabs').addEventListener('click', function (e) {
    if (!e.target.dataset.group) return;
    slotGroup = e.target.dataset.group;
    renderDrawer();
  });

  /* ---------- schedule slots ----------
     A slot is a time range and a station, plus up to four settings it can
     impose when it becomes the active one. Each of those is opt-in, so the
     card shows a chip for whichever are switched on and keeps the controls
     folded away until the card is opened. */
  var openSlot = null;

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
      kids[k].classList.toggle('is-open', slotGroup + k === openSlot);
    }
  }

  /* Remove sits one small button away from the toggle that opens the card,
     and a slot carries times, a station and up to four applied settings
     with no undo behind it. So it asks, and the question names the slot
     rather than saying "are you sure" about nothing in particular. */
  var pendingSlotDelete = null;

  function askDeleteSlot(group, index) {
    var slot = (draft.schedule[group] || [])[index];
    if (!slot) return;
    pendingSlotDelete = { group: group, index: index };
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
    if (target.index >= slots.length) return;
    slots.splice(target.index, 1);
    openSlot = null;
    renderSlotRows();
    renderCounts();
    // A splice is not an input event, so the footer label has to be told.
    refreshSaveBtn();
  });

  function renderSlotRows(errors) {
    var box = $('slotRows');
    box.innerHTML = '';
    var slots = draft.schedule[slotGroup];
    if (!slots.length) {
      var none = document.createElement('p');
      none.className = 'hint';
      none.textContent = 'No slots. Whatever you pick plays all day.';
      box.appendChild(none);
    }

    slots.forEach(function (slot, i) {
      if (!slot.stationId && draft.stations[0]) slot.stationId = draft.stations[0].id;
      var key = slotGroup + i;
      var card = document.createElement('div');
      card.className = 'card' + (key === openSlot ? ' is-open' : '');
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
            '<div class="slot-applies">' +
              '<span class="field-head">Apply when this slot starts</span>' +
            '</div>' +
            '<p class="err"></p>' +
          '</div>' +
        '</div>' +
        '</div>';

      var sel = card.querySelector('[data-k="stationId"]');
      draft.stations.forEach(function (x) {
        var opt = new Option(x.name || '(unnamed)', x.id);
        if (x.id === slot.stationId) opt.selected = true;
        sel.appendChild(opt);
      });

      var times = card.querySelectorAll('.slot-when .in');
      for (var t = 0; t < times.length; t++) {
        times[t].value = slot[times[t].dataset.k] != null ? slot[times[t].dataset.k] : '';
        times[t].addEventListener('input', function (e) {
          slot[e.target.dataset.k] = e.target.value;
          if (e.target.dataset.k === 'stationId') { renderSlotRows(); return; }
          card.querySelector('.card-name').textContent =
            (slot.start || '--:--') + ' to ' + (slot.end || '--:--');
        });
      }

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
        if (act === 'del') { askDeleteSlot(slotGroup, i); return; }
        openSlot = key === openSlot ? null : key;
        // Only the class changes, so the fold has something to animate.
        syncOpenSlots();
      });

      var errs = (errors || []).filter(function (er) { return er.index === i; });
      if (errs.length) {
        card.classList.add('has-err', 'is-open');
        card.querySelector('.err').textContent = errs.map(function (er) { return er.message; }).join(' ');
      }
      box.appendChild(card);
    });
  }

  function renderSlotChips(card, slot) {
    card.querySelector('.chips').innerHTML = APPLIES
      .filter(function (spec) { return applyOn(slot, spec); })
      .map(function (spec) { return '<span class="chip">' + spec.chip + '</span>'; }).join('');
  }

  $('addSlot').addEventListener('click', function () {
    var slots = draft.schedule[slotGroup];
    var last = slots[slots.length - 1];
    slots.push({
      start: last ? last.end : '07:00',
      end: last ? '23:00' : '10:00',
      stationId: draft.stations[0] ? draft.stations[0].id : '',
      volume: state.volume, applyVolume: true,
      bass: 0, applyBass: false,
      treble: 0, applyTreble: false,
      theme: state.theme, applyTheme: false
    });
    openSlot = slotGroup + (slots.length - 1);
    renderSlotRows();
    renderCounts();
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
    if (!draft.stations.length) { msg.textContent = 'Keep at least one station.'; msg.className = 'save-msg bad'; return false; }
    for (var i = 0; i < draft.stations.length; i++) {
      var s = draft.stations[i];
      if (!s.name.trim() || !/^https?:\/\/\S+$/i.test(s.url.trim())) {
        msg.textContent = 'Station ' + (i + 1) + ' needs a name and an http(s) stream URL.'; msg.className = 'save-msg bad'; return false;
      }
      s.name = s.name.trim(); s.url = s.url.trim();
    }
    var ids = draft.stations.map(function (s) { return s.id; });
    var groups = ['weekday', 'weekend'];
    for (var g = 0; g < groups.length; g++) {
      var errs = Scheduler.validateSlots(draft.schedule[groups[g]], ids);
      if (errs.length) {
        slotGroup = groups[g]; renderDrawer(); renderSlotRows(errs);
        msg.textContent = 'Fix the highlighted ' + groups[g] + ' slots.'; msg.className = 'save-msg bad'; return false;
      }
    }
    return true;
  }

  function stationsWithoutBand() {
    return draft.stations.filter(function (s) { return !String(s.band || '').trim(); });
  }

  function commitSettings() {
    var msg = $('saveMsg');
    state.stations = draft.stations;
    state.schedule = draft.schedule;
    state.theme = draft.theme;
    state.autoplay = !!draft.autoplay;
    state.autoplayStationId = draft.autoplayStationId;
    if (!station(state.currentStationId)) state.currentStationId = state.stations[0].id;
    if (state.lastGood && !station(state.lastGood.stationId)) state.lastGood = null;
    save(); applyLook(); renderPresets(); renderStation(currentStation());
    lastSlotKey = undefined; tick();
    draftClean = draftSnapshot();
    // Deliberately no refreshSaveBtn() here: the drawer is closing, and
    // flipping the label back to Close under the cursor reads as a second,
    // different button. openSettings() resets it on the next visit.
    msg.textContent = 'Saved'; msg.className = 'save-msg good is-exit';
    // Matches save-msg-cycle, so the drawer goes as the plate drops away.
    setTimeout(function () { if (el.settings.open) el.settings.close(); }, 1400);
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
    lastSlotKey = undefined;
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
  var CHECK_EVERY = 24 * 60 * 60 * 1000;

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

  function renderUpdateLine(note) {
    var line = $('updateLine');
    if (!line) return;
    line.className = 'update-line';
    if (note) { line.textContent = note; return; }
    if (!state.versionCheck) { line.textContent = 'Checking is off. Nothing is sent.'; return; }
    if (updateAvailable()) {
      line.className = 'update-line is-new';
      line.innerHTML = 'Version ' + escapeHtml(state.versionLatest) + ' is out. ' +
        '<a href="' + RELEASES_URL + '" target="_blank" rel="noopener">Open the releases page</a>';
      return;
    }
    var when = state.versionLastCheck ? new Date(state.versionLastCheck).toLocaleDateString() : 'not yet';
    line.textContent = 'Running ' + APP_VERSION + ' · last checked ' + when;
  }

  function checkVersion(force) {
    if (!state.versionCheck) { renderUpdateLine(); return; }
    if (!force && Date.now() - (state.versionLastCheck || 0) < CHECK_EVERY) { renderUpdateLine(); return; }
    if (typeof fetch !== 'function') return;
    fetch(VERSION_URL, { cache: 'no-store' }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (data) {
      state.versionLastCheck = Date.now();
      if (data && typeof data.version === 'string') state.versionLatest = data.version;
      save();
      renderUpdateLine();
      if (updateAvailable()) $('appVersion').classList.add('is-stale');
    }).catch(function () {
      // Offline, or GitHub is having a day. Say so and try again tomorrow.
      renderUpdateLine('Could not reach GitHub just now · running ' + APP_VERSION);
    });
  }

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
    var blob = new Blob([JSON.stringify({ stations: state.stations, schedule: state.schedule, theme: state.theme, volume: state.volume, bass: state.bass, treble: state.treble, autoplay: state.autoplay, autoplayStationId: state.autoplayStationId }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'deskside-radio-settings.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  /* One reading of an export file, shared by the Import button and the seed
     that a fresh profile picks up off disk. Throws on anything that is not
     one of ours, which is what both callers want to hear about. */
  function importSettingsInto(target, data) {
    if (!data || !Array.isArray(data.stations)) throw new Error('no stations');
    target.stations = data.stations;
    target.schedule = Object.assign({ weekday: [], weekend: [] }, data.schedule || {});
    if (THEMES.indexOf(data.theme) !== -1) target.theme = data.theme;
    target.autoplay = !!data.autoplay;
    target.autoplayStationId = data.autoplayStationId || null;
    return target;
  }

  $('importFile').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        importSettingsInto(draft, JSON.parse(r.result));
        renderDrawer();
        refreshSaveBtn();
        $('saveMsg').textContent = 'Imported. Press Save to keep it.'; $('saveMsg').className = 'save-msg good';
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
     theme. So on a first run only, look for an export file sitting beside
     index.html and take the settings from that. It has to be XHR — Chrome
     refuses fetch() on file: URLs outright, while XHR honours
     --allow-file-access-from-files, which the launcher passes. A page
     opened the ordinary way is simply refused, and boots on defaults. */
  function seedSettings(done) {
    var req;
    try { req = new XMLHttpRequest(); } catch (e) { return done(); }
    var finished = false;
    function go() { if (!finished) { finished = true; done(); } }
    req.onload = function () {
      try {
        // file:// reports status 0 on success, so judge it by the body.
        if (req.responseText) {
          var seeded = normalise(importSettingsInto(clone(DEFAULTS), JSON.parse(req.responseText)));
          if (!seeded.stations.length) throw new Error('no stations');
          state = seeded;
          if (!station(state.currentStationId)) state.currentStationId = state.stations[0].id;
          save();
        }
      } catch (e) { /* not one of ours: carry on with defaults */ }
      go();
    };
    req.onerror = go;
    req.ontimeout = go;
    req.timeout = 800;
    try {
      req.open('GET', 'deskside-radio-settings.json', true);
      req.send();
    } catch (e) { go(); }
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
    // Not on the critical path: let the radio come up first.
    setTimeout(function () { checkVersion(false); }, 3000);
    el.tuner.classList.add('is-quiet');
    meterQuiet = true;
    requestAnimationFrame(meterLoop);

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
