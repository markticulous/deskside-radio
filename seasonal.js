/* Deskside Radio — seasonal scenes.

   The little dramas the seasonal themes stage now and then, which a
   stylesheet cannot: it has no chance in it, and no way to say "and then".
   Everything here is drawn as inline SVG on a stage laid over the tuner and
   moved with the Web Animations API, so the travel runs on the compositor.

   It keeps to itself. It reads which theme a tuner is wearing from the
   nearest [data-theme] -- the root in the app, each slot on the preview
   page -- and whether it is playing from .is-playing, and it touches
   nothing of the app's. Scenes only start while the set is playing, the
   tab is visible and motion is allowed; a change of theme mid-scene clears
   the stage at once.

   The helicopter and the landing have sounds, made here with Web Audio in
   a context of their own, quiet and scaled by the volume slider.

   Autumn Gobble (key: harvest) has two:
     turkey  -- runs across the bottom now and then; sometimes stops half
                way, has a look round, thinks better of it and runs back.
     wkrp    -- rarely: a helicopter hovers, the door slides open, a turkey
                is sent out of it, and turkeys, as it turns out, cannot fly.

   Noel (key: christmas) has three small ones and a big one:
     snowman  -- three snowballs roll in and stack themselves, dress, wave
     elf      -- a bulb in the lights goes, and an elf abseils in to change it
     cardinal -- a red bird lands on the holly, shakes off the snow, pecks
     sleigh   -- rarely: the sleigh crosses the top of the window and drops
                 presents in the snow, and a raccoon comes for them.

   Halloween Fun (key: halloween) has a small one and a big one:
     skeleton -- rises from behind one headstone, walks along to another,
                 waves, and sinks back down behind that one.
     broom    -- rarely: a witch's broom breaks down in mid-air, a ghost
                 mends it and keeps her hat, and the raccoon ends up with it.
   And, not a scene, the spider in the cobweb, which now and then lets
   itself down on a thread, turns in the draught and climbs back.

   April Showers (key: spring) has four small ones and a big one:
     duck, umbrella, butterfly, rainbow
     ark      -- rarely: it pours, the water rises, an ark sails through,
                 and the raccoons run after it.

   Each face's big scene can also be sent for with Shift and the first
   three letters of its name: Shift+H+A+L on Halloween Fun, Shift+A+U+T on
   Autumn Gobble, Shift+N+O+E on Noel, Shift+A+P+R on April Showers --
   each only on its own face. (Longer words were too hard to hold down.) */
(function () {
  'use strict';

  var reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var rigs = [];
  var ABORT = {};

  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  /* Frames in turn: for each [value, ms], show(value) and hold it ms. ok is
     the scene's guard, so a scene cut short stops part-way through. */
  function frames(list, ok, show) {
    return list.reduce(function (p, f) {
      return p.then(ok).then(function () { show(f[0]); return wait(f[1]); });
    }, Promise.resolve());
  }

  function themeOf(tuner) {
    var host = tuner.closest('[data-theme]');
    return host ? host.getAttribute('data-theme') : '';
  }
  /* Which scenes each face stages, how often the small ones come, and the
     letters that send for the big one. */
  var CAST = {
    halloween: { small: ['skeleton'], gap: [150, 360], big: 'broom', combo: 'hal' },
    harvest:   { small: ['turkey'], gap: [25, 70], big: 'wkrp', combo: 'aut' },
    christmas: { small: ['snowman', 'elf', 'cardinal'], gap: [90, 240], big: 'sleigh', combo: 'noe' },
    spring:    { small: ['duck', 'umbrella', 'butterfly', 'rainbow'], gap: [70, 200], big: 'ark', combo: 'apr' }
  };
  function active(rig) {
    return !!CAST[themeOf(rig.tuner)] && rig.tuner.classList.contains('is-playing') &&
      !document.hidden && !(reduced && reduced.matches);
  }

  /* Move an element from one transform to another and leave it there.
     The end state is written to the element and the animation dropped, so
     the next move starts from a plain value rather than from a pile of
     filled animations. */
  function move(el, frames, opts) {
    var a = el.animate(frames, opts);
    return a.finished.then(function () {
      el.style.transform = frames[frames.length - 1].transform;
      a.cancel();
    });
  }
  function tr(x, y, extra) { return 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)' + (extra || ''); }

  /* ------------------------------------------------------------------ */
  /* The turkey, in five poses. Faces right; flipped to face left.       */
  /* ------------------------------------------------------------------ */

  function spin(vals, cx, cy, dur, begin) {
    return '<animateTransform attributeName="transform" type="rotate" values="' +
      vals.map(function (v) { return v + ' ' + cx + ' ' + cy; }).join(';') +
      '" dur="' + dur + 's" begin="' + (begin || 0) + 's" repeatCount="indefinite"/>';
  }
  var FEATHER = ['#8a4a1e', '#c9772a', '#e8b24a', '#c9772a', '#8a4a1e'];
  function tail(wobble) {
    return '<g>' + (wobble ? spin([-wobble, wobble, -wobble], 26, 38, wobble > 10 ? 0.2 : 0.52) : '') +
      [-70, -48, -26, -4, 18].map(function (a, i) {
        return '<ellipse cx="24" cy="20" rx="5" ry="15" transform="rotate(' + a + ' 26 38)" fill="' + FEATHER[i] + '" stroke="#4a240e" stroke-width="1"/>';
      }).join('') + '</g>';
  }
  var BODY = '<ellipse cx="42" cy="42" rx="17" ry="14" fill="#6b3a1c" stroke="#3a1c0a" stroke-width="1.2"/>' +
    '<path d="M30 44Q42 52 56 42" fill="none" stroke="#8a4a24" stroke-width="2"/>';
  function wing(flail, dur) {
    return '<g>' + (flail ? spin([10, -flail, 10], 38, 36, dur) : '') +
      '<path d="M38 36Q30 30 22 36Q28 40 26 46Q34 44 40 42Z" fill="#4a240e" stroke="#301606" stroke-width="1"/></g>';
  }
  function leg(x, anim) {
    return '<g>' + (anim || '') + '<path d="M' + x + ' 52L' + x + ' 68M' + x + ' 68L' + (x + 6) + ' 70M' + x + ' 68L' + (x + 4) + ' 73M' + x + ' 68L' + (x - 4) + ' 71"/></g>';
  }
  var LEGS_OPEN = '<g stroke="#e0a030" stroke-width="2.6" stroke-linecap="round" fill="none">';
  function head(o) {
    // o: { bob, eye: 'jiggle' | 'look' | 'panic' | 'dizzy' }
    var pupil;
    if (o.eye === 'look') {
      pupil = '<circle cx="59.6" cy="13.6" r="1.9" fill="#000"><animate attributeName="cx" values="59.4;59.4;62.8;62.8;59.4" keyTimes="0;.3;.4;.8;1" dur="2.2s" repeatCount="indefinite"/></circle>';
    } else if (o.eye === 'panic') {
      pupil = '<circle cx="61" cy="13.5" r="1.1" fill="#000"/>';
    } else if (o.eye === 'dizzy') {
      pupil = '<path d="M61 13.5m-2.6 0a2.6 2.6 0 1 0 5.2 0a1.8 1.8 0 1 0-3.6 0a1 1 0 1 0 2 0" fill="none" stroke="#000" stroke-width=".9"/>';
    } else {
      pupil = '<circle cx="62" cy="14" r="1.9" fill="#000"><animate attributeName="cx" values="59.6;63;60.4;62.6;59.6" dur=".34s" repeatCount="indefinite"/><animate attributeName="cy" values="12.4;15;14.4;12;12.4" dur=".29s" repeatCount="indefinite"/></circle>';
    }
    return '<g>' + (o.bob ? spin(o.bob, 54, 38, o.bobDur || 0.26) : '') +
      '<path d="M52 38Q58 28 58 20" fill="none" stroke="#c96a5a" stroke-width="6" stroke-linecap="round"/>' +
      '<circle cx="60" cy="17" r="7" fill="#d07a66"/>' +
      '<path d="M66 16L74 18.5L66 21Z" fill="#f2b233"/>' +
      '<g>' + spin([-20, 25, -20], 65, 16, o.eye === 'panic' ? 0.14 : 0.26) + '<path d="M65 16Q70 22 67 29" fill="none" stroke="#d1122e" stroke-width="2.6" stroke-linecap="round"/></g>' +
      '<path d="M60 23Q61 31 57 33Q55 28 57 23Z" fill="#d1122e"/>' +
      '<circle cx="61" cy="13.5" r="' + (o.eye === 'panic' ? 5 : 4.2) + '" fill="#fff" stroke="#301606" stroke-width=".8"/>' + pupil +
      '</g>';
  }
  function star(x, y) {
    return '<path transform="translate(' + x + ' ' + y + ')" d="M0-4L1.1-1.2L4-1.2L1.7.6L2.5 3.5L0 1.8L-2.5 3.5L-1.7.6L-4-1.2L-1.1-1.2Z" fill="#ffd23a" stroke="#8a5a10" stroke-width=".5"/>';
  }

  function turkeySvg(pose) {
    var open = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-16 0 106 80" width="100%" height="100%" overflow="visible">';
    if (pose === 'run') {
      return open + '<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -4;0 0" dur=".26s" repeatCount="indefinite"/>' +
        tail(8) + LEGS_OPEN + leg(40, spin([-38, 34, -38], 40, 52, 0.26)) + leg(44, spin([34, -38, 34], 44, 52, 0.26)) + '</g>' +
        BODY + wing(62, 0.2) + head({ bob: [-6, 12, -6], eye: 'jiggle' }) + '</g></svg>';
    }
    if (pose === 'stand') {
      return open + tail(0) + LEGS_OPEN + leg(40) + leg(44) + '</g>' + BODY + wing(0) +
        head({ bob: [-4, 5, -4], bobDur: 1.1, eye: 'look' }) + '</svg>';
    }
    if (pose === 'kick') {
      // Coming out of the door with nothing under it: legs kicking at thin air, out of step.
      return open + tail(4) + LEGS_OPEN + leg(40, spin([-40, 30, -40], 40, 52, 0.18)) + leg(44, spin([28, -44, 28], 44, 52, 0.15)) + '</g>' +
        BODY + wing(20, 0.3) + head({ bob: [-6, 8, -6], bobDur: 0.3, eye: 'panic' }) + '</svg>';
    }
    if (pose === 'flap') {
      // Falling, and flapping for all it is worth. It does not help.
      return open + tail(16) + LEGS_OPEN + leg(40, spin([-50, 30, -50], 40, 52, 0.14)) + leg(44, spin([30, -50, 30], 44, 52, 0.14)) + '</g>' +
        BODY + wing(95, 0.09) + head({ bob: [-14, 10, -14], bobDur: 0.16, eye: 'panic' }) + '</svg>';
    }
    if (pose === 'splat') {
      // Flat on the ground, legs in the air, head down.
      return open +
        '<g transform="translate(0 30) scale(1.18 .5)">' + tail(0) + BODY + '</g>' +
        '<g stroke="#e0a030" stroke-width="2.6" stroke-linecap="round" fill="none">' +
          '<g>' + spin([-6, 6, -6], 40, 48, 0.18) + '<path d="M38 50L26 26M26 26L20 25M26 26L22 21M26 26L28 20"/></g>' +
          '<g>' + spin([5, -7, 5], 48, 48, 0.21) + '<path d="M48 50L62 30M62 30L68 32M62 30L67 26M62 30L61 24"/></g>' +
        '</g>' +
        '<path d="M56 60Q66 64 74 64" fill="none" stroke="#c96a5a" stroke-width="6" stroke-linecap="round"/>' +
        '<circle cx="78" cy="63" r="6.5" fill="#d07a66"/><path d="M84 62L91 64L84 66Z" fill="#f2b233"/>' +
        '<path d="M76 59L81 64M81 59L76 64" stroke="#000" stroke-width="1.3"/>' +
        '</svg>';
    }
    if (pose === 'dizzy' || pose === 'duck') {
      /* Head up at last, with the stars going round it. 'duck': the same,
         the head then bowing right down from the base of the neck as the
         sack comes over it, stars and all. */
      var bow = pose === 'duck'
        ? '<animateTransform attributeName="transform" type="rotate" values="0 52 42;62 52 42" dur=".6s" calcMode="spline" keyTimes="0;1" keySplines=".4 0 .3 1" fill="freeze"/>'
        : '';
      return open +
        '<g transform="translate(0 20) scale(1.08 .72)">' + tail(0) + BODY + '</g>' +
        '<g stroke="#e0a030" stroke-width="2.6" stroke-linecap="round" fill="none">' +
          '<path d="M36 54L20 62M20 62L15 60M20 62L16 66"/><path d="M50 56L66 66M66 66L71 63M66 66L70 70"/>' +
        '</g>' +
        '<g>' + bow + head({ bob: [-12, 12, -12], bobDur: 0.9, eye: 'dizzy' }) +
        '<g transform="translate(60 3) scale(1 .42)"><g>' +
          '<animateTransform attributeName="transform" type="rotate" values="0;360" dur=".9s" repeatCount="indefinite"/>' +
          star(14, 0) + star(-7, 12) + star(-7, -12) +
        '</g></g></g>' +
        '</svg>';
    }
    var dazed = pose === 'riseDazed';
    if (pose === 'dazed') {
      // On its feet but not with it: swaying about its feet, head lolling, stars going round.
      return open + '<g><animateTransform attributeName="transform" type="rotate" values="-5 42 70;5 42 70;-5 42 70" dur="1.6s" calcMode="spline" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1" repeatCount="indefinite"/>' +
        tail(0) + LEGS_OPEN + leg(40) + leg(44) + '</g>' + BODY + wing(0) +
        head({ bob: [-12, 12, -12], bobDur: 0.9, eye: 'dizzy' }) + '<g transform="translate(60 3) scale(1 .42)"><g>' +
          '<animateTransform attributeName="transform" type="rotate" values="0;360" dur=".9s" repeatCount="indefinite"/>' +
          star(14, 0) + star(-7, 12) + star(-7, -12) +
        '</g></g>' + '</g></svg>';
    }
    if (pose === 'rise' || dazed) {
      /* Getting up, as motion rather than a change of picture: the body
         slides up out of its squash, each leg swings from splayed to
         straight down about its hip, and the stars go out. It ends exactly
         where 'stand' begins, so the swap after it cannot be seen. */
      var D = 0.8, sp = ' calcMode="spline" keyTimes="0;.7;1" keySplines=".3 .7 .4 1;.4 0 .6 1" dur="' + D + 's" fill="freeze"';
      return open +
        '<g><animateTransform attributeName="transform" type="translate" values="0 20;0 -2;0 0"' + sp + '/>' +
          '<g><animateTransform attributeName="transform" type="scale" values="1.08 .72;.98 1.04;1 1"' + sp + '/>' + tail(0) + BODY + '</g>' +
        '</g>' +
        '<g stroke="#e0a030" stroke-width="2.6" stroke-linecap="round" fill="none">' +
          '<g><animateTransform attributeName="transform" type="translate" values="3.2 5.4;0 -1;0 0"' + sp + '/>' +
            '<g><animateTransform attributeName="transform" type="rotate" values="64 40 52;-4 40 52;0 40 52"' + sp + '/>' + leg(40).replace(/^<g>|<\/g>$/g, '') + '</g>' +
            '<g><animateTransform attributeName="transform" type="rotate" values="-58 44 52;4 44 52;0 44 52"' + sp + '/>' + leg(44).replace(/^<g>|<\/g>$/g, '') + '</g>' +
          '</g>' +
        '</g>' +
        head(dazed ? { bob: [-12, 12, -12], bobDur: 0.9, eye: 'dizzy' } : { bob: [-6, 4, -6], bobDur: 0.8, eye: 'look' }) +
        '<g transform="translate(60 3) scale(1 .42)"><g>' +
          (dazed ? '' : '<animate attributeName="opacity" values="1;0" dur=".35s" fill="freeze"/>') +
          '<animateTransform attributeName="transform" type="rotate" values="0;360" dur=".9s" repeatCount="indefinite"/>' +
          star(14, 0) + star(-7, 12) + star(-7, -12) +
        '</g></g>' +
        '</svg>';
    }
    return '';
  }

  /* ------------------------------------------------------------------ */
  /* The helicopter. Nose left. 220 x 130 user units.                   */
  /* ------------------------------------------------------------------ */
  var HELI_W = 220, HELI_H = 130, HELI_SCALE = 1.1;
  var DOOR = { x: 102, y: 66 };  // centre of the door opening, in its own units
  var HELI_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 130" width="100%" height="100%" overflow="visible">' +
      '<path d="M130 58L204 48L206 58L132 72Z" fill="#e8a93a" stroke="#5a3410" stroke-width="2"/>' +
      '<path d="M196 50L206 24L215 27L209 56Z" fill="#d9531e" stroke="#5a3410" stroke-width="1.5"/>' +
      '<g transform="translate(209 34)"><g><animateTransform attributeName="transform" type="rotate" values="0;360" dur=".15s" repeatCount="indefinite"/>' +
        '<rect x="-1.6" y="-14" width="3.2" height="28" rx="1.6" fill="#3a2410"/></g><circle r="2.6" fill="#3a2410"/></g>' +
      '<g stroke="#3a2410" stroke-width="3.2" stroke-linecap="round" fill="none"><path d="M34 105Q37 114 46 114H148"/><path d="M62 97L58 114M112 97L116 114"/></g>' +
      /* The body in three: the paint, the stripe cut to the body's shape, and
         the outline over both, so the stripe runs under the line rather than
         across it. */
      '<defs><clipPath id="st-heli-body"><path d="M28 70Q24 36 64 30L118 30Q146 32 146 64Q146 96 110 98L58 98Q30 96 28 70Z"/></clipPath></defs>' +
      '<path d="M28 70Q24 36 64 30L118 30Q146 32 146 64Q146 96 110 98L58 98Q30 96 28 70Z" fill="#f2c14e"/>' +
      '<path d="M20 78H154" stroke="#d9531e" stroke-width="6" clip-path="url(#st-heli-body)"/>' +
      '<path d="M28 70Q24 36 64 30L118 30Q146 32 146 64Q146 96 110 98L58 98Q30 96 28 70Z" fill="none" stroke="#5a3410" stroke-width="2.5"/>' +
      '<path d="M34 62Q36 38 64 36L68 62Z" fill="#8fc6e8" stroke="#5a3410" stroke-width="2"/>' +
      '<path d="M40 54Q44 42 56 40" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.4" stroke-linecap="round"/>' +
      /* The pilot: leather flying cap, goggles up on the brim, a nose you
         could hang a hat on and a moustache under it. Three faces, of which
         the stylesheet shows one: looking ahead, looking back at the door,
         and aghast. The window clips him. */
      '<defs><clipPath id="st-cockpit"><path d="M34 62Q36 38 64 36L68 62Z"/></clipPath></defs>' +
      '<g clip-path="url(#st-cockpit)"><g class="p-head">' +
        '<ellipse cx="55" cy="64" rx="13" ry="7" fill="#7a4a24"/><path d="M50 58L55 63L60 58" fill="#f2e2c0"/>' +
        '<circle cx="55" cy="49" r="8.2" fill="#f0c29a" stroke="#8a5a3a" stroke-width=".8"/>' +
        '<path d="M46.6 49Q46 39.5 55 39Q64 39.5 63.6 49Q59 45 55 45Q51 45 46.6 49Z" fill="#6b3a1c"/>' +
        '<path d="M47 52Q46 58 49 59M63 52Q64 58 61 59" fill="none" stroke="#6b3a1c" stroke-width="2.2" stroke-linecap="round"/>' +
        '<g fill="#bfe3f2" stroke="#3a2410" stroke-width="1"><circle cx="51.6" cy="42.6" r="2.3"/><circle cx="57.4" cy="42.6" r="2.3"/></g>' +
        '<g class="p-fwd">' +
          '<circle cx="50.2" cy="48.4" r="1.25" fill="#1a1008"/><path d="M48.4 46.2L51.8 45.6" stroke="#3a2410" stroke-width="1"/>' +
          '<ellipse cx="46.6" cy="51" rx="2.8" ry="2.2" fill="#e8a882" stroke="#8a5a3a" stroke-width=".6"/>' +
          '<path d="M44 53.6Q47 52 50.6 53.4Q48.6 55.6 45.6 55.4Q44.4 55 44 53.6Z" fill="#5a3418"/>' +
        '</g>' +
        '<g class="p-back">' +
          '<circle cx="56.6" cy="48.2" r="1.25" fill="#1a1008"/><circle cx="61" cy="48.2" r="1.25" fill="#1a1008"/>' +
          '<path d="M55 45.8L58 45.4M59.8 45.4L62.6 45.8" stroke="#3a2410" stroke-width="1"/>' +
          '<ellipse cx="63" cy="51" rx="2.6" ry="2.1" fill="#e8a882" stroke="#8a5a3a" stroke-width=".6"/>' +
          '<path d="M56 53.6Q59.6 52 63.4 53.4Q61.6 55.8 58.2 55.6Q56.6 55 56 53.6Z" fill="#5a3418"/>' +
        '</g>' +
        '<g class="p-talk">' +
          '<circle cx="49.6" cy="48.2" r="1.25" fill="#1a1008"/><circle cx="54.6" cy="48.2" r="1.25" fill="#1a1008"/>' +
          '<path d="M47.8 45.8L51 45.3M53 45.3L56.2 45.8" stroke="#3a2410" stroke-width="1"/>' +
          '<ellipse cx="51.4" cy="51.2" rx="2.6" ry="2.1" fill="#e8a882" stroke="#8a5a3a" stroke-width=".6"/>' +
          '<path class="p-shut" d="M49.2 56.4Q51.4 57.2 53.6 56.4" fill="none" stroke="#5a3418" stroke-width="1" stroke-linecap="round"/>' +
          '<ellipse class="p-lips" cx="51.4" cy="56.6" rx="1.9" ry="1" fill="#3a1008">' +
            '<animate attributeName="ry" values=".35;1.5;.7;1.3;.4;1.6;.8;.35" keyTimes="0;.14;.27;.42;.55;.7;.85;1" dur=".95s" repeatCount="indefinite"/>' +
          '</ellipse>' +
          '<path d="M47.2 53.6Q51.4 51.8 55.6 53.6Q54 55.6 51.4 55.4Q48.8 55.6 47.2 53.6Z" fill="#5a3418"/>' +
        '</g>' +
        '<g class="p-shock">' +
          '<circle cx="51.8" cy="47.6" r="2.4" fill="#fff" stroke="#1a1008" stroke-width=".7"/><circle cx="58.4" cy="47.6" r="2.4" fill="#fff" stroke="#1a1008" stroke-width=".7"/>' +
          '<circle cx="52.4" cy="48.2" r=".9" fill="#1a1008"/><circle cx="59" cy="48.2" r=".9" fill="#1a1008"/>' +
          '<path d="M49.6 43.8Q51.8 42.6 54 43.6M56.2 43.6Q58.4 42.6 60.6 43.8" fill="none" stroke="#3a2410" stroke-width="1"/>' +
          '<ellipse cx="55" cy="51.4" rx="2.5" ry="2" fill="#e8a882" stroke="#8a5a3a" stroke-width=".6"/>' +
          '<path d="M51 53.8Q55 52.6 59 53.8" fill="none" stroke="#5a3418" stroke-width="1.8" stroke-linecap="round"/>' +
          '<ellipse cx="55" cy="56.6" rx="1.6" ry="2" fill="#3a1008"/>' +
        '</g>' +
      '</g></g>' +
      '<rect x="82" y="42" width="40" height="46" rx="4" fill="#2a1a10"/>' +
      '<g class="door">' +
        '<rect x="82" y="42" width="40" height="46" rx="4" fill="#f2c14e" stroke="#5a3410" stroke-width="2"/>' +
        '<text x="102" y="70" text-anchor="middle" font-family="Oswald, Impact, \'Arial Black\', sans-serif" font-weight="700" font-size="13" letter-spacing=".5" fill="#b8321a">WKRP</text>' +
        '<circle cx="87" cy="66" r="1.7" fill="#5a3410"/>' +
      '</g>' +
      // The rail the door runs on. The body's edge at this height is at
      // 136, so it stops short of that rather than poking past it.
      '<path d="M82 89H133" stroke="#5a3410" stroke-width="1.5" stroke-opacity=".6"/>' +
      '<rect x="84" y="17" width="10" height="14" rx="2" fill="#5a3410"/>' +
      '<g transform="translate(89 17)">' +
        '<ellipse rx="100" ry="3.6" fill="#3a2410"><animateTransform attributeName="transform" type="scale" values="1 1;.06 1;1 1" dur=".16s" repeatCount="indefinite"/></ellipse>' +
        '<ellipse rx="100" ry="3" fill="#3a2410" opacity=".35"><animateTransform attributeName="transform" type="scale" values=".06 1;1 1;.06 1" dur=".16s" repeatCount="indefinite"/></ellipse>' +
        '<circle r="4.2" fill="#5a3410"/>' +
      '</g>' +
    '</svg>';

  /* ------------------------------------------------------------------ */
  /* Sound: a helicopter and a thud, made here rather than shipped       */
  /* ------------------------------------------------------------------ */

  /* A context of its own, never the radio's: the stream's graph is built
     and resumed only on the radio's own terms, and nothing here should be
     able to touch it. Made on first use; if the browser will not let it
     start, the scene simply plays in silence. */
  var sfxCtx = null, noise = null;
  function sfx() {
    if (!sfxCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { sfxCtx = new AC(); } catch (e) { return null; }
    }
    if (sfxCtx.state === 'suspended') sfxCtx.resume().catch(function () {});
    return sfxCtx;
  }
  /* On the radio's own volume curve, so an effect stays the same distance
     under the station at every setting and goes silent with it at 0. Read
     from the slider, which every way of changing the volume moves -- a
     drag, the wheel, a schedule slot, the double-click glide. */
  function sfxLevel() {
    var v = document.querySelector('#volume, [data-vol]');
    var n = v ? Number(v.value) : 60;
    if (!isFinite(n)) n = 60;
    return window.Signal && Signal.volumeToGain ? Signal.volumeToGain(n) : (n <= 0 ? 0 : Math.pow(10, (n - 100) * 0.03));
  }
  /* What every effect shares: a master gain, for its own fades, feeding the
     radio's volume curve -- followed while it sounds, as the listener moves
     the slider -- and a place in the stereo field if pan is given. Sources
     put in live are stopped with it; stop(s) fades it out over s seconds,
     and a moment after, drops the follower and runs onEnd if one is set.
     fadeIn(s) brings it up to peak. */
  function sfxBus(ac, start, pan, peak) {
    var master = ac.createGain(); master.gain.value = start;
    var vol = ac.createGain(); vol.gain.value = sfxLevel();
    master.connect(vol);
    var p = pan != null && ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (p) { p.pan.value = pan; vol.connect(p); p.connect(ac.destination); }
    else vol.connect(ac.destination);
    var follow = setInterval(function () { vol.gain.setTargetAtTime(sfxLevel(), ac.currentTime, 0.06); }, 150);
    var bus = {
      master: master, live: [], done: false, onEnd: null,
      fadeIn: function (s) { master.gain.setTargetAtTime(peak == null ? 1 : peak, ac.currentTime, s / 3); },
      panTo: function (to, s) {
        if (!p) return;
        var now = ac.currentTime;
        p.pan.cancelScheduledValues(now); p.pan.setValueAtTime(p.pan.value, now);
        p.pan.linearRampToValueAtTime(to, now + s);
      },
      stop: function (s) {
        if (bus.done) return;
        bus.done = true;
        var now = ac.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(0, now + s);
        bus.live.forEach(function (n) { try { n.stop(now + s + 0.05); } catch (e) {} });
        setTimeout(function () { clearInterval(follow); if (bus.onEnd) bus.onEnd(); }, (s + 0.2) * 1000);
      }
    };
    return bus;
  }
  function noiseOf(ac) {
    if (noise && noise.sampleRate === ac.sampleRate) return noise;
    noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    var d = noise.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }

  /* Gains before the volume curve. The rotor is low-passed noise, whose
     level runs about 20 dB under its gain: 0.8 measured offline at 7 dB
     under a station's programme (around -12 dBFS), which was too much, so
     0.35 puts it about 14 dB under at any volume. 0.05 was inaudible. The
     thud is a knock at about programme peak. */
  var HELI_PEAK = 0.39, THUD_PEAK = 0.5;   // the rotor up about 1 dB, 2026-09-27, at Mark's ear

  /* Rotor wash: noise, low-passed, chopped at the blade rate, over a low
     hum. Returns handles to bring it in, pan it along with the machine and
     take it away again. */
  function heliSound() {
    var ac = sfx();
    if (!ac) return null;
    var t = ac.currentTime;
    var bus = sfxBus(ac, 0, 0.8, HELI_PEAK), master = bus.master;

    var src = ac.createBufferSource(); src.buffer = noiseOf(ac); src.loop = true;
    var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 0.8;
    var chop = ac.createGain(); chop.gain.value = 0.5;
    var lfo = ac.createOscillator(); lfo.frequency.value = 11;
    var depth = ac.createGain(); depth.gain.value = 0.48;
    lfo.connect(depth); depth.connect(chop.gain);
    src.connect(lp); lp.connect(chop); chop.connect(master);

    var hum = ac.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 88;
    var humLp = ac.createBiquadFilter(); humLp.type = 'lowpass'; humLp.frequency.value = 300;
    var humGain = ac.createGain(); humGain.gain.value = 0.35;
    hum.connect(humLp); humLp.connect(humGain); humGain.connect(master);

    src.start(t); lfo.start(t); hum.start(t);
    bus.live.push(src, lfo, hum);
    return bus;
  }

  /* A body meeting the ground: a tone falling fast, and a soft burst. Pitched
     from 190 Hz rather than an octave lower, because desk and laptop speakers
     give out below about 150 Hz and a deeper thud was barely there on them. */
  function thudSound() {
    var ac = sfx();
    if (!ac) return;
    var t = ac.currentTime + 0.01, peak = THUD_PEAK * sfxLevel();
    var osc = ac.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.2);
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    osc.connect(g); g.connect(ac.destination);
    osc.start(t); osc.stop(t + 0.42);

    var n = ac.createBufferSource(); n.buffer = noiseOf(ac);
    var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    var ng = ac.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(peak * 0.7, t + 0.004);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    n.connect(lp); lp.connect(ng); ng.connect(ac.destination);
    n.start(t); n.stop(t + 0.12);
  }

  /* ------------------------------------------------------------------ */
  /* Stage and scenes                                                   */
  /* ------------------------------------------------------------------ */

  function stageOf(rig) {
    if (!rig.stage || !rig.stage.isConnected) {
      rig.stage = document.createElement('div');
      rig.stage.className = 'season-stage';
      rig.stage.setAttribute('aria-hidden', 'true');
      rig.tuner.appendChild(rig.stage);
    }
    return rig.stage;
  }
  function clear(rig) {
    rig.gen++;
    rig.busy = false;
    if (rig.sound) { rig.sound.stop(0.3); rig.sound = null; }
    var m = rig.tuner.querySelector('.meter');
    if (m) m.style.removeProperty('--dead-x');
    rig.tuner.classList.remove('sp-lull', 'sp-rainbow', 'sp-pour', 'sp-flooded', 'sp-ebb', 'hw-follow', 'hw-scene');
    Array.prototype.forEach.call(rig.tuner.querySelectorAll('.sp-tulip'), function (t) { t.style.removeProperty('--dip'); });
    var yard = rig.tuner.querySelector('.sp-yard');
    if (yard) {
      yard.getAnimations({ subtree: true }).forEach(function (a) { a.cancel(); });
      yard.innerHTML = '';
    }
    if (rig.stage) {
      rig.stage.getAnimations({ subtree: true }).forEach(function (a) { a.cancel(); });
      rig.stage.innerHTML = '';
    }
  }

  var TURKEY_W = 113, TURKEY_H = 86, RUN_PX_S = 330;
  /* Where the turkey stands: its feet (73 of the drawing's 80 units down) on
     the cream trim along the bottom of the cabinet, 3px above the edge. */
  var FEET = 73 / 80, TRIM = 3;
  function groundY(H, t) { return H - TRIM - t.h * FEET; }
  function makeTurkey(stage, scale) {
    var t = { scale: scale || 1, facing: 1, x: 0, y: 0 };
    t.w = TURKEY_W * t.scale; t.h = TURKEY_H * t.scale;
    t.el = document.createElement('div');
    t.el.className = 'st-turkey';
    t.el.style.width = t.w + 'px'; t.el.style.height = t.h + 'px';
    t.face = document.createElement('div');
    t.face.className = 'st-face';
    t.el.appendChild(t.face);
    stage.appendChild(t.el);
    return t;
  }
  function pose(t, name) { t.face.innerHTML = turkeySvg(name); }
  function face(t, dir) { t.facing = dir; t.face.style.transform = dir < 0 ? 'scaleX(-1)' : ''; }
  function place(t, x, y) { t.x = x; t.y = y; t.el.style.transform = tr(x, y); }
  function runTo(t, x) {
    pose(t, 'run');
    face(t, x > t.x ? 1 : -1);
    var from = tr(t.x, t.y), dur = Math.abs(x - t.x) / RUN_PX_S * 1000;
    t.x = x;
    return move(t.el, [{ transform: from }, { transform: tr(x, t.y) }], { duration: dur, easing: 'linear' });
  }

  /* Checks, between steps, that the scene is still wanted. */
  function guard(rig, gen) {
    return function (v) { if (rig.gen !== gen) throw ABORT; return v; };
  }

  function turkeyRun(rig) {
    var stage = stageOf(rig), gen = rig.gen, ok = guard(rig, gen);
    var W = stage.clientWidth, H = stage.clientHeight;
    var t = makeTurkey(stage, 1);
    var fromLeft = Math.random() < 0.5;
    var off = t.w + 20;
    var startX = fromLeft ? -off : W + 20, endX = fromLeft ? W + 20 : -off;
    place(t, startX, groundY(H, t));
    var p;
    if (Math.random() < 0.42) {
      // Stops somewhere in the middle, looks about, and goes back.
      var stopX = rand(W * 0.25, W * 0.7);
      p = runTo(t, stopX).then(ok).then(function () {
        pose(t, 'stand');
        return wait(rand(700, 1100));
      }).then(ok).then(function () {
        face(t, -t.facing);        // looks back the way it came
        return wait(rand(800, 1200));
      }).then(ok).then(function () {
        face(t, -t.facing);        // and forward again
        return wait(rand(900, 1500));
      }).then(ok).then(function () {
        return runTo(t, startX);   // thinks better of it
      });
    } else {
      p = runTo(t, endX);
    }
    return p.then(function () { t.el.remove(); });
  }

  function wkrp(rig) {
    var coon = null, sack = null;    // who takes the turkey away, in the end, and in what
    var heliGone = Promise.resolve();  // the pilot has had his say and flown
    var stage = stageOf(rig), gen = rig.gen, ok = guard(rig, gen);
    var W = stage.clientWidth, H = stage.clientHeight;
    var hw = HELI_W * HELI_SCALE, hh = HELI_H * HELI_SCALE;

    var heli = document.createElement('div');
    heli.className = 'st-heli';
    heli.style.width = hw + 'px'; heli.style.height = hh + 'px';
    var bob = document.createElement('div');
    bob.className = 'st-bob';
    bob.innerHTML = HELI_SVG;
    heli.appendChild(bob);
    stage.appendChild(heli);
    var door = heli.querySelector('.door');

    // Hover in the middle third, near the top.
    var hx = W / 2 - hw / 2 - 20, hy = Math.max(4, H * 0.04);
    var t = null;
    var bobbing = null;
    var sound = rig.sound = heliSound();
    if (sound) { sound.panTo(1, 0.01); sound.fadeIn(2.4); }
    heli.style.transform = tr(W + 30, hy - 50);
    bob.style.transform = 'rotate(-8deg)';

    // Heard coming for a moment and a half before it is in sight.
    return wait(1800).then(ok).then(function () {
      if (sound) sound.panTo(0, 4.6);
      /* The mirror of the exit: one run, slowing steadily to a stop, rather
         than two legs at two speeds. The attitude is the inner layer's --
         nose down in flight, a flare back past level as it arrives, then
         level -- so it can ease on its own curve. */
      var tilt = bob.animate([
        { transform: 'rotate(-8deg)' },
        { transform: 'rotate(-6deg)', offset: 0.55 },
        { transform: 'rotate(3deg)', offset: 0.9 },
        { transform: 'rotate(0deg)' }
      ], { duration: 5100, easing: 'ease-in-out', fill: 'forwards' });
      var fly = move(heli, [
        { transform: tr(W + 30, hy - 50) },
        { transform: tr(hx, hy) }
      ], { duration: 4600, easing: 'cubic-bezier(.25,.5,.45,1)' });
      return Promise.all([fly, tilt.finished]).then(function () {
        bob.style.transform = '';
        tilt.cancel();
      });
    }).then(ok).then(function () {
      bobbing = bob.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(5px)' }],
        { duration: 1100, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
      return wait(400);
    }).then(ok).then(function () {
      // The door slides open, and the pilot looks round to watch.
      heli.classList.add('pilot-back');
      return move(door, [{ transform: 'translateX(0px)' }, { transform: 'translateX(40px)' }], { duration: 1400, easing: 'ease-in-out' });
    }).then(ok).then(function () {
      return wait(300);
    }).then(ok).then(function () {
      // Out it comes.
      /* It comes out of the dark: black at first and confined to the
         doorway, as though still in the cabin, then into the light and out
         past the frame as it steps forward. */
      t = makeTurkey(stage, 0.9);
      pose(t, 'kick');
      face(t, -1);
      var dx = hx + DOOR.x * HELI_SCALE - t.w / 2, dy = hy + DOOR.y * HELI_SCALE - t.h / 2;
      var ox = hx + 82 * HELI_SCALE, oy = hy + 42 * HELI_SCALE, ow = 40 * HELI_SCALE, oh = 46 * HELI_SCALE;
      /* Smaller to begin with, as if further back in the cabin, and up to
         full size as it comes forward. The element scales about its feet
         (the stylesheet's transform-origin), and clip-path is drawn in the
         element's own unscaled box, so the doorway is mapped back through
         the scale at each step to stay on the door frame. */
      var inset = function (x, y, k) {
        var fx = t.w / 2, fy = t.h;
        var L = fx + (ox - x - fx) / k, R = fx + (ox + ow - x - fx) / k;
        var T = fy + (oy - y - fy) / k, B = fy + (oy + oh - y - fy) / k;
        return 'inset(' + T.toFixed(1) + 'px ' + (t.w - R).toFixed(1) + 'px ' + (t.h - B).toFixed(1) + 'px ' + L.toFixed(1) + 'px)';
      };
      var x0 = dx + 8, x1 = dx - 22, y1 = dy + 4, y0 = dy - 6;
      place(t, x0, y0);
      var shade = 'drop-shadow(0 3px 2px rgba(0,0,0,.35))';
      var out = t.el.animate([
        { transform: tr(x0, y0, ' scale(.6)'), opacity: 0, filter: 'brightness(0) ' + shade, clipPath: inset(x0, y0, 0.6) },
        { transform: tr(x0 - 2, y0, ' scale(.64)'), opacity: 1, filter: 'brightness(0.05) ' + shade, clipPath: inset(x0 - 2, y0, 0.64), offset: 0.35 },
        { transform: tr(dx - 8, dy, ' scale(.82)'), opacity: 1, filter: 'brightness(0.6) ' + shade, clipPath: inset(dx - 8, dy, 0.82), offset: 0.7 },
        { transform: tr(x1, y1, ' scale(1)'), opacity: 1, filter: 'brightness(1) ' + shade, clipPath: 'inset(-60% -60% -60% -60%)' }
      ], { duration: 1200, easing: 'ease-in-out', fill: 'forwards' });
      return out.finished.then(function () { out.cancel(); place(t, x1, y1); });
    }).then(ok).then(function () {
      return wait(350);
    }).then(ok).then(function () {
      // It tries to fly.
      pose(t, 'flap');
      var gy = groundY(H, t), x0 = t.x, y0 = t.y, x1 = x0 - rand(40, 90);
      var fall = t.el.animate([
        { transform: tr(x0, y0, ' rotate(0deg)') },
        { transform: tr(x0 - 8, y0 - 14, ' rotate(-8deg)'), offset: 0.12 },     // a hopeful lift
        { transform: tr(x0 - 16, y0 + 10, ' rotate(6deg)'), offset: 0.26 },
        { transform: tr(x0 - 22, y0 + 2, ' rotate(-6deg)'), offset: 0.36 },     // and another
        { transform: tr(x1 + 20, (y0 + gy) / 2, ' rotate(14deg)'), offset: 0.62 },
        { transform: tr(x1, gy, ' rotate(24deg)') }
      ], { duration: 1700, easing: 'cubic-bezier(.45,0,.9,.6)', fill: 'forwards' });
      t.x = x1; t.y = gy;
      return fall.finished.then(function () { fall.cancel(); place(t, x1, gy); });
    }).then(ok).then(function () {
      // The landing.
      pose(t, 'splat');
      thud(rig, stage, t.x + t.w / 2, H - 6);
      thudSound();
      // The helicopter has seen enough.
      heli.classList.remove('pilot-back');
      heli.classList.add('pilot-shock');
      move(door, [{ transform: 'translateX(40px)' }, { transform: 'translateX(0px)' }], { duration: 1200, easing: 'ease-in-out' });
      /* And the pilot has something to say about it, in a comic balloon to
         the left of his window, in two goes with a pause between -- the line
         the whole thing is borrowed from. Then, and only then, he goes. */
      var say = function (text, ms) {
        if (rig.gen !== gen) return Promise.resolve();
        var b = document.createElement('div');
        b.className = 'st-bubble';
        b.textContent = text;
        stage.appendChild(b);
        // His window, from where the helicopter is drawn now (it bobs, and hx is not its box).
        var hr = heli.getBoundingClientRect(), sr = stage.getBoundingClientRect();
        var px = hr.left - sr.left + hr.width * 36 / HELI_W, py = hr.top - sr.top + hr.height * 49 / HELI_H;
        b.style.left = Math.max(6, px - b.offsetWidth - 14) + 'px';
        b.style.top = Math.max(4, py - b.offsetHeight / 2) + 'px';
        b.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1.06)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 220, easing: 'ease-out' });
        heli.classList.add('speaking');
        return wait(ms).then(function () {
          heli.classList.remove('speaking');
          return b.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }).finished;
        }).then(function () { b.remove(); }, function () { b.remove(); });
      };
      heliGone = wait(1000).then(function () {
        if (rig.gen !== gen) return;
        heli.classList.remove('pilot-shock');
        heli.classList.add('pilot-talk');           // turned to us, to say his piece
        return wait(350);
      }).then(function () {
        return say('As God is my witness…', 2100);
      }).then(function () {
        return wait(350);
      }).then(function () {
        return say('…I thought turkeys could fly!', 2500);
      }).then(function () {
        heli.classList.remove('pilot-talk');        // eyes front, and off
        return wait(300);
      }).then(function () {
        if (rig.gen !== gen) return;
        if (bobbing) bobbing.cancel();
        if (sound) sound.panTo(-1, 3.4);
        /* One run with one gentle acceleration from standstill to the edge.
           A waypoint part-way along made two legs of it, the second ten
           times the length of the first in twice the time, so it lurched
           into a sprint. The nose dips on the inner layer instead, early and
           smoothly, so the tilt does not have to ride on the travel. */
        bob.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-9deg)' }],
          { duration: 900, easing: 'ease-out', fill: 'forwards' });
        return move(heli, [
          { transform: tr(hx, hy) },
          { transform: tr(-hw - 60, hy - 70) }
        ], { duration: 3400, easing: 'cubic-bezier(.45,0,.8,.55)' }).then(function () {
          // Out of sight, and only now out of hearing.
          if (sound) sound.stop(1.8);
          heli.remove();
        });
      }).then(null, function () {});
      return wait(1300);
    }).then(ok).then(function () {
      // The head comes up, and it is seeing stars -- and it stays sat there, seeing them.
      pose(t, 'dizzy');
      return Promise.all([wait(2600), heliGone]).then(function () { return wait(500); });
    }).then(ok).then(function () {
      /* In from the right, sack on its back, comes the raccoon, and pulls up
         just short of the turkey. It faces left throughout (drawn mirrored),
         so it never has to turn round; its head does the looking. */
      var S = stage.getBoundingClientRect(), tr0 = t.el.getBoundingClientRect();
      var tb = { l: tr0.left - S.left, r: tr0.right - S.left, t: tr0.top - S.top, b: tr0.bottom - S.top };
      var rw = 70 * 1.1, rh = 56 * 1.1, ry = H - TRIM - rh * 52 / 56;
      coon = document.createElement('div');
      coon.className = 'st-coon';
      coon.style.width = rw + 'px'; coon.style.height = rh + 'px';
      stage.appendChild(coon);
      var draw = function (html) { redrawCoon(coon, html, true); };
      draw(raccoonSvg('run'));
      var from = W + 20, stopX = tb.r + 18;
      coon.style.transform = tr(from, ry);
      coon.x = stopX; coon.y = ry; coon.w = rw; coon.draw = draw; coon.tb = tb;
      return move(coon, [{ transform: tr(from, ry) }, { transform: tr(stopX, ry) }], { duration: (from - stopX) / 300 * 1000, easing: 'ease-out' });
    }).then(ok).then(function () {
      // A look at the turkey; a look out at you; back to the turkey.
      return frames([[0.55, 500], [0.2, 45], [0, 520], [0.2, 45], [0.55, 250]], ok, function (h) { coon.draw(raccoonSvg('look', h)); });
    }).then(ok).then(function () {
      /* The sack comes off its back and over its head, and lands on its side
         on the ground in front of it, mouth open to the turkey. */
      var S = stage.getBoundingClientRect(), sr = coon.querySelector('.sack').getBoundingClientRect();
      coon.draw(raccoonSvg('look', 0.55, true));
      var SZ = 66, k0 = sr.width / (SZ * 36 / 60);
      sack = document.createElement('div');
      sack.className = 'st-sack';
      sack.style.cssText = 'width:' + SZ + 'px;height:' + SZ + 'px;transform-origin:0 0';
      sack.innerHTML = sackSvg('open');
      stage.insertBefore(sack, coon);
      var x0 = sr.left - S.left - 8 * k0, y0 = sr.top - S.top - 10 * k0;
      var gx = coon.tb.r - SZ * 0.3, gy = H - TRIM - SZ * 50 / 60;
      sack.gx = gx; sack.gy = gy;
      return move(sack, [{ transform: tr(x0, y0, ' scale(' + k0.toFixed(3) + ') rotate(-50deg)') },
        { transform: tr((x0 + gx) / 2, Math.min(y0, gy) - 40, ' scale(' + ((k0 + 1) / 2).toFixed(3) + ') rotate(-20deg)'), offset: 0.5 },
        { transform: tr(gx, gy, ' scale(1) rotate(0deg)') }], { duration: 700, easing: 'ease-in-out' });
    }).then(ok).then(function () {
      /* It pushes the open sack over the turkey, shuffling after it; the
         turkey, too dazed to mind, goes into it bit by bit. The turkey is in
         front of the sack and cut off, each frame, at the middle of the
         sack's mouth: whatever of it is past that line has gone into the
         dark, and the dark of the mouth shows beyond the cut. */
      var tb = coon.tb, reach = tb.l - 4, dx = sack.gx - reach, D = 1500;
      coon.draw(raccoonSvg('sneak', 0.55, true));
      stage.insertBefore(t.el, coon);          // in front of the sack
      pose(t, 'duck');                         // its head bowing down as it goes in
      var mouth = sack.querySelector('.mouth'), live = true;
      (function cut() {
        if (!live || rig.gen !== gen) return;
        var m = mouth.getBoundingClientRect(), e = t.el.getBoundingClientRect();
        var local = (m.left + m.width / 2 - e.left) / (e.width / t.w);
        t.el.style.clipPath = 'inset(-60% ' + Math.max(0, t.w - local).toFixed(1) + 'px -60% -60%)';
        requestAnimationFrame(cut);
      })();
      setTimeout(function () { live = false; }, D + 50);
      // Tipped a little towards the mouth as it goes in, and drawn in.
      t.el.style.transformOrigin = '100% 80%';
      t.el.animate([{ transform: tr(t.x, t.y, ' rotate(0deg) scale(1)') }, { transform: tr(t.x + 6, t.y + 4, ' rotate(10deg) scale(.9)') }],
        { duration: D, easing: 'ease-in', fill: 'forwards' });
      move(coon, [{ transform: tr(coon.x, coon.y) }, { transform: tr(coon.x - dx, coon.y) }], { duration: D, easing: 'ease-in-out' });
      coon.x -= dx;
      var p = move(sack, [{ transform: tr(sack.gx, sack.gy, ' scale(1)') }, { transform: tr(reach, sack.gy, ' scale(1)') }], { duration: D, easing: 'ease-in-out' });
      sack.gx = reach;
      return p;
    }).then(ok).then(function () {
      // In. The sack sits up, full and fighting, the legs out of the top; it gets tied off.
      t.el.style.display = 'none';
      sack.innerHTML = sackSvg('stuffed');
      coon.draw(raccoonSvg('look', 0.55, true));
      // Sitting up, it stands on its own bottom, lower in its box than the open one did.
      var up = H - TRIM - 66 * 57 / 60, was = sack.gy;
      sack.gy = up;
      return move(sack, [{ transform: tr(sack.gx, was, ' scale(1)') }, { transform: tr(sack.gx, up - 6, ' scale(1.04)'), offset: 0.3 }, { transform: tr(sack.gx, up, ' scale(1)') }], { duration: 500, easing: 'ease-out' });
    }).then(ok).then(function () {
      // A look at you -- got one -- and back.
      return frames([[0.2, 45], [0, 600], [0.2, 45], [0.55, 150]], ok, function (h) { coon.draw(raccoonSvg('look', h, true)); });
    }).then(ok).then(function () {
      /* It walks round in front of the sack, to have it behind -- where a
         sack goes on a back. */
      coon.draw(raccoonSvg('sneak', 0.55, true));
      var to = sack.gx + 66 * 0.5 - coon.w * 0.72;
      var p = move(coon, [{ transform: tr(coon.x, coon.y) }, { transform: tr(to, coon.y) }], { duration: Math.abs(coon.x - to) / 120 * 1000, easing: 'ease-in-out' });
      coon.x = to;
      return p;
    }).then(ok).then(function () {
      /* A heave, and the full sack goes up onto its back -- landing where the
         drawing of it on its back will be, which then takes over. */
      coon.draw(raccoonSvg('look', 0.55, false, 'turkey'));
      var onBack = coon.querySelector('.sack');
      onBack.style.opacity = 0;
      /* Where the drawing of it on its back sits, worked out from the
         raccoon's own box rather than measured: the sack on its back is its
         60-unit square scaled by .64 at (6.6, -3.8) in the raccoon's 70-unit
         drawing, which is mirrored. (Measuring the drawn outline took its
         width for the square's, and the sack shrank smaller than it ends.) */
      var S = stage.getBoundingClientRect(), cr = coon.getBoundingClientRect(), u = cr.width / 70;
      var k1 = 0.64 * 60 * u / 66;
      var bx = cr.left - S.left + (70 - 6.6 - 0.64 * 60) * u, by = cr.top - S.top - 3.8 * u;
      return move(sack, [{ transform: tr(sack.gx, sack.gy, ' scale(1)') }, { transform: tr((sack.gx + bx) / 2, Math.min(sack.gy, by) - 30, ' scale(' + ((1 + k1) / 2).toFixed(3) + ') rotate(12deg)'), offset: 0.55 },
        { transform: tr(bx, by, ' scale(' + k1.toFixed(3) + ')') }], { duration: 650, easing: 'ease-in-out' }).then(function () {
        onBack.style.opacity = '';
        sack.remove();
      });
    }).then(ok).then(function () {
      // And off, the way it is facing, a bit slower for the load.
      coon.draw(raccoonSvg('run', null, false, 'turkey'));
      return wait(150).then(ok).then(function () {
        return move(coon, [{ transform: tr(coon.x, coon.y) }, { transform: tr(-coon.w - 40, coon.y) }], { duration: (coon.x + coon.w + 40) / 230 * 1000, easing: 'ease-in' });
      });
    }).then(function () {
      if (sack && sack.isConnected) sack.remove();
      if (coon) coon.remove();
      if (t) t.el.remove();
      if (heli.isConnected) heli.remove();
      if (rig.sound === sound) rig.sound = null;
    });
  }

  /* The landing: some dust, and the set itself jolted. */
  function thud(rig, stage, x, groundY) {
    for (var i = 0; i < 6; i++) {
      (function (i) {
        var puff = document.createElement('div');
        puff.className = 'st-dust';
        stage.appendChild(puff);
        var dir = i < 3 ? -1 : 1, spread = rand(30, 80) * dir, rise = rand(8, 26);
        puff.animate([
          { transform: tr(x - 12, groundY - 22, ' scale(.4)'), opacity: 0.9 },
          { transform: tr(x - 12 + spread, groundY - 22 - rise, ' scale(1.6)'), opacity: 0 }
        ], { duration: rand(600, 900), easing: 'ease-out', fill: 'forwards' }).finished.then(function () { puff.remove(); }, function () {});
      })(i);
    }
    rig.tuner.animate([
      { transform: 'translate(0,0)' }, { transform: 'translate(-4px,3px)' }, { transform: 'translate(4px,-2px)' },
      { transform: 'translate(-2px,2px)' }, { transform: 'translate(1px,-1px)' }, { transform: 'translate(0,0)' }
    ], { duration: 320, easing: 'ease-out' });
  }

  /* ------------------------------------------------------------------ */
  /* Noel: the Christmas scenes                                         */
  /* ------------------------------------------------------------------ */

  /* Where things are on this face, measured rather than assumed, since the
     layout is the stylesheet's: all relative to the tuner, which the stage
     is laid over. */
  function boxIn(rig, sel) {
    var el = rig.tuner.querySelector(sel);
    if (!el) return null;
    var t = rig.tuner.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - t.left, y: r.top - t.top, w: r.width, h: r.height };
  }

  /* A second stage, clipped to the window, for everything that happens in
     the winter night: snowballs and sleighs come in from the edge of the
     glass rather than across the cabinet. */
  function windowStage(rig) {
    var stage = stageOf(rig), d = boxIn(rig, '.display');
    var ws = stage.querySelector('.season-window');
    if (!ws) {
      ws = document.createElement('div');
      ws.className = 'season-window';
      stage.appendChild(ws);
    }
    ws.style.left = d.x + 'px'; ws.style.top = d.y + 'px';
    ws.style.width = d.w + 'px'; ws.style.height = d.h + 'px';
    ws.W = d.w; ws.H = d.h;
    ws.ground = d.h - 16;    // the crest of the snow along the foot of the glass
    return ws;
  }

  function drawn(host, cls, w, h, markup) {
    var el = document.createElement('div');
    el.className = cls;
    el.style.width = w + 'px'; el.style.height = h + 'px';
    el.innerHTML = markup;
    host.appendChild(el);
    return el;
  }
  // An SVG part the Web Animations API can move about its own box.
  function part(el, sel, origin) {
    var p = el.querySelector(sel);
    p.style.transformBox = 'fill-box';
    p.style.transformOrigin = origin || 'center';
    return p;
  }
  function snowPuff(host, x, y, n) {
    for (var i = 0; i < n; i++) {
      (function () {
        var p = document.createElement('div');
        p.className = 'st-snowpuff';
        host.appendChild(p);
        var a = rand(0, Math.PI * 2), dist = rand(10, 28);
        p.animate([
          { transform: tr(x - 4, y - 4, ' scale(.5)'), opacity: 1 },
          { transform: tr(x - 4 + Math.cos(a) * dist, y - 4 + Math.sin(a) * dist - 8, ' scale(1.2)'), opacity: 0 }
        ], { duration: rand(500, 800), easing: 'ease-out', fill: 'forwards' }).finished.then(function () { p.remove(); }, function () {});
      })();
    }
  }

  /* ---- the snowman: rolls in, stacks himself, dresses, waves, goes ---- */
  var SNOWMAN_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 120" width="100%" height="100%" overflow="visible">' +
      '<defs><radialGradient id="st-snowball" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#e8f0fa"/><stop offset="1" stop-color="#b9cbe2"/></radialGradient></defs>' +
      '<g class="b1"><circle cx="45" cy="100" r="18" fill="url(#st-snowball)" stroke="#9fb4d0"/><circle cx="37" cy="95" r="1.5" fill="#c9d8ea"/><circle cx="53" cy="106" r="1.3" fill="#c9d8ea"/><circle cx="47" cy="89" r="1.1" fill="#c9d8ea"/></g>' +
      '<g class="b2"><circle cx="45" cy="70" r="13" fill="url(#st-snowball)" stroke="#9fb4d0"/><g fill="#26262c"><circle cx="45" cy="65" r="1.5"/><circle cx="45" cy="71" r="1.5"/><circle cx="45" cy="77" r="1.5"/></g></g>' +
      '<g class="armL"><path d="M34 66L16 55M22 58.6L19 52M22 58.6L15 60" stroke="#6b4423" stroke-width="2" stroke-linecap="round" fill="none"/></g>' +
      '<g class="armR"><path d="M56 66L74 55M68 58.6L71 52M68 58.6L75 60" stroke="#6b4423" stroke-width="2" stroke-linecap="round" fill="none"/></g>' +
      '<g class="b3"><circle cx="45" cy="47" r="10" fill="url(#st-snowball)" stroke="#9fb4d0"/>' +
        '<g class="eyes" fill="#1a1a1e"><circle cx="41.5" cy="44.5" r="1.6"/><circle cx="48.5" cy="44.5" r="1.6"/></g>' +
        '<path class="nose" d="M45 47.4L56.5 49.6L45 50.9Z" fill="#f08a24" stroke="#b85c12" stroke-width=".5"/>' +
        '<g fill="#1a1a1e"><circle cx="40.6" cy="51.6" r=".9"/><circle cx="43.1" cy="53.1" r=".9"/><circle cx="46.1" cy="53.3" r=".9"/><circle cx="48.9" cy="52.1" r=".9"/></g>' +
        '<path d="M35.2 55.5Q45 60.5 54.8 55.5L55 59Q45 64 35 59Z" fill="#d1122e"/><path d="M49 59.5L53 70L48.4 69.4Z" fill="#b30f28"/>' +
      '</g>' +
      '<g class="hat"><rect x="38" y="23" width="14" height="14" rx="1" fill="#1d1d24"/><rect x="38" y="32.6" width="14" height="3" fill="#d1122e"/><rect x="33" y="36.4" width="24" height="3" rx="1.5" fill="#1d1d24"/></g>' +
    '</svg>';

  function snowman(rig) {
    var ws = windowStage(rig), gen = rig.gen, ok = guard(rig, gen);
    var S = 0.78, w = 90 * S, h = 120 * S;
    var el = drawn(ws, 'st-snowman', w, h, SNOWMAN_SVG);
    el.style.transformOrigin = '50% 100%';
    var x = ws.W * rand(0.56, 0.8) - w / 2, y = ws.ground - h + 3;
    el.style.transform = tr(x, y);
    var b1 = part(el, '.b1'), b2 = part(el, '.b2'), b3 = part(el, '.b3'), hat = part(el, '.hat'),
      armL = part(el, '.armL', 'right bottom'), armR = part(el, '.armR', 'left bottom'),
      eyes = part(el, '.eyes'), nose = part(el, '.nose', 'left center');
    // Off the right edge of the glass, and off the left, in its own units.
    var R = (ws.W - x) / S + 30, L = -(x / S) - 30;
    var s1 = 'translate(' + R + 'px,0px) rotate(720deg)',
      s2 = 'translate(' + L + 'px,35px) rotate(-640deg)',
      s3 = 'translate(' + R + 'px,61px) rotate(600deg)';
    b1.style.transform = s1; b2.style.transform = s2; b3.style.transform = s3;
    hat.style.transform = 'translateY(-620px)';
    armL.style.transform = armR.style.transform = 'scale(0)';
    eyes.style.transform = 'scaleY(0)';
    nose.style.transform = 'scale(0)';
    return move(b1, [{ transform: s1 }, { transform: 'translate(0px,0px) rotate(0deg)' }],
      { duration: 1700, easing: 'cubic-bezier(.2,.6,.3,1)' }).then(ok).then(function () {
      // The middle comes from the other side, and hops up.
      return move(b2, [
        { transform: s2 },
        { transform: 'translate(-31px,35px) rotate(0deg)', offset: 0.64 },
        { transform: 'translate(-16px,-14px) rotate(0deg)', offset: 0.83 },
        { transform: 'translate(0px,0px) rotate(0deg)' }
      ], { duration: 2100, easing: 'ease-out' });
    }).then(ok).then(function () {
      return move(b3, [
        { transform: s3 },
        { transform: 'translate(26px,61px) rotate(0deg)', offset: 0.64 },
        { transform: 'translate(13px,-12px) rotate(0deg)', offset: 0.83 },
        { transform: 'translate(0px,0px) rotate(0deg)' }
      ], { duration: 2000, easing: 'ease-out' });
    }).then(ok).then(function () {
      return move(eyes, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 220, easing: 'ease-out' });
    }).then(ok).then(function () { return wait(260); }).then(ok).then(function () {
      return move(eyes, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.1)' }, { transform: 'scaleY(1)' }], { duration: 200 });
    }).then(ok).then(function () {
      return move(nose, [{ transform: 'scale(0)' }, { transform: 'scale(1.3)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 360, easing: 'ease-out' });
    }).then(ok).then(function () {
      var pop = [{ transform: 'scale(0)' }, { transform: 'scale(1.15)', offset: 0.7 }, { transform: 'scale(1)' }];
      return Promise.all([move(armL, pop, { duration: 360, easing: 'ease-out' }), move(armR, pop, { duration: 360, easing: 'ease-out', delay: 120 })]);
    }).then(ok).then(function () {
      return move(hat, [
        { transform: 'translateY(-620px)' }, { transform: 'translateY(0px)', offset: 0.7 },
        { transform: 'translateY(-7px)', offset: 0.85 }, { transform: 'translateY(0px)' }
      ], { duration: 900, easing: 'ease-in' });
    }).then(ok).then(function () {
      // A wave.
      return move(armR, [
        { transform: 'rotate(0deg)' }, { transform: 'rotate(-38deg)', offset: 0.2 }, { transform: 'rotate(6deg)', offset: 0.4 },
        { transform: 'rotate(-38deg)', offset: 0.6 }, { transform: 'rotate(6deg)', offset: 0.8 }, { transform: 'rotate(0deg)' }
      ], { duration: 1400, easing: 'ease-in-out' });
    }).then(ok).then(function () {
      // The hat slips over his eyes. A moment. He pushes it back.
      return move(hat, [{ transform: 'translateY(0px)' }, { transform: 'translateY(8px)' }], { duration: 180, easing: 'ease-in' });
    }).then(ok).then(function () { return wait(650); }).then(ok).then(function () {
      return Promise.all([
        move(armR, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-78deg)', offset: 0.5 }, { transform: 'rotate(0deg)' }], { duration: 700, easing: 'ease-in-out' }),
        move(hat, [{ transform: 'translateY(8px)' }, { transform: 'translateY(8px)', offset: 0.4 }, { transform: 'translateY(0px)', offset: 0.6 }, { transform: 'translateY(0px)' }], { duration: 700 })
      ]);
    }).then(ok).then(function () { return wait(400); }).then(ok).then(function () {
      // And off he wobbles.
      var frames = [], steps = 16, dx = (ws.W + 40 - x) / steps;
      for (var i = 0; i <= steps; i++) {
        frames.push({ transform: tr(x + dx * i, y - (i % 2 ? 5 : 0), ' rotate(' + (i === 0 || i === steps ? 0 : (i % 2 ? 7 : -7)) + 'deg)') });
      }
      return move(el, frames, { duration: 6500, easing: 'linear' });
    }).then(function () { el.remove(); });
  }

  /* ---- the elf: a bulb pops, an elf abseils in and changes it ---- */
  var BULB_LIT = ['#ff4040', '#ffc233', '#3fe07a', '#48b4ff', '#ff5cd6'];
  function bulbSvg(glass, glow) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -14 24 28" width="100%" height="100%" overflow="visible">' +
      (glow ? '<circle r="12" fill="' + glass + '" opacity=".35"/>' : '') +
      '<ellipse cx="0" cy="1" rx="5.8" ry="8.6" fill="' + glass + '"/>' +
      '<ellipse cx="-1.8" cy="-2" rx="1.6" ry="3" fill="#fff" opacity="' + (glow ? '.8' : '.3') + '"/>' +
      '<rect x="-3" y="-11" width="6" height="5" rx="1" fill="#2c5a34"/>' +
    '</svg>';
  }
  /* The elf: 'hang' (on the rope, legs kicking), 'zapped' (stiff, hat on end)
     or 'slump' (limp from one hand after the shock, head lolling, eyes shut,
     hat flopped, a wisp of smoke). true and false still mean zapped and not. */
  function elfSvg(mode) {
    if (mode === true) mode = 'zapped';
    if (!mode) mode = 'hang';
    if (mode === 'slump') return elfSlumpSvg(1);
    if (typeof mode === 'number') return elfSlumpSvg(mode);
    var zapped = mode === 'zapped';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 46" width="100%" height="100%" overflow="visible">' +
      '<path d="M16 4V-300" stroke="#c9a56b" stroke-width="1.6"/>' +
      /* Everything below the hand on the rope sways from it, gently; the
         legs, dangling, kick out of step with each other. Zapped, they go
         stiff. */
      '<g>' + (zapped ? '' : '<animateTransform attributeName="transform" type="rotate" values="-5 16 4;5 16 4;-5 16 4" dur="1.7s" calcMode="spline" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1" repeatCount="indefinite"/>') +
      elfLeg(12.5, 11, 5, zapped ? 22 : 0, 0.62, 0) + elfLeg(18, 19.5, 25.5, zapped ? -22 : 0, 0.7, -0.3) +
      // tunic and belt
      '<path d="M10 20L20 20L23 34L7 34Z" fill="#1f8a3a"/><path d="M7 34L9 36L11 34L13 36L15 34L17 36L19 34L21 36L23 34" fill="#1f8a3a" stroke="#176a2c" stroke-width=".6"/>' +
      '<rect x="8.4" y="27" width="13.4" height="2.4" fill="#1a1a1a"/><rect x="13.6" y="26.6" width="3.2" height="3.2" fill="none" stroke="#f2c14e" stroke-width=".9"/>' +
      // one arm up the rope, the other out to the bulb
      '<path d="M18 21L16.4 5" stroke="#1f8a3a" stroke-width="3" stroke-linecap="round"/><circle cx="16.2" cy="4.4" r="1.8" fill="#f5c8a0"/>' +
      '<path d="M11 22L2.5 20" stroke="#1f8a3a" stroke-width="3" stroke-linecap="round"/><circle cx="2" cy="19.8" r="1.8" fill="#f5c8a0"/>' +
      // head, ears, face
      '<path d="M8.6 14L4.8 11.4L9 17ZM21.4 14L25.2 11.4L21 17Z" fill="#f0b890"/>' +
      '<circle cx="15" cy="15" r="5.8" fill="#f5c8a0"/>' +
      (zapped
        ? '<circle cx="12.8" cy="14.2" r="1.6" fill="#fff" stroke="#1a1a1a" stroke-width=".4"/><circle cx="17.2" cy="14.2" r="1.6" fill="#fff" stroke="#1a1a1a" stroke-width=".4"/>' +
          '<circle cx="12.8" cy="14.2" r=".6" fill="#1a1a1a"/><circle cx="17.2" cy="14.2" r=".6" fill="#1a1a1a"/>' +
          '<ellipse cx="15" cy="18.3" rx="1.3" ry="1" fill="#6a2a1a"/>' +
          '<path d="M10 17Q11.5 16.4 12.4 17.8M18 18Q19.4 16.6 20.4 17.6" stroke="#6a6a6a" stroke-width="1" fill="none" opacity=".8"/>' +
          // hat on end, and a wisp of smoke
          '<path d="M9.4 11L20.6 11L15 -9Z" fill="#1f8a3a"/><circle cx="15" cy="-9.5" r="1.8" fill="#f2c14e"/>' +
          '<g fill="#9a9aa2" opacity=".7"><circle cx="17" cy="-14" r="2.6"/><circle cx="14" cy="-19" r="2"/><circle cx="17.5" cy="-23" r="1.5"/></g>'
        : '<circle cx="13" cy="14.6" r=".85" fill="#1a1a1a"/><circle cx="17" cy="14.6" r=".85" fill="#1a1a1a"/>' +
          '<circle cx="11.4" cy="17" r="1.3" fill="#f08a8a" opacity=".7"/><circle cx="18.6" cy="17" r="1.3" fill="#f08a8a" opacity=".7"/>' +
          '<path d="M13.2 18.2Q15 19.6 16.8 18.2" stroke="#6a2a1a" stroke-width=".8" fill="none"/>' +
          '<path d="M9.4 11Q14 9.6 20.6 11L25 3.5Q24 1.5 22.4 3.2Z" fill="#1f8a3a"/><circle cx="23.6" cy="2.8" r="1.8" fill="#f2c14e"/>') +
      '<path d="M9 11.2Q15 12.6 21 11.2" stroke="#fff" stroke-width="1.6" fill="none"/>' +
      '</g>' +
    '</svg>';
  }
  /* Limp, by degrees: k = 1 is hanging slack from one hand, head lolled,
     eyes shut, hat flopped; k = 0 is the shock's pose, and the values
     between are the going: head tipping over, the free arm coming down,
     legs loosening, eyelids closing, the hat falling over to the side. */
  function elfSlumpSvg(k) {
    var lerp = function (a, b) { return +(a + (b - a) * k).toFixed(2); };
    var ax = lerp(2.5, 8.6), ay = lerp(20, 31);
    var limp = k >= 1;
    // The lids come down over the eyes as he goes, and at the last they shut.
    var lid = lerp(13.4, 15.2), pr = lerp(0.9, 0.35);
    var eyes = limp
      ? '<path d="M11.4 14.4Q12.8 15.6 14.2 14.4M15.8 14.4Q17.2 15.6 18.6 14.4" stroke="#2a1a10" stroke-width=".9" fill="none" stroke-linecap="round"/>'
      : '<circle cx="12.8" cy="15.1" r="' + pr + '" fill="#1a1a1a"/><circle cx="17.2" cy="15.1" r="' + pr + '" fill="#1a1a1a"/>' +
        '<path d="M11.2 ' + lid + 'H14.4M15.6 ' + lid + 'H18.8" stroke="#2a1a10" stroke-width=".9" stroke-linecap="round"/>';
    var mouth = limp
      ? '<path d="M13.4 18.6Q14.2 18 15 18.6Q15.8 19.2 16.6 18.6" stroke="#6a2a1a" stroke-width=".8" fill="none"/>'
      : '<ellipse cx="15" cy="18.4" rx=".9" ry=".7" fill="#6a2a1a"/>';
    // The hat, stood on end by the shock, keels over to the right as he goes.
    var hat;
    if (limp) {
      hat = '<path d="M9.4 11Q14 9.6 20.6 11Q21.4 14.6 19.6 19.6Q18.6 20.8 17.8 19.4Q18.6 15.2 16.8 12.4Z" fill="#1f8a3a"/><circle cx="18.8" cy="20.8" r="1.8" fill="#f2c14e"/>';
    } else {
      var ang = 155 * Math.pow(k, 1.3) * Math.PI / 180, len = 20 - 9.5 * k;
      var tx = +(15 + len * Math.sin(ang)).toFixed(2), ty = +(11 - len * Math.cos(ang)).toFixed(2);
      hat = '<path d="M9.4 11L20.6 11L' + tx + ' ' + ty + 'Z" fill="#1f8a3a"/><circle cx="' + tx + '" cy="' + ty + '" r="1.8" fill="#f2c14e"/>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 46" width="100%" height="100%" overflow="visible">' +
      '<path d="M16 4V-300" stroke="#c9a56b" stroke-width="1.6"/>' +
      // Hanging from the one hand; once limp, turning very slowly on the rope.
      '<g transform="rotate(' + lerp(0, 7) + ' 16 4)"><g>' +
        (limp ? '<animateTransform attributeName="transform" type="rotate" values="-3 16 4;3 16 4;-3 16 4" dur="2.8s" calcMode="spline" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1" repeatCount="indefinite"/>' : '') +
        elfLeg(12.5, 11.5, 6, lerp(22, 5), 0, 0) + elfLeg(18, 18.8, 24.5, lerp(-22, -3), 0, 0) +
        '<path d="M10 20L20 20L23 34L7 34Z" fill="#1f8a3a"/><path d="M7 34L9 36L11 34L13 36L15 34L17 36L19 34L21 36L23 34" fill="#1f8a3a" stroke="#176a2c" stroke-width=".6"/>' +
        '<rect x="8.4" y="27" width="13.4" height="2.4" fill="#1a1a1a"/><rect x="13.6" y="26.6" width="3.2" height="3.2" fill="none" stroke="#f2c14e" stroke-width=".9"/>' +
        // the arm on the rope, and the other on its way down
        '<path d="M18 21L16.4 5" stroke="#1f8a3a" stroke-width="3" stroke-linecap="round"/><circle cx="16.2" cy="4.4" r="1.8" fill="#f5c8a0"/>' +
        '<path d="M11 22L' + ax + ' ' + ay + '" stroke="#1f8a3a" stroke-width="3" stroke-linecap="round"/><circle cx="' + lerp(2, 8.4) + '" cy="' + lerp(19.8, 31.6) + '" r="1.8" fill="#f5c8a0"/>' +
        '<g transform="rotate(' + lerp(0, -24) + ' 15 20)">' +
          '<path d="M8.6 14L4.8 11.4L9 17ZM21.4 14L25.2 11.4L21 17Z" fill="#f0b890"/>' +
          '<circle cx="15" cy="15" r="5.8" fill="#f5c8a0"/>' + eyes + mouth +
          '<path d="M10 17Q11.5 16.4 12.4 17.8M18 18Q19.4 16.6 20.4 17.6M14 12.4Q15 11.8 16 12.6" stroke="#6a6a6a" stroke-width="1" fill="none" opacity=".8"/>' +
          hat + '<path d="M9 11.2Q15 12.6 21 11.2" stroke="#fff" stroke-width="1.6" fill="none"/>' +
        '</g>' +
      '</g></g>' +
      // a wisp of smoke going up from him, again and again
      '<g fill="#9a9aa2">' +
        '<circle cx="13" cy="6" r="2"><animate attributeName="cy" values="6;-14" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values=".7;0" dur="1.6s" repeatCount="indefinite"/><animate attributeName="r" values="1.6;3.2" dur="1.6s" repeatCount="indefinite"/></circle>' +
        '<circle cx="11" cy="6" r="2"><animate attributeName="cy" values="6;-14" dur="1.6s" begin="-.8s" repeatCount="indefinite"/><animate attributeName="opacity" values=".7;0" dur="1.6s" begin="-.8s" repeatCount="indefinite"/><animate attributeName="r" values="1.6;3.2" dur="1.6s" begin="-.8s" repeatCount="indefinite"/></circle>' +
      '</g>' +
    '</svg>';
  }
  /* One striped stocking and its shoe, hung from the hip at (hx, 33). Loose,
     it swings back and forth; stiff, it sticks out at a fixed angle. */
  function elfLeg(hx, fx, toe, stiff, dur, begin) {
    var swing = stiff
      ? ' transform="rotate(' + stiff + ' ' + hx + ' 33)"'
      : '';
    var anim = stiff ? '' : '<animateTransform attributeName="transform" type="rotate" values="' +
      [-24, 18, -24].map(function (a) { return a + ' ' + hx + ' 33'; }).join(';') +
      '" dur="' + dur + 's" begin="' + begin + 's" calcMode="spline" keyTimes="0;.5;1" keySplines=".4 0 .6 1;.4 0 .6 1" repeatCount="indefinite"/>';
    return '<g' + swing + '>' + anim +
      '<path d="M' + hx + ' 33L' + fx + ' 42" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>' +
      '<path d="M' + hx + ' 33L' + fx + ' 42" stroke="#d1122e" stroke-width="2.8" stroke-dasharray="2 2" stroke-linecap="round"/>' +
      '<path d="M' + fx + ' 42Q' + ((fx + toe) / 2) + ' 44 ' + toe + ' 41" stroke="#1f8a3a" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
    '</g>';
  }

  function elfFix(rig) {
    var ws = windowStage(rig), gen = rig.gen, ok = guard(rig, gen);
    var m = boxIn(rig, '.meter'), d = boxIn(rig, '.display');
    if (!m || !d) return Promise.resolve();
    var mx = m.x - d.x, my = m.y - d.y, n = Math.max(6, Math.floor(m.w / 34));
    var k = Math.floor(rand(3, n - 3));
    var bx = mx + 17 + 34 * k, by = my + 25;
    var colour = BULB_LIT[k % 5];

    /* The meter's own bulb in that place would go on lighting with the music
       behind the stand-ins, its glow showing round their edges; its place is
       cut out of the lit string (--dead-x, read by the stylesheet) until the
       new one is in. A lit stand-in over a dead one: it flickers, flares and
       pops, with a spark and a thread of smoke, and then the elf comes. */
    var meter = rig.tuner.querySelector('.meter');
    if (meter) meter.style.setProperty('--dead-x', (17 + 34 * k) + 'px');
    var dead = drawn(ws, 'st-bulb', 24, 28, bulbSvg('#34343c', false));
    dead.style.transformOrigin = '50% 12%';
    dead.style.transform = tr(bx - 12, by - 14);
    var going = drawn(ws, 'st-bulb', 24, 28, bulbSvg(colour, true));
    going.style.transform = tr(bx - 12, by - 14);
    function pop() {
      going.remove();
      // A flash of light where it went, and the bulb jumps in its socket.
      var flash = drawn(ws, 'st-spark', 80, 80,
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -40 80 80" width="100%" height="100%"><circle r="13" fill="#fffbe0"/><circle r="25" fill="#fff3b0" opacity=".45"/><circle r="39" fill="#fff3b0" opacity=".15"/></svg>');
      flash.animate([{ transform: tr(bx - 40, by - 40, ' scale(.3)'), opacity: 1 }, { transform: tr(bx - 40, by - 40, ' scale(1)'), opacity: 0.9, offset: 0.3 }, { transform: tr(bx - 40, by - 40, ' scale(1.2)'), opacity: 0 }],
        { duration: 380, easing: 'ease-out', fill: 'forwards' }).finished.then(function () { flash.remove(); }, function () {});
      dead.animate([{ transform: tr(bx - 12, by - 14) }, { transform: tr(bx - 12, by - 11, ' rotate(9deg)'), offset: 0.3 },
        { transform: tr(bx - 12, by - 15, ' rotate(-5deg)'), offset: 0.65 }, { transform: tr(bx - 12, by - 14) }], { duration: 300, easing: 'ease-out' });
      var spark = drawn(ws, 'st-spark', 40, 40,
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 40 40" width="100%" height="100%"><g stroke="#fff6c8" stroke-width="2.2" stroke-linecap="round"><path d="M0-6V-18M0 6V18M-6 0H-18M6 0H18M-4-4L-12-12M4 4L12 12M-4 4L-12 12M4-4L12-12"/></g></svg>');
      spark.animate([{ transform: tr(bx - 20, by - 20, ' scale(.3) rotate(0deg)'), opacity: 1 }, { transform: tr(bx - 20, by - 20, ' scale(1.5) rotate(20deg)'), opacity: 0 }],
        { duration: 420, easing: 'ease-out', fill: 'forwards' }).finished.then(function () { spark.remove(); }, function () {});
      /* A shower of sparks thrown out of it, arcing over and falling away
         down the glass, each one burning out as it goes. */
      for (var e = 0; e < 16; e++) (function () {
        var ember = drawn(ws, 'st-spark', 9, 9,
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4.5 -4.5 9 9" width="100%" height="100%"><circle r="4.3" fill="#ffc94a" opacity=".45"/><circle r="2" fill="#fffbe0"/></svg>');
        var vx = rand(-70, 70), vy = rand(-90, -20), g = 300, T = rand(0.9, 1.5), fr = [];
        for (var q = 0; q <= 12; q++) {
          var t = T * q / 12;
          fr.push({ transform: tr(bx - 4.5 + vx * t, by - 4.5 + vy * t + g * t * t / 2, ' scale(' + (1 - 0.6 * q / 12).toFixed(2) + ')'),
                    opacity: q < 6 ? 1 : +(1 - (q - 6) / 6).toFixed(2) });
        }
        ember.animate(fr, { duration: T * 1000, easing: 'linear', fill: 'forwards' })
          .finished.then(function () { ember.remove(); }, function () {});
      })();
      var smoke = drawn(ws, 'st-smoke', 12, 12, '');
      smoke.animate([{ transform: tr(bx - 6, by - 6, ' scale(.4)'), opacity: 0.8 }, { transform: tr(bx - 2, by - 40, ' scale(1.8)'), opacity: 0 }],
        { duration: 1400, easing: 'ease-out', fill: 'forwards' }).finished.then(function () { smoke.remove(); }, function () {});
    }

    var S = 1.1, ew = 30 * S, eh = 46 * S;
    var elf = drawn(ws, 'st-elf', ew, eh, elfSvg(false));
    var ex = bx + 3, ey = by - 20 * S;       // its reaching hand just by the bulb
    var SLIP = 26;                           // how far he slides down the rope when he goes limp
    elf.style.transform = tr(ex, -eh - 10);
    var fresh = null;

    // Stuttering: a dip, a catch, a longer dip, a run of quick ones, a flare.
    return move(going, [
      { opacity: 1, filter: 'brightness(1)' }, { opacity: 0.25, offset: 0.08 }, { opacity: 1, offset: 0.13 },
      { opacity: 1, offset: 0.3 }, { opacity: 0.1, offset: 0.36 }, { opacity: 0.8, offset: 0.42 }, { opacity: 0.15, offset: 0.47 },
      { opacity: 1, offset: 0.55 }, { opacity: 1, offset: 0.66 }, { opacity: 0.05, offset: 0.7 }, { opacity: 0.9, offset: 0.73 },
      { opacity: 0.1, offset: 0.77 }, { opacity: 0.7, offset: 0.8 }, { opacity: 0.05, offset: 0.84 },
      { opacity: 1, filter: 'brightness(1)', offset: 0.9 }, { opacity: 1, filter: 'brightness(2.6)' }
    ], { duration: 1500, easing: 'linear' }).then(ok).then(function () {
      // The sparks fall and die away, and a beat after, help arrives.
      pop();
      return wait(2000);
    }).then(ok).then(function () {
      // Down the rope from the top of the glass.
      return move(elf, [
        { transform: tr(ex, -eh - 10) }, { transform: tr(ex, ey + 5), offset: 0.8 }, { transform: tr(ex, ey) }
      ], { duration: 950, easing: 'ease-out' });
    }).then(ok).then(function () { return wait(250); }).then(ok).then(function () {
      // Unscrew, unscrew, unscrew...
      return move(dead, [
        { transform: tr(bx - 12, by - 14, ' rotate(0deg)') }, { transform: tr(bx - 12, by - 14, ' rotate(-28deg)'), offset: 0.2 },
        { transform: tr(bx - 12, by - 14, ' rotate(0deg)'), offset: 0.35 }, { transform: tr(bx - 12, by - 14, ' rotate(-28deg)'), offset: 0.55 },
        { transform: tr(bx - 12, by - 15, ' rotate(0deg)'), offset: 0.7 }, { transform: tr(bx - 12, by - 16, ' rotate(-28deg)'), offset: 0.9 },
        { transform: tr(bx - 12, by - 17, ' rotate(-10deg)') }
      ], { duration: 1000, easing: 'ease-in-out' });
    }).then(ok).then(function () {
      // ...and over the shoulder with it.
      var toss = move(dead, [
        { transform: tr(bx - 12, by - 17, ' rotate(-10deg)') },
        { transform: tr(bx + 20, by - 34, ' rotate(200deg)'), offset: 0.3 },
        { transform: tr(bx + 60, ws.H + 30, ' rotate(620deg)') }
      ], { duration: 1200, easing: 'ease-in' }).then(function () { dead.remove(); });
      fresh = drawn(ws, 'st-bulb', 24, 28, bulbSvg(colour, true));
      fresh.style.transformOrigin = '50% 12%';
      return wait(450).then(function () {
        // A new one, screwed in.
        return move(fresh, [
          { transform: tr(bx + 10, by - 6, ' rotate(0deg)'), opacity: 0 },
          { transform: tr(bx - 12, by - 14, ' rotate(0deg)'), opacity: 1, offset: 0.35 },
          { transform: tr(bx - 12, by - 14, ' rotate(24deg)'), offset: 0.55 },
          { transform: tr(bx - 12, by - 14, ' rotate(-8deg)'), offset: 0.8 },
          { transform: tr(bx - 12, by - 14, ' rotate(0deg)'), opacity: 1 }
        ], { duration: 900, easing: 'ease-in-out' });
      }).then(function () { return toss; });
    }).then(ok).then(function () {
      /* ZAP -- out of the bulb he has just put in: the flash centred on the
         glass, bolts thrown out from it every way, the longest one into him. */
      elf.innerHTML = elfSvg('zapped');
      var zap = drawn(ws, 'st-zap', 90, 90,
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-45 -45 90 90" width="100%" height="100%"><circle r="16" fill="#fffbe0" opacity=".75"/><circle r="30" fill="#fffbe0" opacity=".25"/>' +
        '<g fill="none" stroke="#fff6a0" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">' +
          '<path d="M5-2L14-7L12-1L24-6L22 1L36-3"/><path d="M5 3L13 7L10 11L20 15"/>' +
          '<path d="M-2-6L-6-15L0-17L-4-28"/><path d="M-5 2L-15 6L-13 0L-26 5"/><path d="M1 7L-2 15L4 17L0 26"/>' +
        '</g></svg>');
      var zx = bx - 45, zy = by - 45;
      fresh.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(2.4)', offset: 0.2 }, { filter: 'brightness(1.2)', offset: 0.5 }, { filter: 'brightness(2)', offset: 0.65 }, { filter: 'brightness(1)' }],
        { duration: 600, easing: 'ease-out' });
      zap.animate([
        { transform: tr(zx, zy, ' scale(.4)'), opacity: 1 }, { transform: tr(zx, zy, ' scale(1)'), opacity: 1, offset: 0.25 },
        { transform: tr(zx, zy, ' scale(1)'), opacity: 0.2, offset: 0.4 }, { transform: tr(zx, zy, ' scale(1.05)'), opacity: 0.9, offset: 0.55 },
        { transform: tr(zx, zy, ' scale(1.1)'), opacity: 0 }
      ], { duration: 600, easing: 'ease-out', fill: 'forwards' }).finished.then(function () { zap.remove(); }, function () {});
      /* The shock knocks him down the rope: shaking as he goes, stiff, until
         his grip catches a good way lower with a jerk and a little bounce. */
      var j = [], steps = 8;
      for (var q = 0; q <= steps; q++) {
        var fall = ey + (SLIP + 3) * Math.min(1, q / (steps * 0.6));
        j.push({ transform: tr(ex + (q % 2 ? 2 : -2) * (q < steps ? 1 : 0), fall + (q % 2 ? 1 : -1) * (q < steps ? 1 : 0)) });
      }
      j.push({ transform: tr(ex, ey + SLIP - 4) });
      j.push({ transform: tr(ex, ey + SLIP) });
      return move(elf, j, { duration: 640, easing: 'linear' }).then(function () { return wait(500); });
    }).then(ok).then(function () {
      /* And then he goes limp where he hangs, by degrees: quick at first,
         slower as the last of it goes out of him. */
      var steps = [[0.2, 40], [0.4, 45], [0.58, 50], [0.74, 55], [0.87, 65], [0.96, 75]];
      return frames(steps, ok, function (k) { elf.innerHTML = elfSvg(k); }).then(ok).then(function () {
        elf.innerHTML = elfSvg('slump');
        return wait(900);
      });
    }).then(ok).then(function () {
      /* Hauled back up by someone above, slowly, a tug at a time: each pull
         lifts him a little and the rope holds while they take a fresh grip.
         The real bulb shows through as its stand-in fades. */
      fresh.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, delay: 400, fill: 'forwards' });
      // The string's own bulb back in its place as the stand-in goes.
      setTimeout(function () { if (meter) meter.style.removeProperty('--dead-x'); }, 400);
      var y0 = ey + SLIP, y1 = -eh - 20, tugs = 7, frames = [];
      for (var i = 0; i < tugs; i++) {
        var a = y0 + (y1 - y0) * (i / tugs), b = y0 + (y1 - y0) * ((i + 1) / tugs);
        frames.push({ transform: tr(ex, a), offset: i / tugs, easing: 'ease-in-out' });
        frames.push({ transform: tr(ex, b), offset: (i + 0.45) / tugs });
      }
      frames.push({ transform: tr(ex, y1), offset: 1 });
      return move(elf, frames, { duration: 3900 });
    }).then(function () {
      elf.remove();
      return wait(400).then(function () { if (fresh) fresh.remove(); });
    });
  }

  /* ---- the cardinal: lands on the holly, shakes, pecks, looks, goes ---- */
  function cardinalSvg(flying) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 34" width="100%" height="100%" overflow="visible">' +
      '<path d="M26 20L39 26L37.4 30.4L25 24Z" fill="#8e0f1c"/>' +
      (flying ? '' : '<path d="M18 27L17 33M22 27L23 33M15.4 33H19M21 33H25" stroke="#5a2a10" stroke-width="1.2" stroke-linecap="round"/>') +
      '<ellipse cx="20" cy="20" rx="10" ry="8" fill="#d1122e"/>' +
      '<ellipse cx="18.5" cy="23" rx="6" ry="4" fill="#e8384e" opacity=".6"/>' +
      '<circle cx="12" cy="13" r="6" fill="#d1122e"/><path d="M12.6 8.2L17.8 1.6L16.4 9.4Z" fill="#d1122e"/>' +
      '<path d="M5 13Q8 10 11.2 12L11.2 17.2Q7 17.2 5 13Z" fill="#1a1a1a"/>' +
      '<path d="M6 12.8L1.4 14.2L6 15.6Z" fill="#f2a03a"/>' +
      '<circle cx="9.6" cy="12.6" r=".95" fill="#fff"/>' +
      '<path d="M17 16Q26 14 30.4 20Q24 24.4 17 22Z" fill="#a8101f">' +
        (flying ? '<animateTransform attributeName="transform" type="rotate" values="-50 18 17;38 18 17;-50 18 17" dur=".11s" repeatCount="indefinite"/>' : '') +
      '</path>' +
    '</svg>';
  }

  function cardinal(rig) {
    var stage = stageOf(rig), gen = rig.gen, ok = guard(rig, gen);
    var W = stage.clientWidth;
    var S = 1.1, w = 40 * S, h = 34 * S;
    var bird = drawn(stage, 'st-bird', w, h, '');
    bird.style.transformOrigin = '50% 97%';
    /* On the holly's twig, below the berries. The stylesheet draws the
       90x60 sprig in a 105x70 box at -8,-10; its toes grip the twig at (50, 44.6) in
       the sprig's own units. Any higher and its head is above the top of the
       cabinet, where the stage is cut off. Move the sprig and this moves too. */
    var hs = 105 / 90, fx = -8 + 50 * hs, fy = -10 + 44.6 * hs;
    var px = fx - w / 2, py = fy - h * 0.97;

    /* The bird is drawn in layers so that a change of pose or of facing is
       a cross-fade rather than a cut: the new drawing fades up over the old,
       which fades out and goes. Facing is -1 for left, as drawn, +1 for right. */
    function layer(flying, facing) {
      var l = document.createElement('div');
      l.className = 'st-layer';
      l.style.transform = facing > 0 ? 'scaleX(-1)' : '';
      l.innerHTML = cardinalSvg(flying);
      return l;
    }
    function become(flying, facing, ms) {
      var old = Array.prototype.slice.call(bird.children);
      var l = layer(flying, facing);
      l.style.opacity = '0';
      bird.appendChild(l);
      var up = l.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'ease-in-out', fill: 'forwards' });
      old.forEach(function (o) { o.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-in-out', fill: 'forwards' }); });
      return up.finished.then(function () {
        l.style.opacity = ''; up.cancel();
        old.forEach(function (o) { o.remove(); });
      });
    }
    function peck(dir) {
      // Forward is the way it faces: beak down to the left, or to the right.
      var a = dir < 0 ? -26 : 26;
      return move(bird, [
        { transform: tr(px, py, ' rotate(0deg)') }, { transform: tr(px, py, ' rotate(' + a + 'deg)'), offset: 0.45 },
        { transform: tr(px, py, ' rotate(0deg)') }
      ], { duration: 460, easing: 'ease-in-out' });
    }

    bird.appendChild(layer(true, -1));
    /* In from the right, low across the set, rising to the sprig on one
       smooth curve: a cubic Bezier sampled finely, so there are no corners
       where straight legs used to meet, and slowing steadily to the perch. */
    var H = stage.clientHeight;
    var P = [[W + 20, H * 0.45], [W * 0.6, H * 0.5], [W * 0.2, H * 0.22], [px, py]];
    var arc = [];
    for (var q = 0; q <= 30; q++) {
      var t = q / 30, u = 1 - Math.pow(1 - t, 2.2), v = 1 - u;
      var ax = v * v * v * P[0][0] + 3 * v * v * u * P[1][0] + 3 * v * u * u * P[2][0] + u * u * u * P[3][0];
      var ay = v * v * v * P[0][1] + 3 * v * v * u * P[1][1] + 3 * v * u * u * P[2][1] + u * u * u * P[3][1];
      arc.push({ transform: tr(ax, ay) });
    }
    bird.style.transform = arc[0].transform;
    return move(bird, arc, { duration: 3000, easing: 'linear' }).then(ok).then(function () {
      // Down on the sprig: wings folding in as it settles.
      return Promise.all([
        become(false, -1, 160),
        move(bird, [{ transform: tr(px, py, ' scale(1.08,.9)') }, { transform: tr(px, py, ' scale(1,1)') }], { duration: 260, easing: 'ease-out' })
      ]);
    }).then(ok).then(function () { return wait(500); }).then(ok).then(function () {
      // A shake, and the snow comes off it.
      snowPuff(stage, px + w / 2, py + h / 2, 9);
      var f = [];
      for (var i = 0; i <= 8; i++) f.push({ transform: tr(px, py, ' rotate(' + (i === 0 || i === 8 ? 0 : (i % 2 ? 11 : -11)) + 'deg)') });
      return move(bird, f, { duration: 560, easing: 'linear' });
    }).then(ok).then(function () { return wait(400); }).then(ok).then(function () {
      // A hop along the sprig and back.
      return move(bird, [
        { transform: tr(px, py) }, { transform: tr(px + 5, py - 7) }, { transform: tr(px + 9, py) },
        { transform: tr(px + 9, py), offset: 0.6 }, { transform: tr(px + 4, py - 6), offset: 0.8 }, { transform: tr(px, py) }
      ], { duration: 900, easing: 'ease-in-out' });
    }).then(ok).then(function () {
      return peck(-1);                          // a peck at a berry
    }).then(ok).then(function () { return wait(300); }).then(ok).then(function () {
      /* Then a quick run of pecks -- head down, up, down, up -- and the
         turn happens inside it: the right-facing drawing fades up over the
         left-facing one across the middle of the run, hidden in the bobbing,
         so when it stops and lifts its head it is already facing right.
         The pecks are straight dips, which read the same either way round. */
      var frames = [], dips = 6;
      for (var i = 0; i < dips; i++) {
        frames.push({ transform: tr(px, py, ' scale(1,1)') });
        frames.push({ transform: tr(px, py + 3, ' scale(1.05,.88)') });
      }
      frames.push({ transform: tr(px, py - 2, ' scale(.98,1.04)') });   // head up
      frames.push({ transform: tr(px, py, ' scale(1,1)') });
      var run = move(bird, frames, { duration: dips * 130 + 260, easing: 'linear' });
      var turn = wait(200).then(function () { if (rig.gen === gen) return become(false, 1, 420); });
      return Promise.all([run, turn]);
    }).then(ok).then(function () { return wait(450); }).then(ok).then(function () {
      /* And away across the set, out past the right side a quarter of the way
         down. It is already facing the way it goes; the wings come out as it
         lifts, a quick cross-fade from the perched drawing to the flying one. */
      become(true, 1, 150);
      /* One smooth curve, like the way in: up off the sprig, across, and out
         at a quarter of the way down, from a standstill and gathering speed
         steadily -- the three straight legs it used to fly turned corners
         and changed pace where they met. */
      var Q = [[px, py], [px + 70, py - 14], [W * 0.5, H * 0.16], [W + 30, H * 0.25]], away = [];
      for (var q = 0; q <= 30; q++) {
        var t = q / 30, u = Math.pow(t, 1.7), v = 1 - u;
        away.push({ transform: tr(
          v * v * v * Q[0][0] + 3 * v * v * u * Q[1][0] + 3 * v * u * u * Q[2][0] + u * u * u * Q[3][0],
          v * v * v * Q[0][1] + 3 * v * v * u * Q[1][1] + 3 * v * u * u * Q[2][1] + u * u * u * Q[3][1]) });
      }
      return move(bird, away, { duration: 3200, easing: 'linear' });
    }).then(function () { bird.remove(); });
  }

  /* ---- the sleigh, the presents, and the raccoon ---- */
  var SLEIGH_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 270 90" width="100%" height="100%" overflow="visible">' +
      // reins and traces, reindeer to sleigh
      '<path d="M58 42Q86 50 116 56" stroke="#e3bd5a" stroke-width="1.6" fill="none"/>' +
      '<path d="M22 30Q90 30 150 40" stroke="#6b3a1c" stroke-width="1" fill="none"/>' +
      // the reindeer
      '<g>' +
        '<g stroke="#5a3418" stroke-width="3" stroke-linecap="round">' +
          '<g><animateTransform attributeName="transform" type="rotate" values="-38 38 49;26 38 49;-38 38 49" dur=".55s" repeatCount="indefinite"/><path d="M38 49L34 64"/></g>' +
          '<g><animateTransform attributeName="transform" type="rotate" values="26 42 49;-38 42 49;26 42 49" dur=".55s" repeatCount="indefinite"/><path d="M42 49L40 64"/></g>' +
          '<g><animateTransform attributeName="transform" type="rotate" values="30 60 49;-30 60 49;30 60 49" dur=".55s" repeatCount="indefinite"/><path d="M60 49L64 63"/></g>' +
          '<g><animateTransform attributeName="transform" type="rotate" values="-30 64 49;30 64 49;-30 64 49" dur=".55s" repeatCount="indefinite"/><path d="M64 49L69 62"/></g>' +
        '</g>' +
        '<ellipse cx="51" cy="44" rx="20" ry="9" fill="#8a5a33"/><path d="M70 40Q76 38 75 44Z" fill="#f2e2c0"/>' +
        '<path d="M34 42Q28 34 24 26" stroke="#8a5a33" stroke-width="7" stroke-linecap="round"/>' +
        '<path d="M31 37Q36 40 38 36" stroke="#d1122e" stroke-width="2.4" fill="none"/><circle cx="35" cy="40" r="1.6" fill="#f2c14e"/>' +
        '<g stroke="#6b3a1c" stroke-width="1.8" stroke-linecap="round" fill="none"><path d="M22 20Q20 11 24 5M22 13L17 9M23 9L27 5"/><path d="M26 20Q28 12 33 8M27 14L31 10"/></g>' +
        '<ellipse cx="18" cy="24" rx="8" ry="5.4" fill="#8a5a33"/><path d="M23 19L27 16L25 21Z" fill="#6b3a1c"/>' +
        '<circle cx="17" cy="22" r="1.1" fill="#1a1a1a"/>' +
        // the nose that lights the way
        '<circle cx="10" cy="25" r="8" fill="#ff3a3a" opacity=".35"><animate attributeName="r" values="6;9;6" dur="1.1s" repeatCount="indefinite"/><animate attributeName="opacity" values=".25;.5;.25" dur="1.1s" repeatCount="indefinite"/></circle>' +
        '<circle cx="10" cy="25" r="3.2" fill="#ff2626"/><circle cx="9" cy="24" r="1" fill="#fff" opacity=".8"/>' +
      '</g>' +
      // the sleigh
      '<path d="M246 81H130Q110 81 110 66Q110 60 116 60" stroke="#e3bd5a" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M140 74V81M220 74V81" stroke="#e3bd5a" stroke-width="2.4"/>' +
      '<path d="M120 50Q118 72 138 75H232Q246 73 246 52L238 38Q228 50 206 50Z" fill="#c8102e" stroke="#7a0616" stroke-width="1.6"/>' +
      '<path d="M122 58Q124 70 140 70H230" stroke="#e3bd5a" stroke-width="2" fill="none"/>' +
      // the sack, with the presents in it
      '<path d="M206 48Q200 22 216 16Q236 12 240 30Q242 44 236 50Z" fill="#8a5a2b" stroke="#5a3418" stroke-width="1.2"/>' +
      '<rect x="210" y="12" width="9" height="8" fill="#3fa05a"/><rect x="221" y="9" width="8" height="9" fill="#48b4ff"/><rect x="229" y="14" width="7" height="7" fill="#f2c14e"/>' +
      // Santa
      '<path d="M156 52Q152 28 172 26Q192 28 190 52Z" fill="#d1122e"/><rect x="156" y="42" width="34" height="4" fill="#1a1a1a"/><rect x="170" y="41.4" width="5" height="5" fill="none" stroke="#f2c14e" stroke-width="1"/>' +
      '<path class="toss" d="M186 34Q200 30 206 22" stroke="#d1122e" stroke-width="6" fill="none" stroke-linecap="round"/><circle class="toss-hand" cx="207" cy="21" r="3.2" fill="#fff"/>' +
      '<path d="M160 36Q150 38 136 44" stroke="#d1122e" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="135" cy="44.4" r="3.2" fill="#fff"/>' +
      '<path d="M135 44L58 42" stroke="#6b3a1c" stroke-width="1" fill="none"/>' +
      '<circle cx="168" cy="18" r="7" fill="#f5c8a0"/>' +
      '<path d="M160 20Q158 34 168 36Q178 34 176 20Q172 26 168 25Q164 26 160 20Z" fill="#fff"/>' +
      '<path d="M162.6 22Q166.7 19.8 170.8 22Q168.8 24.2 166.7 23Q164.6 24.2 162.6 22Z" fill="#fff" stroke="#e8e8ee" stroke-width=".4"/>' +
      // His face: two eyes with a glint, white brows, a round nose, rosy cheeks, a moustache.
      '<circle cx="162.6" cy="20.2" r="1.4" fill="#f08a8a" opacity=".75"/><circle cx="171" cy="20.2" r="1.3" fill="#f08a8a" opacity=".75"/>' +
      '<circle cx="164.2" cy="17.4" r="1.3" fill="#1a1a1a"/><circle cx="169.2" cy="17.4" r="1.3" fill="#1a1a1a"/>' +
      '<circle cx="163.8" cy="17" r=".45" fill="#fff"/><circle cx="168.8" cy="17" r=".45" fill="#fff"/>' +
      '<path d="M162.4 15.3Q164.2 14.2 166 15.3M167.4 15.3Q169.2 14.2 171 15.3" stroke="#fff" stroke-width="1.2" stroke-linecap="round" fill="none"/>' +
      '<circle cx="166.7" cy="19.6" r="1.6" fill="#e98a7a"/>' +
      '<path d="M160 13Q168 2 180 6Q186 9 186 16L180 14Q176 10 168 12Z" fill="#d1122e"/><path d="M159.4 13.6Q168 10.6 177 13.2" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/><circle cx="187" cy="17" r="3" fill="#fff"/>' +
    '</svg>';

  var PRESENTS = [['#d1122e', '#f2c14e'], ['#1f8a3a', '#d1122e'], ['#2a6fd1', '#e8eef5'], ['#f2c14e', '#d1122e'], ['#8e3fb8', '#f2c14e']];
  function presentSvg(box, ribbon) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 24" width="100%" height="100%" overflow="visible">' +
      '<rect x="2" y="9" width="22" height="14" rx="1" fill="' + box + '"/>' +
      '<rect x="1" y="6" width="24" height="4.6" rx="1" fill="' + box + '" stroke="rgba(0,0,0,.2)" stroke-width=".6"/>' +
      '<rect x="11.4" y="6" width="3.2" height="17" fill="' + ribbon + '"/>' +
      '<ellipse cx="9.6" cy="4.4" rx="3.6" ry="2.2" fill="' + ribbon + '" transform="rotate(-20 9.6 4.4)"/>' +
      '<ellipse cx="16.4" cy="4.4" rx="3.6" ry="2.2" fill="' + ribbon + '" transform="rotate(20 16.4 4.4)"/>' +
      '<circle cx="13" cy="5.4" r="1.6" fill="' + ribbon + '"/>' +
    '</svg>';
  }

  /* The raccoon faces right; its head can turn on its own. head is how far
     round: 1 is full profile to the right, 0 is looking out at you, -1 full
     profile to the left, and its everyday look is 'right' (.55), a three-
     quarter view; 'front' and 'left' name the others. As it turns the eyes,
     mask and muzzle slide across the round of the head, the eyes closing up
     together and looking the way it turns, the ears going back. */
  /* Redraw a raccoon in place -- its own drawing only, never whatever it is
     carrying -- mirrored to face left if left. */
  function redrawCoon(el, html, left) {
    var box = document.createElement('div');
    box.innerHTML = html;
    var svg = box.firstChild;
    if (left) svg.style.transform = 'scaleX(-1)';
    var old = el.querySelector(':scope > svg');
    if (old) el.replaceChild(svg, old); else el.insertBefore(svg, el.firstChild);
  }
  function raccoonSvg(pose, head, empty, load) {
    var t = head === 'front' ? 0 : head === 'left' ? -0.55 : typeof head === 'number' ? head : 0.55;
    var legs, bob = '';
    if (pose === 'run' || pose === 'sneak') {
      var d = pose === 'run' ? 0.22 : 0.5, a = pose === 'run' ? 36 : 22;
      bob = '<animateTransform attributeName="transform" type="translate" values="0 0;0 ' + (pose === 'run' ? -3 : -1.5) + ';0 0" dur="' + d + 's" repeatCount="indefinite"/>';
      legs = [[24, 1], [28, -1], [38, -1], [42, 1]].map(function (l) {
        return '<g><animateTransform attributeName="transform" type="rotate" values="' + (l[1] * a) + ' ' + l[0] + ' 42;' + (-l[1] * a) + ' ' + l[0] + ' 42;' + (l[1] * a) + ' ' + l[0] + ' 42" dur="' + d + 's" repeatCount="indefinite"/><path d="M' + l[0] + ' 42V52"/></g>';
      }).join('');
    } else {
      legs = '<path d="M24 42V52M28 42V52M38 42V52M42 42V52"/>';
    }
    var n = function (v) { return +v.toFixed(2); }, at = Math.abs(t);
    var ec = 51 + 3.2 * t, sp = (7.2 - 2.4 * at) / 2, pu = 1.1 * t;
    var sx = 51 + 10 * t, nx = sx + 4.4 * t, mk = 2.5 * t, ea = -2 * t;
    var face = '<path d="M' + n(43 + mk) + ' 23Q' + n(51 + mk) + ' 19 ' + n(59 + mk) + ' 23Q' + n(59 + mk) + ' 28 ' + n(51 + mk) + ' 27Q' + n(43 + mk) + ' 28 ' + n(43 + mk) + ' 23Z" fill="#1e1e24"/>' +
      '<circle cx="' + n(ec - sp) + '" cy="24.6" r="2.2" fill="#fff"/><circle cx="' + n(ec + sp) + '" cy="24.6" r="2.2" fill="#fff"/>' +
      '<circle cx="' + n(ec - sp + pu) + '" cy="24.7" r="1.1" fill="#1a1a1a"/><circle cx="' + n(ec + sp + pu) + '" cy="24.7" r="1.1" fill="#1a1a1a"/>' +
      '<ellipse cx="' + n(sx) + '" cy="' + n(29.8 - 0.3 * at) + '" rx="' + n(4.4 + 1.2 * at) + '" ry="' + n(3.2 + 0.2 * at) + '" fill="#d8d8de"/>' +
      '<circle cx="' + n(nx) + '" cy="' + n(28.4 + 0.4 * at) + '" r="1.6" fill="#1a1a1a"/>' +
      '<path d="M' + n(sx - 2.2) + ' 31.8Q' + n(sx) + ' 33.4 ' + n(sx + 2.2) + ' 31.8" stroke="#1a1a1a" stroke-width=".8" fill="none"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 56" width="100%" height="100%" overflow="visible"><g>' + bob +
      '<path d="M16 36Q2 32 4 16" stroke="#8c8c94" stroke-width="8" fill="none" stroke-linecap="round"/>' +
      '<path d="M16 36Q2 32 4 16" stroke="#2c2c32" stroke-width="8" fill="none" stroke-dasharray="3.2 4" stroke-linecap="butt"/>' +
      '<g stroke="#3a3a40" stroke-width="3" stroke-linecap="round">' + legs + '</g>' +
      '<ellipse cx="32" cy="37" rx="15" ry="9.6" fill="#8c8c94"/><ellipse cx="33" cy="40" rx="10" ry="5" fill="#b4b4bb"/>' +
      /* The sack rides on its back, tied on with a cord round the body -- it
         is on all fours, and a fifth limb holding it looked wrong. empty:
         no sack at all. */
      (empty ? ''
        // A sack with a turkey in it, heaved up onto its back.
        : load === 'turkey' ? '<g class="sack"><g transform="translate(6.6 -3.8) scale(.64)">' + sackInner('stuffed') + '</g>' +
          '<path d="M27 10Q37 17 39 30Q39.5 35 37 40" stroke="#5a3418" stroke-width="1.5" fill="none" stroke-linecap="round"/></g>'
        : '<g class="sack"><path d="M16 30Q8 18 18 8Q30 2 34 14Q36 26 28 32Z" fill="#8a5a2b" stroke="#5a3418" stroke-width="1.2"/><path d="M22 10Q27 6 31 10" stroke="#5a3418" stroke-width="1.4" fill="none"/>' +
          '<path d="M27 10Q37 17 39 30Q39.5 35 37 40" stroke="#5a3418" stroke-width="1.5" fill="none" stroke-linecap="round"/></g>') +
      '<g>' +
        '<path transform="translate(' + n(ea) + ' 0)" d="M43 18L44 10L48 16ZM55 16L58 9L59 17Z" fill="#6a6a72"/>' +
        '<circle cx="51" cy="25" r="9" fill="#9a9aa2"/>' + face +
      '</g>' +
    '</g></svg>';
  }


  /* The raccoon's sack, on its own, in a 60-unit box, for when it comes off
     the raccoon's back. 'open': lying on its side, mouth open to the left.
     'stuffed': sitting up, full, tied at the neck, a turkey's legs sticking
     out of the top and kicking, the whole of it wobbling. */
  function sackInner(how) {
    if (how === 'open') {
      return '<path d="M12 17Q4 31 12 46Q31 55 50 47Q58 38 54 26Q48 12 30 12Q19 12 12 17Z" fill="#8a5a2b" stroke="#5a3418" stroke-width="1.2"/>' +
        '<path d="M26 16Q34 30 26 46M40 16Q46 31 40 47" stroke="#6e4420" stroke-width="1" fill="none"/>' +
        '<ellipse class="mouth" cx="12" cy="31.5" rx="5.5" ry="14" fill="#2a1a0c" stroke="#5a3418" stroke-width="1.2"/>';
    }
    var leg = function (x, a, d, begin) {
      return '<g><animateTransform attributeName="transform" type="rotate" values="' + (-a) + ' ' + x + ' 14;' + a + ' ' + x + ' 14;' + (-a) + ' ' + x + ' 14" dur="' + d + 's" begin="' + begin + 's" repeatCount="indefinite"/>' +
        '<path d="M' + x + ' 14L' + (x - 1) + ' -2M' + (x - 1) + ' -2L' + (x - 6) + ' -4M' + (x - 1) + ' -2L' + (x - 3) + ' -8M' + (x - 1) + ' -2L' + (x + 3) + ' -7" stroke="#e0a030" stroke-width="2.6" stroke-linecap="round" fill="none"/></g>';
    };
    return '<g><animateTransform attributeName="transform" type="rotate" values="-4 30 56;4 30 56;-3 30 56;3 30 56;-4 30 56" dur="1.1s" repeatCount="indefinite"/>' +
      leg(27, 16, 0.34, 0) + leg(34, 18, 0.3, -0.12) +
      '<path d="M22 17L25 11L35 11L38 17Z" fill="#7a4e24" stroke="#5a3418" stroke-width="1"/>' +
      '<path d="M15 23Q3 39 12 53Q31 61 49 53Q58 39 45 23Q39 17 30 17Q21 17 15 23Z" fill="#8a5a2b" stroke="#5a3418" stroke-width="1.2"/>' +
      '<path d="M22 30Q18 42 22 52M38 30Q43 42 38 52" stroke="#6e4420" stroke-width="1" fill="none"/>' +
      '<path d="M22.5 17.5Q30 20 37.5 17.5" stroke="#3a2210" stroke-width="1.8" fill="none" stroke-linecap="round"/></g>';
  }
  function sackSvg(how) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" width="100%" height="100%" overflow="visible">' + sackInner(how) + '</svg>';
  }

  /* Measured offline at volume 35, both channels: about -55 dBFS with the
     hard hits in, near the rotor, the hits standing clear of the lighter
     strikes. (Left-channel-only readings ran a few dB low: the bells are
     scattered across the stereo field at random.) */
  var JINGLE_PEAK = 0.044;   // then a hair quieter, at Mark's ear
  /* Sleigh bells, matched to a real recording Mark supplied (studied, not
     shipped: nothing of it is in the app). What it measured:

       - three or so bells, fundamentals near 2.51, 2.67 and 2.82 kHz, each
         with overtones at almost exactly 2.44x and 3.78x its fundamental.
         The 2.44x overtone (6.1-7.0 kHz) carries the sound; the fundamental
         sits about 6 dB under it and the 3.78x one about 5 dB under. 58% of
         the energy is in 6-8 kHz, 23% in 8-11 kHz, almost none below 2 kHz;
       - strongly tonal, not noisy (spectral flatness 0.07), so the strike's
         click is slight;
       - a long ring: down 10 dB in 75ms and 20 dB in 250ms, a steady
         exponential fall over about a second;
       - shaken on a pulse: a shake every ~296ms, each a little cluster of two
         to four strikes 20-80ms apart, about six strikes a second in all;
       - wide in stereo (L/R correlation 0.56).

     Earlier goes guessed at all of this -- pitches too low, rings too short,
     too much noise, and a hand-drawn rhythm -- and none of them sounded like
     bells. Scheduled a moment ahead on the audio clock, on the same volume
     curve as the rotor. */
  function jingleSound() {
    var ac = sfx();
    if (!ac) return null;
    var out = sfxBus(ac, 0, 0.8), master = out.master;
    var next = ac.currentTime + 0.05;

    // Nothing under the metal, and only a breath of air round it.
    var bus = ac.createBiquadFilter(); bus.type = 'highpass'; bus.frequency.value = 1800;
    bus.connect(master);
    var air = ac.createConvolver();
    var ir = ac.createBuffer(2, Math.floor(ac.sampleRate * 0.25), ac.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var dd = ir.getChannelData(ch);
      for (var k = 0; k < dd.length; k++) dd[k] = (Math.random() * 2 - 1) * Math.exp(-k / dd.length * 10);
    }
    air.buffer = ir;
    var wet = ac.createGain(); wet.gain.value = 0.18;
    bus.connect(air); air.connect(wet); wet.connect(master);
    var buf = noiseOf(ac);

    /* The bells: fundamentals spread across the measured 2.45-2.9 kHz, the
       two overtones at the measured ratios give or take a hair, each bell
       with its own place in a wide stereo field. Relative levels and ring
       lengths per partial from the recording: the 2.44x one loudest and
       longest-lived at about a second to silence. */
    var bells = [];
    for (var b = 0; b < 6; b++) {
      var split = rand(1.002, 1.004);
      var bp = ac.createStereoPanner ? ac.createStereoPanner() : null;
      if (bp) { bp.pan.value = rand(-0.95, 0.95); bp.connect(bus); }
      bells.push({
        f: rand(2450, 2900), out: bp || bus,
        /* [ratio, level, ring seconds]. The main 2.44x mode comes as a close
           pair, a fraction of a percent apart, as it does in any bell that is
           not a perfect sphere; the two beat slowly -- a shimmer, where a
           wider split beat fast enough to buzz -- and the pair is what stops it sounding like
           a sine. A fourth, faint, high mode near 5.3x fills 11-16 kHz. */
        partials: [
          [1, 0.32, rand(0.9, 1.2)],
          [rand(2.42, 2.47), 1, rand(0.85, 1.1)],
          [0, 0.6, rand(0.3, 0.5)],
          [rand(3.74, 3.82), 0.8, rand(0.55, 0.75)],
          [rand(5.2, 5.45), 0.5, rand(0.2, 0.35)]
        ]
      });
      // The partner of the main mode sits just above it.
      bells[b].partials[2][0] = bells[b].partials[1][0] * split;
    }
    function strike(bell, t, g, hard) {
      var detune = rand(0.995, 1.005);
      bell.partials.forEach(function (p) {
        var o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = bell.f * p[0] * detune;
        var e = ac.createGain(), end = t + p[2] * rand(0.85, 1.15);
        e.gain.setValueAtTime(0.0001, t);
        e.gain.exponentialRampToValueAtTime(g * p[1], t + 0.0012);
        e.gain.exponentialRampToValueAtTime(0.0001, end);
        o.connect(e); e.connect(bell.out);
        o.start(t); o.stop(end + 0.02);
      });
      // The strike's click: slight, since the bells are mostly tone.
      var n = ac.createBufferSource(); n.buffer = buf;
      var bpf = ac.createBiquadFilter(); bpf.type = 'bandpass'; bpf.frequency.value = rand(7500, 10000); bpf.Q.value = 1.1;
      var ne = ac.createGain();
      ne.gain.setValueAtTime(0.0001, t);
      // A hard hit snaps: more click, and brighter.
      if (hard) bpf.frequency.value = rand(9000, 11000);
      ne.gain.exponentialRampToValueAtTime(g * (hard ? 1.1 : 0.6), t + 0.001);
      ne.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
      n.connect(bpf); bpf.connect(ne); ne.connect(bell.out);
      n.start(t, rand(0, 1.5), 0.02);
      // And the pellet's rattle dying away under the ring.
      var rn = ac.createBufferSource(); rn.buffer = buf;
      var rf = ac.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = rand(6500, 9000); rf.Q.value = 2.5;
      var rg = ac.createGain();
      rg.gain.setValueAtTime(0.0001, t);
      rg.gain.exponentialRampToValueAtTime(g * 0.12, t + 0.004);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      rn.connect(rf); rf.connect(rg); rg.connect(bell.out);
      rn.start(t, rand(0, 1.5), 0.08);
    }
    function anyBell() { return bells[Math.floor(Math.random() * bells.length)]; }

    // The pulse the recording shook on, drifting a little as a hand would.
    var pulse = 0.296;
    var shaker = setInterval(function () {
      while (next < ac.currentTime + 0.3) {
        pulse = Math.max(0.27, Math.min(0.32, pulse + rand(-0.006, 0.006)));
        /* Each shake opens with a hard hit, where the harness jerks: two or
           three bells struck together, harder, with a sharper click -- the
           recording's strongest strikes ran about twice its typical ones.
           Then one or two lighter strikes 30-90ms behind it. */
        var at = next + rand(-0.006, 0.006), g = JINGLE_PEAK * rand(0.75, 1);
        var hardN = 2 + Math.floor(Math.random() * 2), hardG = g * rand(1.4, 1.8);
        for (var h = 0; h < hardN; h++) strike(anyBell(), at + rand(0, 0.004), hardG * (h ? rand(0.6, 0.9) : 1), true);
        var n = 1 + Math.floor(Math.random() * 2);
        for (var i = 0; i < n; i++) {
          at += rand(0.03, 0.09);
          strike(anyBell(), at, g * rand(0.45, 0.85));
          if (Math.random() < 0.08) strike(anyBell(), at + rand(0.002, 0.012), g * rand(0.3, 0.6));
        }
        next += pulse;
      }
    }, 100);
    out.onEnd = function () { clearInterval(shaker); };
    return out;
  }

  function sleigh(rig) {
    var ws = windowStage(rig), gen = rig.gen, ok = guard(rig, gen);
    var m = boxIn(rig, '.meter'), d = boxIn(rig, '.display');
    var S = 0.9, w = 270 * S, h = 90 * S;
    var fy = (m ? m.y - d.y + m.h : 44) + 4;      // just under the lights
    var el = drawn(ws, 'st-sleigh', w, h, '');
    var bob = document.createElement('div'); bob.className = 'st-bob'; bob.innerHTML = SLEIGH_SVG;
    el.appendChild(bob);
    var toss = el.querySelectorAll('.toss, .toss-hand');
    Array.prototype.forEach.call(toss, function (p) { p.style.transformBox = 'view-box'; p.style.transformOrigin = '186px 34px'; });
    var x0 = ws.W + 30, x1 = -w - 30, DUR = 11000;
    el.style.transform = tr(x0, fy);
    var sound = rig.sound = jingleSound();
    if (sound) { sound.panTo(1, 0.01); sound.fadeIn(1.4); }
    var presents = [];

    /* One present, out of the sack and over the side. While it is in his
       hand it belongs to the sleigh -- a child of the bobbing layer -- so it
       moves with the sleigh, bob and all, and his arm and the present are
       one movement: as the arm comes up the present rises out of the sack
       mouth, small, and grows to full size on its way to his hand. At the
       top of the swing he lets go; it is handed to the window at the very
       spot his hand was, and falls from there. */
    var SACK = [222, 12], HAND = [194, 8];   // in the sleigh drawing's units
    function drop(at) {
      return wait(DUR * at).then(function () {
        if (rig.gen !== gen) return;
        var RAISE = 280;
        Array.prototype.forEach.call(toss, function (p) {
          p.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-40deg)', offset: RAISE / 620 }, { transform: 'rotate(0deg)' }],
            { duration: 620, easing: 'ease-in-out' });
        });
        var colours = PRESENTS[Math.floor(Math.random() * PRESENTS.length)];
        var pw = 26 * rand(0.9, 1.15), ph = pw * 24 / 26;
        var p = document.createElement('div');
        p.className = 'st-present st-inhand';
        p.style.width = pw + 'px'; p.style.height = ph + 'px';
        p.style.transformOrigin = '50% 100%';
        p.innerHTML = presentSvg(colours[0], colours[1]);
        bob.appendChild(p);
        var sx0 = SACK[0] * S - pw / 2, sy0 = SACK[1] * S - ph / 2, hx = HAND[0] * S - pw / 2, hy = HAND[1] * S - ph;
        var up = p.animate([
          { transform: tr(sx0, sy0, ' scale(.25)'), opacity: 0 },
          { transform: tr((sx0 + hx) / 2, Math.min(sy0, hy) - 6, ' scale(.7)'), opacity: 1, offset: 0.55 },
          { transform: tr(hx, hy, ' scale(1)'), opacity: 1 }
        ], { duration: RAISE, easing: 'ease-out', fill: 'forwards' });
        return up.finished.then(function () {
          if (rig.gen !== gen) return;
          // Let go: onto the window, exactly where it is now.
          var r = p.getBoundingClientRect(), wr = ws.getBoundingClientRect();
          var sx = r.left - wr.left, sy = r.top - wr.top;
          up.cancel();
          p.classList.remove('st-inhand');
          ws.appendChild(p);
          p.style.transform = tr(sx, sy);
          var lx = sx - rand(40, 75), ly = ws.ground - ph + 4, spin = rand(160, 260) * (Math.random() < 0.5 ? 1 : -1);
          return move(p, [
            { transform: tr(sx, sy, ' rotate(0deg)') },
            { transform: tr(sx - 14, sy + (ly - sy) * 0.3, ' rotate(' + (spin * 0.35) + 'deg)'), offset: 0.35 },
            { transform: tr(lx, ly, ' rotate(' + (Math.round(spin / 360) * 360) + 'deg)') }
          ], { duration: 1300, easing: 'cubic-bezier(.4,0,.9,.6)' }).then(function () {
            if (rig.gen !== gen) return;
            snowPuff(ws, lx + pw / 2, ws.ground, 6);
            presents.push({ el: p, x: lx, y: ly, w: pw });
            return move(p, [{ transform: tr(lx, ly, ' scale(1.2,.75)') }, { transform: tr(lx, ly, ' scale(1,1)') }], { duration: 240, easing: 'ease-out' });
          });
        });
      });
    }

    return wait(1200).then(ok).then(function () {
      if (sound) sound.panTo(-1, DUR / 1000);
      var bobbing = bob.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(6px)' }],
        { duration: 1400, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
      var fly = move(el, [{ transform: tr(x0, fy) }, { transform: tr(x1, fy - 10) }], { duration: DUR, easing: 'linear' });
      var drops = [0.24, 0.4, 0.56, 0.72].map(drop);
      return fly.then(function () {
        bobbing.cancel();
        if (sound) sound.stop(1.4);
        el.remove();
        return Promise.all(drops);
      });
    }).then(ok).then(function () {
      if (rig.sound === sound) rig.sound = null;
      return wait(2600);
    }).then(ok).then(function () {
      if (!presents.length) return;
      // In scurries the raccoon.
      presents.sort(function (a, b) { return a.x - b.x; });
      var RS = 1, rw = 70 * RS, rh = 56 * RS, ry = ws.ground - rh + 5;
      var coon = drawn(ws, 'st-coon', rw, rh, raccoonSvg('run'));
      var cx = -rw - 20;
      coon.style.transform = tr(cx, ry);
      var sack = null, haul = 1;
      function pose(p, head) { coon.innerHTML = raccoonSvg(p, head); sack = part(coon, '.sack', '50% 90%'); sack.style.transform = 'scale(' + haul + ')'; }
      /* A look round, the head turning by degrees: all the way round to the
         right, a moment, back through the front all the way round to the
         left, a longer moment, and back to where it was. */
      function lookRound(hold) {
        var seq = [[0.8, 45], [1, 280], [0.6, 45], [0.2, 45], [-0.2, 45], [-0.6, 45], [-1, hold],
                   [-0.6, 45], [-0.2, 45], [0.2, 45], ['right', 0]];
        return frames(seq, ok, function (h) { pose('look', h); });
      }
      function runTo(x, speed) {
        pose('run');
        var dur = Math.abs(x - cx) / speed * 1000, from = tr(cx, ry);
        cx = x;
        return move(coon, [{ transform: from }, { transform: tr(x, ry) }], { duration: dur, easing: 'ease-out' });
      }
      var chain = Promise.resolve();
      presents.forEach(function (pr) {
        chain = chain.then(ok).then(function () {
          return runTo(pr.x - rw * 0.55, 320);
        }).then(ok).then(function () {
          pose('look');
          return lookRound(260);
        }).then(ok).then(function () {
          // Into the sack it goes.
          var sx = cx + 22 * RS, sy = ry + 10 * RS;
          haul *= 1.14;
          return Promise.all([
            move(pr.el, [
              { transform: tr(pr.x, pr.y, ' scale(1)'), opacity: 1 },
              { transform: tr((pr.x + sx) / 2, pr.y - 30, ' scale(.7)'), opacity: 1, offset: 0.5 },
              { transform: tr(sx, sy, ' scale(.3)'), opacity: 0 }
            ], { duration: 460, easing: 'ease-in' }).then(function () { pr.el.remove(); }),
            wait(380).then(function () {
              return move(sack, [{ transform: 'scale(' + (haul / 1.14) + ')' }, { transform: 'scale(' + (haul * 1.08) + ')' }, { transform: 'scale(' + haul + ')' }], { duration: 260 });
            })
          ]);
        });
      });
      return chain.then(ok).then(function () {
        // A look back over its shoulder -- nobody saw -- and away.
        pose('look');
        return lookRound(600);
      }).then(ok).then(function () {
        return wait(250);
      }).then(ok).then(function () {
        return runTo(ws.W + 30, 380);
      }).then(function () { coon.remove(); });
    });
  }

  /* ------------------------------------------------------------------ */
  /* When                                                               */
  /* ------------------------------------------------------------------ */


  /* ------------------------------------------------------------------ */
  /* April Showers: a duck, an umbrella, a butterfly, a rainbow.         */
  /* ------------------------------------------------------------------ */

  /* The ground of the bed, in front of the tulips and behind the front
     grass (the meter's own box, planted with the tulips). The duck walks
     here so the grass stands in front of its feet. */
  function yardOf(rig) { return rig.tuner.querySelector('.sp-yard'); }

  /* A white farm duck. t is which way it faces: 1 in profile to the right,
     0 looking out at you, -1 to the left, and the values between are its
     turning -- the body narrowing and the head coming round over it, the
     bill and the eyes with it -- so it turns rather than flips. Poses:
     'walk' (a waddle), 'stand', 'swim' (low in the water, the rest of it
     under the surface) and 'shake'. */
  var duckClip = 0;
  function duckSvg(pose, t, hen) {
    if (t == null) t = 1;
    var at = Math.abs(t), sg = t < 0 ? -1 : 1, n = function (v) { return +v.toFixed(2); };
    var bx = 20 - 2 * t, brx = 7 + 5 * at, hx = 20 + 8 * t;
    // hen: its mate, a brown one.
    var WH = hen ? '#c89b6a' : '#fbfbf7', ED = hen ? '#8a6038' : '#cfcfc6';
    var legs = '';
    if (pose === 'walk' || pose === 'stand') {
      legs = [-1, 1].map(function (s) {
        var x = n(bx + s * (2 + 1.5 * at));
        var foot = '<path d="M' + x + ' 29V34.6M' + n(x - 1.4 + 0.6 * t) + ' 34.8H' + n(x + 1.4 + 2 * t) + '" stroke="#f29a2e" stroke-width="1.5" stroke-linecap="round" fill="none"/>';
        if (pose !== 'walk') return foot;
        return '<g><animateTransform attributeName="transform" type="rotate" values="' + (s * 22) + ' ' + x + ' 29;' + (-s * 22) + ' ' + x + ' 29;' + (s * 22) + ' ' + x + ' 29" dur=".34s" repeatCount="indefinite"/>' + foot + '</g>';
      }).join('');
    }
    var tail = at > 0.25 ? '<path d="M' + n(bx - sg * (brx - 2)) + ' 21L' + n(bx - sg * (brx + 3.5)) + ' 15.5L' + n(bx - sg * (brx - 3)) + ' 26Z" fill="' + WH + '" stroke="' + ED + '" stroke-width=".8" stroke-linejoin="round"/>' : '';
    var body = tail +
      '<ellipse cx="' + n(bx) + '" cy="24" rx="' + n(brx) + '" ry="7.5" fill="' + WH + '" stroke="' + ED + '" stroke-width=".8"/>' +
      '<ellipse cx="' + n(bx - 1.5 * t) + '" cy="23" rx="' + n(3.5 + 2.5 * at) + '" ry="3.6" fill="' + (hen ? '#a87a4a' : '#efefe6') + '" stroke="' + ED + '" stroke-width=".6"/>' +
      '<ellipse cx="' + n(hx - 1.5 * t) + '" cy="17" rx="3.6" ry="5.4" fill="' + WH + '"/>' +
      '<circle cx="' + n(hx) + '" cy="11" r="5.6" fill="' + WH + '" stroke="' + ED + '" stroke-width=".8"/>' +
      '<circle cx="' + n(hx + 2.2 * t - 2.3 * (1 - at)) + '" cy="10" r=".95" fill="#1a1a1a"/>' +
      '<circle cx="' + n(hx + 2.2 * t + 2.3 * (1 - at)) + '" cy="10" r=".95" fill="#1a1a1a"/>' +
      '<ellipse cx="' + n(hx + 6.5 * t) + '" cy="' + n(13.6 - 0.4 * at) + '" rx="' + n(2.6 + 2.2 * at) + '" ry="1.7" fill="#f29a2e" stroke="#c96f14" stroke-width=".6"/>';
    var inner;
    if (pose === 'swim' || pose === 'shake') {
      var id = 'st-duck-' + (++duckClip);
      var rock = pose === 'shake'
        ? '<animateTransform attributeName="transform" type="rotate" values="-9 20 24;9 20 24;-9 20 24" dur=".12s" repeatCount="indefinite"/>'
        : '<animateTransform attributeName="transform" type="translate" values="0 0;0 .8;0 0" dur="1.3s" repeatCount="indefinite"/>';
      inner = '<defs><clipPath id="' + id + '"><rect x="-10" y="-10" width="60" height="37"/></clipPath></defs>' +
        '<g clip-path="url(#' + id + ')"><g>' + rock + body + '</g></g>' +
        '<path d="M' + n(bx - brx - 3) + ' 27.2Q' + n(bx - brx) + ' 26 ' + n(bx - brx + 3) + ' 27.2M' + n(bx + brx - 3) + ' 27.2Q' + n(bx + brx) + ' 26 ' + n(bx + brx + 3) + ' 27.2" stroke="#fff" stroke-opacity=".8" stroke-width=".8" fill="none"/>';
    } else {
      var waddle = pose === 'walk' ? '<animateTransform attributeName="transform" type="rotate" values="-5 20 34;5 20 34;-5 20 34" dur=".68s" repeatCount="indefinite"/>' : '';
      inner = '<g>' + waddle + legs + body + '</g>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 36" width="100%" height="100%" overflow="visible">' + inner + '</svg>';
  }

  // Rings thrown out on the water, and drops flung up and falling back.
  function splash(host, x, y, rings) {
    for (var i = 0; i < rings; i++) (function (i) {
      var r = drawn(host, 'st-splash', 24, 7, '');
      r.animate([{ transform: tr(x - 12, y - 3.5, ' scale(.4)'), opacity: 0.95 }, { transform: tr(x - 12, y - 3.5, ' scale(4.5)'), opacity: 0 }],
        { duration: 1000, delay: i * 170, easing: 'ease-out', fill: 'both' }).finished.then(function () { r.remove(); }, function () {});
    })(i);
    for (var e = 0; e < 9; e++) (function () {
      var d = drawn(host, 'st-drop', 4, 4, '');
      var vx = rand(-40, 40), vy = rand(-75, -35), g = 260, T = rand(0.45, 0.7), fr = [];
      for (var q = 0; q <= 10; q++) {
        var s = T * q / 10;
        fr.push({ transform: tr(x - 2 + vx * s, y - 4 + vy * s + g * s * s / 2), opacity: q < 7 ? 1 : +(1 - (q - 7) / 3).toFixed(2) });
      }
      d.animate(fr, { duration: T * 1000, easing: 'linear', fill: 'forwards' }).finished.then(function () { d.remove(); }, function () {});
    })();
  }
  // A hop along an arc from one place to another.
  function hop(el, x0, y0, x1, y1, lift, ms) {
    var fr = [];
    for (var q = 0; q <= 10; q++) { var u = q / 10; fr.push({ transform: tr(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u - lift * 4 * u * (1 - u)) }); }
    return move(el, fr, { duration: ms, easing: 'linear' });
  }

  /* The duck waddles in along the bed, stops at the edge of the puddle,
     hops in with a splash, paddles out, has a good shake, turns round and
     paddles back, hops out and waddles off the way it came. */
  function duck(rig) {
    var yard = yardOf(rig), gen = rig.gen, ok = guard(rig, gen);
    if (!yard) return Promise.resolve();
    var W = yard.clientWidth, H = yard.clientHeight;
    var S = 1.1, w = 40 * S, h = 36 * S;
    var el = drawn(yard, 'st-duck', w, h, duckSvg('walk', 1));
    var feetY = H - 7 - h * (35 / 36);      // its feet down among the grass
    var swimY = H - 19 - h * (27 / 36);     // its waterline across the middle of the puddle
    // The puddle lies from 260px to 6px in from the right (the stylesheet's).
    var pL = W - 260, edgeX = pL - w * 0.55, inX = pL + 30, farX = W - 150 - w / 2;
    var x0 = -w - 10;
    function face(t, p) { el.innerHTML = duckSvg(p, t); }
    function walk(from, to, speed) {
      return move(el, [{ transform: tr(from, feetY) }, { transform: tr(to, feetY) }], { duration: Math.abs(to - from) / speed * 1000, easing: 'linear' });
    }
    function turn(ts, p) {
      return frames(ts.map(function (t) { return [t, 60]; }), ok, function (t) { face(t, p); });
    }
    el.style.transform = tr(x0, feetY);
    return walk(x0, edgeX, 80).then(ok).then(function () {
      face(1, 'stand');
      return wait(450);
    }).then(ok).then(function () {
      return hop(el, edgeX, feetY, inX, swimY, 14, 420);
    }).then(ok).then(function () {
      face(1, 'swim');
      splash(yard, inX + w / 2, H - 19, 3);
      return move(el, [{ transform: tr(inX, swimY) }, { transform: tr(farX, swimY) }], { duration: 2600, easing: 'ease-out' });
    }).then(ok).then(function () { return wait(500); }).then(ok).then(function () {
      // A good shake, the water flying off it.
      face(1, 'shake');
      splash(yard, farX + w / 2, H - 23, 1);
      return wait(700);
    }).then(ok).then(function () {
      face(1, 'swim');
      return wait(600);
    }).then(ok).then(function () {
      // Round through the front, to go back the way it came.
      return turn([0.5, 0, -0.5, -1], 'swim');
    }).then(ok).then(function () {
      return move(el, [{ transform: tr(farX, swimY) }, { transform: tr(inX, swimY) }], { duration: 2000, easing: 'ease-in-out' });
    }).then(ok).then(function () {
      face(-1, 'stand');
      return hop(el, inX, swimY, edgeX - 12, feetY, 12, 400);
    }).then(ok).then(function () {
      face(-1, 'walk');
      return walk(edgeX - 12, x0, 125);
    }).then(function () { el.remove(); });
  }

  // An umbrella, blown across the sky, tumbling over as it goes.
  function umbrella(rig) {
    var ws = windowStage(rig), s = 44;
    var el = drawn(ws, 'st-umbrella', s, s,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="100%" height="100%" overflow="visible">' +
      '<path d="M20 20V33Q20 37 16.5 36.4" stroke="#6a4a2a" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      '<path d="M3 20Q5 5 20 4Q35 5 37 20Q33.5 17 29.5 20Q24.5 16.5 20 20Q15.5 16.5 10.5 20Q6.5 17 3 20Z" fill="#e0527a" stroke="#a8325a" stroke-width=".8"/>' +
      '<path d="M20 4Q15 10 10.5 20M20 4Q25 10 29.5 20M20 4V20" stroke="#a8325a" stroke-width=".7" fill="none"/>' +
      '<path d="M20 4V1.5" stroke="#6a4a2a" stroke-width="1.4" stroke-linecap="round"/></svg>');
    var W = ws.W, H = ws.H, dir = Math.random() < 0.5 ? 1 : -1;
    var x0 = dir > 0 ? -s - 10 : W + 10, x1 = dir > 0 ? W + 10 : -s - 10;
    var y0 = rand(0.12, 0.35) * H, ph = rand(0, 6.28), turns = rand(1.2, 2), fr = [];
    for (var q = 0; q <= 40; q++) {
      var u = q / 40;
      fr.push({ transform: tr(x0 + (x1 - x0) * u, y0 + Math.sin(u * Math.PI * 2.4 + ph) * 22 + (u - 0.5) * 30,
        ' rotate(' + (dir * u * 360 * turns).toFixed(1) + 'deg) scaleY(' + (1 - 0.3 * Math.abs(Math.sin(u * Math.PI * 3))).toFixed(3) + ')') });
    }
    return move(el, fr, { duration: rand(5500, 7500), easing: 'linear' }).then(function () { el.remove(); });
  }

  /* The rain eases off (the stylesheet fades it on .sp-lull), a rainbow
     comes up behind everything in the window, holds, fades, and the rain
     comes back. */
  function rainbow(rig) {
    var t = rig.tuner, ok = guard(rig, rig.gen);
    t.classList.add('sp-lull');
    return wait(2600).then(ok).then(function () {
      t.classList.add('sp-rainbow');
      return wait(12000);
    }).then(ok).then(function () {
      t.classList.remove('sp-rainbow');
      return wait(3200);
    }).then(ok).then(function () {
      t.classList.remove('sp-lull');
      return wait(1200);
    });
  }

  /* A butterfly, seen from above, so it has no side to turn round to. Its
     wings beat at dur seconds a beat: quick in flight, slow at rest. */
  function butterflySvg(dur) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -16 40 32" width="100%" height="100%" overflow="visible">' +
      '<g><animateTransform attributeName="transform" type="scale" values="1 1;.2 1;1 1" dur="' + dur + 's" repeatCount="indefinite"/>' +
        '<path d="M0-2C-6-14-18-14-17-4C-16 2-6 2 0 0ZM0-2C6-14 18-14 17-4C16 2 6 2 0 0Z" fill="#f2c14e" stroke="#9a6a10" stroke-width=".7"/>' +
        '<path d="M0 0C-5 1-13 4-11 11C-9 15-3 9 0 2ZM0 0C5 1 13 4 11 11C9 15 3 9 0 2Z" fill="#f6d77a" stroke="#9a6a10" stroke-width=".7"/>' +
        '<circle cx="-11" cy="-7" r="2" fill="#e0527a"/><circle cx="11" cy="-7" r="2" fill="#e0527a"/>' +
      '</g>' +
      '<ellipse cx="0" cy="1" rx="1.4" ry="7" fill="#3a2a1a"/>' +
      '<path d="M-.5-6Q-3-11-5-12.5M.5-6Q3-11 5-12.5" stroke="#3a2a1a" stroke-width=".7" fill="none"/></svg>';
  }
  // Where each of the four tulip drawings has the top of its flower.
  var FLOWER_TOP = [11, 19, 7, 15];
  /* Run fn(u), u going 0 to 1 over ms, once a frame -- for a path whose end
     is moving: a tulip goes up and down with the music. */
  function follow(rig, gen, ms, fn) {
    return new Promise(function (res) {
      var t0 = performance.now();
      (function step(now) {
        if (rig.gen !== gen) return res();
        var u = Math.min(1, (now - t0) / ms);
        fn(u);
        if (u < 1) requestAnimationFrame(step); else res();
      })(t0);
    });
  }
  /* When the rain has eased off, a butterfly comes wandering in, settles
     on a tulip -- which dips under it, and carries it up and down with the
     music -- rests there, and wanders off. */
  function butterfly(rig) {
    var t = rig.tuner, gen = rig.gen, ok = guard(rig, gen);
    var bed = t.querySelector('.sp-bed');
    if (!bed) return Promise.resolve();
    var ws = windowStage(rig), W = ws.W, H = ws.H, bw = 32, bh = 26;
    var br = bed.getBoundingClientRect();
    var tulips = Array.prototype.map.call(bed.children, function (el, i) {
      return { el: el, i: i, w: parseFloat(el.style.getPropertyValue('--w')) || 1 };
    }).filter(function (o) {
      var r = o.el.getBoundingClientRect();
      return o.w > 0.8 && r.left > br.left + 20 && r.right < br.right - 20;
    });
    if (!tulips.length) return Promise.resolve();
    var pick = tulips[Math.floor(Math.random() * tulips.length)];
    function head() {
      var r = pick.el.getBoundingClientRect(), d = ws.getBoundingClientRect();
      return { x: r.left - d.left + 15, y: r.top - d.top + FLOWER_TOP[pick.i % 4] + 2 };
    }
    var el = drawn(ws, 'st-butterfly', bw, bh, butterflySvg(0.16));
    function at(x, y, rot) { el.style.transform = tr(x - bw / 2, y - bh / 2, ' rotate(' + (rot || 0).toFixed(1) + 'deg)'); }
    var dir = Math.random() < 0.5 ? 1 : -1, ph = rand(0, 6.28);
    var sx = dir > 0 ? -30 : W + 30, sy = rand(0.2, 0.45) * H;
    at(sx, sy);
    t.classList.add('sp-lull');
    return wait(2200).then(ok).then(function () {
      // This way and that, to hang over the flower.
      var h0 = head(), cx = (sx + h0.x) / 2, cy = Math.min(sy, h0.y - 30) - 40;
      return follow(rig, gen, 4600, function (u) {
        var e = u < 0.5 ? 2 * u * u : 1 - Math.pow(2 - 2 * u, 2) / 2, hh = head();
        var a = (1 - e) * (1 - e), b = 2 * e * (1 - e), c = e * e;
        at(a * sx + b * cx + c * hh.x + Math.sin(e * Math.PI * 5 + ph) * 10 * (1 - e),
           a * sy + b * cy + c * (hh.y - 30) + Math.sin(e * Math.PI * 7 + ph) * 7 * (1 - e),
           Math.sin(e * Math.PI * 6 + ph) * 12 * (1 - e));
      });
    }).then(ok).then(function () {
      return follow(rig, gen, 700, function (u) {
        var hh = head(), e = 1 - (1 - u) * (1 - u);
        at(hh.x, hh.y - 30 * (1 - e), 0);
      });
    }).then(ok).then(function () {
      el.innerHTML = butterflySvg(1.4);
      pick.el.style.setProperty('--dip', '4px');
      return follow(rig, gen, rand(3500, 5000), function () { var hh = head(); at(hh.x, hh.y, 0); });
    }).then(ok).then(function () {
      el.innerHTML = butterflySvg(0.14);
      pick.el.style.removeProperty('--dip');
      var h0 = head(), fx = dir > 0 ? W + 40 : -40, fy = rand(0.1, 0.3) * H, qx = (h0.x + fx) / 2, qy = h0.y - 70;
      return follow(rig, gen, 4200, function (u) {
        var e = Math.pow(u, 1.3), a = (1 - e) * (1 - e), b = 2 * e * (1 - e), c = e * e;
        at(a * h0.x + b * qx + c * fx + Math.sin(e * Math.PI * 5 + ph) * 9 * e,
           a * h0.y + b * qy + c * fy + Math.sin(e * Math.PI * 7 + ph) * 6 * e,
           Math.sin(e * Math.PI * 6 + ph) * 12 * e);
      });
    }).then(ok).then(function () {
      el.remove();
      t.classList.remove('sp-lull');
      return wait(1500);
    });
  }



  /* Thunder, made here: a crack of bright noise, a second on its heels, and
     a long rumble rolling under them that wavers as it dies away. On the
     radio's volume curve like everything else.

     Measured offline at volume 35, both channels, above 200 Hz (what small
     desk speakers actually play): its loudest 100ms about 11.5 dB over the
     helicopter's rotor, and over its four seconds about 5 dB over it. The
     first version rumbled below 160 Hz and was 5 dB under the rotor there --
     it played, and was not heard. */
  var THUNDER_PEAK = 2;   // measured: see the note above thunderSound
  function thunderSound() {
    var ac = sfx();
    if (!ac) return null;
    var now = ac.currentTime + 0.02;
    var bus = sfxBus(ac, THUNDER_PEAK, rand(-0.4, 0.4)), master = bus.master;
    function noisy(filterType, freq, q) {
      var src = ac.createBufferSource(); src.buffer = noiseOf(ac); src.loop = true;
      var f = ac.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; if (q) f.Q.value = q;
      var g = ac.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(master);
      src.start(now, rand(0, 1.5));
      bus.live.push(src);
      return g.gain;
    }
    // The crack, and its echo a moment after.
    var crack = noisy('highpass', 900);
    crack.setValueAtTime(0, now);
    crack.linearRampToValueAtTime(0.16, now + 0.006);
    crack.exponentialRampToValueAtTime(0.006, now + 0.22);
    crack.linearRampToValueAtTime(0.12, now + 0.226);
    crack.exponentialRampToValueAtTime(0.001, now + 0.75);
    // The body of it, low and rolling, uneven as it goes.
    var boom = noisy('lowpass', 300, 0.8);
    boom.setValueAtTime(0, now);
    boom.linearRampToValueAtTime(1, now + 0.12);
    var t = now + 0.12, v = 1;
    while (t < now + 3.4) {
      t += rand(0.18, 0.4);
      v *= rand(0.7, 0.95);
      boom.linearRampToValueAtTime(v * rand(0.55, 1), t);
    }
    boom.linearRampToValueAtTime(0, now + 3.8);
    var deep = noisy('lowpass', 70, 0.7);
    deep.setValueAtTime(0, now);
    deep.linearRampToValueAtTime(1.8, now + 0.25);
    deep.exponentialRampToValueAtTime(0.001, now + 3.6);
    setTimeout(function () { bus.stop(0.05); }, 4000);
    return bus;
  }
  /* One thin bolt down the sky, a double flash over the window, and a
     moment after, the thunder. */
  function strike(rig, ws) {
    var W = ws.W, H = ws.H, gen = rig.gen;
    var x = rand(0.55, 0.85) * W, y = 0, pts = [[x, y]], fork = null;
    for (var i = 1; i <= 9; i++) {
      x += rand(-14, 14); y = H * 0.6 * i / 9;
      pts.push([x, y]);
      if (i === 4) fork = [[x, y]];
    }
    var fx = fork[0][0], fy = fork[0][1];
    for (var j = 1; j <= 3; j++) { fx += rand(8, 18) * (Math.random() < 0.5 ? -1 : 1); fy += H * 0.05; fork.push([fx, fy]); }
    var line = function (p) { return p.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' '); };
    var bolt = drawn(ws, 'st-bolt', W, H,
      '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ' + W.toFixed(0) + ' ' + H.toFixed(0) + '" fill="none" stroke="#fdfdff" stroke-linejoin="round" stroke-linecap="round">' +
      '<polyline points="' + line(pts) + '" stroke-width="1.6"/><polyline points="' + line(fork) + '" stroke-width="1"/></svg>');
    var flash = drawn(ws, 'st-flash', W, H, '');
    var flick = [{ opacity: 0 }, { opacity: 1, offset: 0.03 }, { opacity: 0.15, offset: 0.1 }, { opacity: 0.95, offset: 0.15 },
      { opacity: 0.35, offset: 0.3 }, { opacity: 0.9, offset: 0.38 }, { opacity: 0.6, offset: 0.6 }, { opacity: 0 }];
    bolt.animate(flick, { duration: 1150, easing: 'linear', fill: 'forwards' }).finished.then(function () { bolt.remove(); }, function () {});
    flash.animate(flick, { duration: 1150, easing: 'linear', fill: 'forwards' }).finished.then(function () { flash.remove(); }, function () {});
    // Sound is slower than light.
    setTimeout(function () {
      if (rig.gen !== gen) return;
      if (rig.sound) rig.sound.stop(0.1);
      rig.sound = thunderSound();
    }, 700);
  }


  /* ------------------------------------------------------------------ */
  /* Halloween Fun: the broomstick breakdown.                             */
  /* ------------------------------------------------------------------ */

  // The witch's hat, crooked at the tip, its brim's middle at (15, 22).
  function hatSvg() {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 26" width="100%" height="100%" overflow="visible">' + hatParts() + '</svg>';
  }
  function hatParts() {
    return '<path d="M7 21Q12 10 15 2Q17-1 21 1Q18 4 18 9L23 21Z" fill="#2a1a3a"/>' +
      '<path d="M8.2 17.6L21.8 17.6L23 21L7 21Z" fill="#e8752a"/><rect x="13.6" y="17.8" width="2.8" height="3" fill="none" stroke="#f2c14e" stroke-width=".8"/>' +
      '<ellipse cx="15" cy="22" rx="14" ry="3" fill="#2a1a3a"/>';
  }
  /* The witch on her broom, flying to the right, the broom bobbing. The
     bristles (.bristles) are the broom's hood: they lift, hinged where
     they meet the handle. hat: whether she still has it. cling: hanging
     on for dear life, streamed out behind the handle, as it tears off.
     still: come down and sitting on the ground, not bobbing. look: which
     way her head is turned, 1 ahead (to the right, as drawn), 0 out at you,
     -1 back over her shoulder, and the values between the turning. */
  function witchFlySvg(hat, cling, still, look) {
    var h = look == null ? 1 : look, ah = Math.abs(h), n = function (v) { return +v.toFixed(2); };
    var bristles = '<g class="bristles"><path d="M-7 44L20 38.5L22.5 48.5L-5 57Z" fill="#d9a441" stroke="#a8782a" stroke-width=".7"/>' +
      '<path d="M-5 47.5L20.5 41.5M-5.5 51L21.2 44.2M-5 54L21.8 46.6" stroke="#a8782a" stroke-width=".5"/></g>';
    var handle = '<path d="M20 43L76 41" stroke="#8a5a2b" stroke-width="2.2" stroke-linecap="round"/>' +
      '<rect x="18" y="41.4" width="3.4" height="4.6" fill="#6a3fa0" transform="rotate(-18 19.7 43.7)"/>';
    /* Her cape: fastened at the neck with a clasp, spreading out behind her
       to a scalloped hem, black, lined in charcoal (dark enough to stay grey,
       light enough to be seen against the black), with a fold down it -- and
       rippling, the outline itself changing from one shape to the next
       (every frame has the same commands, so SMIL can morph between them)
       while the whole of it lifts and drops from the clasp. frames: the
       outlines, each [outer, lining, fold]; dur the ripple's period. */
    function cape(frames, dur, pivot, lift, size) {
      var loop = frames.concat([frames[0]]);
      var ks = loop.map(function (_, i) { return (i / (loop.length - 1)).toFixed(3); }).join(';');
      var sp = loop.slice(1).map(function () { return '.45 0 .55 1'; }).join(';');
      var morph = function (k) {
        return '<animate attributeName="d" values="' + loop.map(function (f) { return f[k]; }).join(';') + '" keyTimes="' + ks + '" calcMode="spline" keySplines="' + sp + '" dur="' + dur + 's" repeatCount="indefinite"/>';
      };
      // Scaled about the clasp, so a smaller cape still hangs from her neck.
      var p = pivot.split(' '), k = size || 1;
      return '<g transform="translate(' + p[0] + ' ' + p[1] + ') scale(' + k + ') translate(' + (-p[0]) + ' ' + (-p[1]) + ')"><g><animateTransform attributeName="transform" type="rotate" values="' + (-lift) + ' ' + pivot + ';' + lift + ' ' + pivot + ';' + (-lift) + ' ' + pivot + '" dur="' + (dur * 1.7).toFixed(2) + 's" calcMode="spline" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1" repeatCount="indefinite"/>' +
        '<path d="' + frames[0][0] + '" fill="#141416" stroke="#050506" stroke-width=".5">' + morph(0) + '</path>' +
        '<path d="' + frames[0][1] + '" fill="#4a4a52">' + morph(1) + '</path>' +
        '<path d="' + frames[0][2] + '" fill="none" stroke="#56565f" stroke-width=".8" stroke-linecap="round">' + morph(2) + '</path></g></g>';
    }
    // Riding: out behind her, rippling in the wind.
    var RIDE = [
      ['M41 25Q30 20 13 23Q9 27 11 30Q13 33 9 36Q14 38 17 37Q24 41 34 40Z', 'M34 40Q24 41 17 37Q14 38 9 36Q16 35.5 20 35.5Q27 37.5 34 37.5Z', 'M39 27Q28 26 15 29'],
      ['M41 25Q30 24 11 19Q6 24 9 27Q13 31 7 33Q12 37 16 35Q25 40 34 40Z', 'M34 40Q25 40 16 35Q12 37 7 33Q14 33.5 19 33.5Q27 37 34 37.5Z', 'M39 27Q27 27 13 25'],
      ['M41 25Q30 22 14 26Q9 30 12 33Q15 36 11 39Q15 40 18 38Q25 41 34 40Z', 'M34 40Q25 41 18 38Q15 40 11 39Q17 37.5 21 37Q27 38.5 34 37.5Z', 'M39 27Q28 28 16 32']
    ];
    // Landed: hanging down her back, stirring a little.
    var HANG = [
      ['M41 25Q34 26 31 33Q29 38 30 42Q32 44 34 42Q36 44 38 42Q37 36 41 25Z', 'M38 42Q36 44 34 42Q32 44 30 42Q32 40 34 40Q36 40.5 38 40Z', 'M38.5 28Q34 32 33.5 40'],
      ['M41 25Q33 27 29 34Q27 39 28 42Q31 44 33 42Q35 44 37 42Q36 36 41 25Z', 'M37 42Q35 44 33 42Q31 44 28 42Q31 40 33 40Q35 40.5 37 40Z', 'M38.5 28Q33 32 32.5 40'],
      ['M41 25Q34 26 31 33Q29 38 30 42Q32 44 34 42Q36 44 38 42Q37 36 41 25Z', 'M38 42Q36 44 34 42Q32 44 30 42Q32 40 34 40Q36 40.5 38 40Z', 'M38.5 28Q34 32 33.5 40']
    ];
    // Hanging on for dear life: streamed right out behind, snapping.
    var TEAR = [
      ['M51 30Q38 26 20 27Q13 29 14 32Q15 34 10 37Q16 39 20 37Q32 41 46 38Z', 'M46 38Q32 41 20 37Q16 39 10 37Q17 35.5 22 35.5Q33 38 46 36Z', 'M49 31Q36 30 18 32'],
      ['M51 30Q38 29 19 23Q12 26 13 29Q15 32 9 33Q15 37 20 35Q33 40 46 38Z', 'M46 38Q33 40 20 35Q15 37 9 33Q16 33.5 21 34Q33 37.5 46 36Z', 'M49 31Q36 31 17 28'],
      ['M51 30Q38 27 21 30Q14 33 15 36Q17 38 12 41Q17 42 21 39Q32 42 46 38Z', 'M46 38Q32 42 21 39Q17 42 12 41Q18 38.5 23 38.5Q33 39.5 46 36Z', 'M49 31Q36 31 19 35']
    ];
    /* Her hair, long: from under the hat down past her shoulders --
       streaming out behind her in flight, waving, and hanging down her back
       once she is down. Drawn as outlines that morph one into the next, like
       the cape; mx maps each x, so a turned head carries it round. */
    function hair(frames, dur, mx) {
      var map = function (d) { return mx ? d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, function (_, x, y) { return n(mx(+x)) + ' ' + y; }) : d; };
      var loop = frames.concat([frames[0]]).map(map);
      var ks = loop.map(function (_, i) { return (i / (loop.length - 1)).toFixed(3); }).join(';');
      var sp = loop.slice(1).map(function () { return '.45 0 .55 1'; }).join(';');
      return '<path d="' + loop[0] + '" fill="#5a2414" stroke="#3e180c" stroke-width=".4">' +
        '<animate attributeName="d" values="' + loop.join(';') + '" keyTimes="' + ks + '" calcMode="spline" keySplines="' + sp + '" dur="' + dur + 's" repeatCount="indefinite"/></path>';
    }
    var HAIR_FLY = [
      'M44 13Q36 12 34 16Q30 20 22 21Q14 22 9 27Q16 26 22 26Q28 26 33 24Q30 28 26 31Q33 29 37 25Z',
      'M44 13Q36 12 34 16Q29 19 21 19Q13 19 8 23Q15 23 21 24Q28 25 33 24Q30 27 25 29Q33 28 37 25Z',
      'M44 13Q36 12 34 16Q30 21 23 23Q15 25 10 31Q17 29 23 28Q29 27 33 24Q30 29 27 33Q34 30 37 25Z'
    ];
    var HAIR_DOWN = [
      'M44 13Q35 12 34 18Q33 26 30 35Q34 34 36 31Q37 35 39 37Q39 31 38 25Z',
      'M44 13Q35 12 34 18Q32 26 29 35Q33 34 35 31Q36 35 38 37Q38 31 38 25Z',
      'M44 13Q35 12 34 18Q33 26 30 35Q34 34 36 31Q37 35 39 37Q39 31 38 25Z'
    ];
    var HAIR_TEAR = [
      'M58 26Q51 23 49 27Q43 30 33 29Q24 28 17 31Q25 32 32 32Q41 33 49 32Z',
      'M58 26Q51 23 49 27Q43 29 33 27Q24 25 16 27Q24 29 32 30Q41 32 49 32Z',
      'M58 26Q51 23 49 27Q43 31 34 31Q25 31 18 35Q26 35 33 34Q41 34 49 32Z'
    ];
    var clasp = function (x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="1.3" fill="#f2c14e" stroke="#9a6a10" stroke-width=".4"/>'; };
    var rider;
    if (cling) {
      // Streamed out flat behind, both hands on the handle, legs kicking.
      rider = '<g><animateTransform attributeName="transform" type="rotate" values="-4 58 42;4 58 42;-4 58 42" dur=".18s" repeatCount="indefinite"/>' +
        cape(TEAR, 0.22, '51 30', 4, 0.78) +
        '<path d="M28 38L14 30M28 38L12 40" stroke="#e8752a" stroke-width="2.4"/><path d="M28 38L14 30M28 38L12 40" stroke="#1a1a1a" stroke-width="2.4" stroke-dasharray="1.4 1.4"/>' +
        '<path transform="translate(13.6 29.8) rotate(210)" d="M-1.6-1.6L2.2-1.8Q4.6-1.8 5.8-3.6Q6.2-.6 3.4 1.4L-1.6 1.6Z" fill="#141018"/><path transform="translate(11.6 40.2) rotate(175)" d="M-1.6-1.6L2.2-1.8Q4.6-1.8 5.8-3.6Q6.2-.6 3.4 1.4L-1.6 1.6Z" fill="#141018"/>' +
        '<path d="M28 33Q40 30 50 36Q40 42 28 42Z" fill="#6a3fa0"/>' + clasp(50.5, 30.5) +
        '<path d="M48 36L58 41M47 38L57 42" stroke="#6a3fa0" stroke-width="2.4" stroke-linecap="round"/><circle cx="58.5" cy="41" r="1.4" fill="#f6cfa8"/><circle cx="57.5" cy="42.6" r="1.4" fill="#f6cfa8"/>' +
        hair(HAIR_TEAR, 0.2) +
        '<circle cx="55" cy="31" r="6" fill="#f6cfa8"/>' +
        '<circle cx="57" cy="30" r="1.4" fill="#fff" stroke="#2a1a10" stroke-width=".4"/><circle cx="57.3" cy="30" r=".6" fill="#1a1a1a"/>' +
        '<ellipse cx="58" cy="34" rx=".9" ry="1.2" fill="#6a2a1a"/>' +
        '<path d="M49 27Q55 23.5 61 27L61 25.4Q55 21.4 49 25.4Z" fill="#5a2414"/></g>';
    } else {
      rider = (still ? cape(HANG, 1.6, '41 25', 1.5) : cape(RIDE, 0.42, '41 25', 5, 0.62)) +
        '<path d="M38 42L41 53M44 42L47 52" stroke="#e8752a" stroke-width="2.4"/><path d="M38 42L41 53M44 42L47 52" stroke="#1a1a1a" stroke-width="2.4" stroke-dasharray="1.4 1.4"/>' +
        '<path transform="translate(41 53.4) rotate(8)" d="M-1.6-1.6L2.2-1.8Q4.6-1.8 5.8-3.6Q6.2-.6 3.4 1.4L-1.6 1.6Z" fill="#141018"/><path transform="translate(47 52.4) rotate(8)" d="M-1.6-1.6L2.2-1.8Q4.6-1.8 5.8-3.6Q6.2-.6 3.4 1.4L-1.6 1.6Z" fill="#141018"/>' +
        '<path d="M32 42Q34 27 40 26Q46 27 48 42Z" fill="#6a3fa0"/>' + clasp(40.5, 25.8) +
        '<path d="M46 32L54 40" stroke="#6a3fa0" stroke-width="2.6" stroke-linecap="round"/><circle cx="54.5" cy="40.5" r="1.4" fill="#f6cfa8"/>' +
        // Her head, turned by h: hair swinging to the far side, eyes and nose coming round.
        (still ? hair(HAIR_DOWN, 2.4, function (x) { return 41 + (x - 41) * h; }) : hair(HAIR_FLY, 0.5, function (x) { return 41 + (x - 41) * h; })) +
        '<circle cx="41" cy="19" r="6" fill="#f6cfa8"/>' +
        [-1, 1].map(function (s) {
          var ex = n(41 + 2.6 * h + s * 2.2 * (1 - ah));
          return (ah > 0.85 && s !== (h < 0 ? -1 : 1)) ? '' : '<circle cx="' + ex + '" cy="18.6" r=".9" fill="#1a1a1a"/>';
        }).join('') +
        (ah > 0.3
          ? '<path d="M' + n(41 + 5.3 * h) + ' 18.4L' + n(41 + 7.4 * h) + ' 20L' + n(41 + 5 * h) + ' 20.6Z" fill="#eab58f"/>'
          : '<circle cx="' + n(41 + 3 * h) + '" cy="20" r=".8" fill="#eab58f"/>') +
        '<circle cx="' + n(41 + 2.8 * h) + '" cy="21.6" r="1" fill="#f29a9a" opacity=".6"/>' +
        '<path d="M' + n(35 + h) + ' 15Q' + n(41 + h) + ' 11.5 ' + n(47 + h) + ' 15L' + n(47 + h) + ' 13.4Q' + n(41 + h) + ' 9.4 ' + n(35 + h) + ' 13.4Z" fill="#5a2414"/>' +
        (hat ? '<g transform="translate(27 -7) rotate(' + n(-14 * h) + ' 15 22)">' + hatParts() + '</g>' : '');
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60" width="100%" height="100%" overflow="visible"><g>' +
      (still ? '' : '<animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur=".9s" repeatCount="indefinite"/>') +
      bristles + handle + rider + '</g></svg>';
  }
  /* A sheet ghost, front on, so it never has a side to turn to. look moves
     its eyes (-1 left to 1 right). Poses: 'float', 'hello' (both arms up,
     waving, wrench in hand -- here to help), 'wrench' (a wrench held
     up), 'tinker' (reaching in to the right, turning a bolt with it, eyes
     down on the work; its turning can be stopped and started, see
     tinkerHold), 'peer' (reaching in, still, having a look), 'whack'
     (swinging it), 'jump' (startled), 'proud' (hands on hips, pleased).
     hat: the witch's hat on its head. */
  function ghostSvg(pose, look, hat) {
    look = look || 0;
    var hem = function (p) {
      var d = 'M6 26L6 50', xs = [6, 13, 20, 27, 34, 41, 44];
      for (var i = 0; i < 5; i++) d += 'Q' + (xs[i] + 3.5) + ' ' + (p ? 54 : 52) + ' ' + xs[i + 1] + ' 50';
      return d + 'Q44 ' + (p ? 53 : 51) + ' 44 48L44 26C44 14 40 2 25 2C10 2 6 14 6 26Z';
    };
    // Arms in the sheet's own white, with no edge, so they read as part of it.
    var lobe = function (d) { return '<path d="' + d + '" fill="#f7f7fb"/>'; };
    // A proper wrench: a long handle and an open jaw, pointing along +x from the grip.
    var wrenchAt = function (x, y, a, turn) {
      return '<g transform="translate(' + x + ' ' + y + ') rotate(' + a + ')">' + (turn || '') +
        '<rect x="-2" y="-1.7" width="19" height="3.4" rx="1.5" fill="#a9afb7" stroke="#6e747c" stroke-width=".6"/>' +
        '<path d="M16-4.8Q25.5-7 26-2.2L21.4-1.7L21.4 1.7L26 2.2Q25.5 7 16 4.8Z" fill="#a9afb7" stroke="#6e747c" stroke-width=".6"/></g>';
    };
    var wrench = wrenchAt(45, 16, -70);
    var arms;
    if (pose === 'tinker' || pose === 'peer') {
      // Reaching in: the arm out to the right, the wrench into the works,
      // turning back and forth on a bolt, short and deliberate.
      /* Working it: four turns on a bolt, the wrench going up and down,
         then three quick jabs straight in along the wrench, poking at
         something -- round and round, 3.5s the lot, every move eased in and
         out and the hand-over from turning to poking as smooth as the rest.
         The two animations share their timing: each key is [time, angle,
         push along, push down]. */
      var turn = '', drive = '', reach = '';
      if (pose === 'tinker') {
        var keys = [], T = 3.5, HALF = 0.22;
        for (var q = 0; q <= 8; q++) keys.push([q * HALF, q % 2 ? 14 : -28, q % 2 ? 2 : 0, q % 2 ? 0.8 : 0]);
        var p0 = 8 * HALF + 0.26;
        keys.push([p0, -30, 0, 0]);   // tipped up into the engine, as the last jabs are
        [0, 1, 2].forEach(function (j) { var p = p0 + j * 0.42; keys.push([p + 0.18, -30, 6.2, -1], [p + 0.42, -30, 0, 0]); });
        keys.push([T, -28, 0, 0]);
        var kt = keys.map(function (k) { return (k[0] / T).toFixed(4); }).join(';');
        var ks = keys.slice(1).map(function () { return '.45 0 .55 1'; }).join(';');
        var anim = function (type, vals, extra) {
          return '<animateTransform class="g-turn" attributeName="transform" type="' + type + '"' + (extra || '') + ' values="' + vals + '" keyTimes="' + kt +
            '" calcMode="spline" keySplines="' + ks + '" dur="' + T + 's" repeatCount="indefinite"/>';
        };
        turn = anim('rotate', keys.map(function (k) { return k[1]; }).join(';'), ' additive="sum"');
        drive = anim('translate', keys.map(function (k) { return k[2] + ' ' + k[3]; }).join(';'));
        // The arm itself, reaching as far as the hand goes: its root stays at the shoulder.
        var armAt = function (a, d) { return 'M41 31Q' + (51 + a / 2) + ' ' + (30 + d / 2) + ' ' + (57 + a) + ' ' + (35 + d) + 'Q' + (51 + a / 2) + ' ' + (40 + d / 2) + ' 41 38Z'; };
        var reach = '<animate class="g-turn" attributeName="d" values="' + keys.map(function (k) { return armAt(k[2], k[3]); }).join(';') + '" keyTimes="' + kt +
          '" calcMode="spline" keySplines="' + ks + '" dur="' + T + 's" repeatCount="indefinite"/>';
      }
      arms = lobe('M8 32Q3 36 4.5 40Q8 38 9 35Z') + '<g class="g-wrench">' + drive + wrenchAt(55, 37, 20, turn) + '</g>' +
        (pose === 'tinker' ? '<path d="M41 31Q51 30 57 35Q51 40 41 38Z" fill="#f7f7fb">' + reach + '</path>' : lobe('M41 31Q51 30 57 35Q51 40 41 38Z'));
    } else if (pose === 'hello') {
      var wave = function (cx, a, b, d) {
        return '<animateTransform attributeName="transform" type="rotate" values="' + a + ' ' + cx + ' 29;' + b + ' ' + cx + ' 29;' + a + ' ' + cx + ' 29" dur="' + d + 's" calcMode="spline" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1" repeatCount="indefinite"/>';
      };
      arms = '<g>' + wave(9, 18, -16, 0.42) + lobe('M8 30Q1 20 4 11Q10 17 10.5 27Z') + '</g>' +
        '<g>' + wave(41, -18, 16, 0.42) + wrenchAt(46, 11, -80) + lobe('M42 30Q49 20 46 11Q40 17 39.5 27Z') + '</g>';
    } else if (pose === 'jump') {
      arms = lobe('M8 30Q1 20 4 11Q10 17 10.5 27Z') + lobe('M42 30Q49 20 46 11Q40 17 39.5 27Z') + wrenchAt(46, 11, -80);
    } else if (pose === 'wrench') {
      arms = lobe('M8 32Q3 36 4.5 40Q8 38 9 35Z') + wrench + lobe('M42 30Q49 22 47 14Q41 19 39.5 27Z');
    } else if (pose === 'whack') {
      arms = lobe('M8 32Q3 36 4.5 40Q8 38 9 35Z') +
        '<g><animateTransform attributeName="transform" type="rotate" values="-50 41 28;25 41 28;-50 41 28" dur=".26s" repeatCount="indefinite"/>' + wrench + lobe('M42 30Q49 22 47 14Q41 19 39.5 27Z') + '</g>';
    } else if (pose === 'proud') {
      arms = lobe('M8 30Q1 32 3 38Q7 37 9 34Z') + lobe('M42 30Q49 32 47 38Q43 37 41 34Z');
    } else {
      arms = lobe('M8 32Q3 36 4.5 40Q8 38 9 35Z') + lobe('M42 32Q47 36 45.5 40Q42 38 41 35Z');
    }
    if (pose === 'tinker' || pose === 'peer') look = 1.2;
    var eyeY = pose === 'tinker' || pose === 'peer' ? 22 : 20;
    var eyes = pose === 'jump'
      ? '<circle cx="19" cy="19" r="4" fill="#fff" stroke="#2a2a34" stroke-width="1"/><circle cx="31" cy="19" r="4" fill="#fff" stroke="#2a2a34" stroke-width="1"/><circle cx="19" cy="19" r="1" fill="#1a1a24"/><circle cx="31" cy="19" r="1" fill="#1a1a24"/>'
      : pose === 'proud'
      ? '<path d="M' + (16.6 + look * 2) + ' 20Q' + (19 + look * 2) + ' 17 ' + (21.4 + look * 2) + ' 20M' + (28.6 + look * 2) + ' 20Q' + (31 + look * 2) + ' 17 ' + (33.4 + look * 2) + ' 20" stroke="#2a2a34" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
      : '<ellipse class="g-eye" cx="' + (19 + look * 2) + '" cy="' + eyeY + '" rx="2.4" ry="3.4" fill="#2a2a34"/><ellipse class="g-eye" cx="' + (31 + look * 2) + '" cy="' + eyeY + '" rx="2.4" ry="3.4" fill="#2a2a34"/>';
    var mouth = pose === 'hello' ? '<path d="M20.5 27.5Q25 34 29.5 27.5Z" fill="#2a2a34"/>'
      : pose === 'proud' ? '<path d="M21 28Q25 32.5 29 28" stroke="#2a2a34" stroke-width="1.2" fill="none"/>'
      : '<path class="g-mouth" d="M22 29Q25 31 28 29" stroke="#2a2a34" stroke-width="1.1" fill="none" stroke-linecap="round"/>';
    // Brows, for concentrating: unseen until the scene brings them in.
    var brows = pose === 'tinker' || pose === 'peer'
      ? '<g class="g-brows" opacity="0" stroke="#2a2a34" stroke-width="1.3" stroke-linecap="round" fill="none"><path d="M18.4 15.8Q21 15.6 23.8 17.4"/><path d="M36.4 15.8Q33.8 15.6 31 17.4"/></g>'
      : '';
    var onHead = hat ? '<g class="g-hat" transform="translate(7.8 -20.3) scale(1.15) rotate(-8 15 22)">' + hatParts() + '</g>' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 56" width="100%" height="100%" overflow="visible"><g>' +
      '<animateTransform attributeName="transform" type="translate" values="0 0;0 -2.5;0 0" dur="1.6s" repeatCount="indefinite"/>' +
      '<path d="' + hem(0) + '" fill="#f7f7fb" stroke="#c9c9d6" stroke-width=".8"><animate attributeName="d" values="' + hem(0) + ';' + hem(1) + ';' + hem(0) + '" dur="1.1s" repeatCount="indefinite"/></path>' +
      arms + eyes + brows + mouth + onHead + '</g></svg>';
  }
  // A few sparks from metal on metal, flicking out and gone.
  function sparks(host, x, y) {
    for (var i = 0; i < 4; i++) (function () {
      var p = drawn(host, 'st-sparkle', 3, 3, ''), a = rand(-2.6, -0.4), d = rand(8, 18);
      p.animate([{ transform: tr(x, y), opacity: 1 }, { transform: tr(x + Math.cos(a) * d, y + Math.sin(a) * d + 4), opacity: 0 }],
        { duration: rand(220, 360), easing: 'ease-out', fill: 'forwards' }).finished.then(function () { p.remove(); }, function () {});
    })();
  }

  /* While the witch is about, the eyeball on the volume knob keeps its eye
     on her: its own looking-about is stopped (.hw-follow) and the iris set,
     each frame, as far as it will go towards wherever she is (--ex/--ey,
     read by the stylesheet). Returns what stops it. */
  function eyeOn(rig, target) {
    var knob = rig.tuner.querySelector('.fader.volume input'), live = true, gen = rig.gen;
    if (!knob) return function () {};
    rig.tuner.classList.add('hw-follow');
    (function step() {
      if (!live || rig.gen !== gen) return;
      var el = target();
      if (el && el.isConnected) {
        var k = knob.getBoundingClientRect(), e = el.getBoundingClientRect();
        var ts = rigThumb(knob, k);
        var dx = e.left + e.width / 2 - ts.x, dy = e.top + e.height / 2 - ts.y, n = Math.hypot(dx, dy) || 1;
        knob.style.setProperty('--ex', (dx / n * 5).toFixed(2) + 'px');
        knob.style.setProperty('--ey', (dy / n * 5).toFixed(2) + 'px');
      }
      requestAnimationFrame(step);
    })();
    return function () {
      live = false;
      rig.tuner.classList.remove('hw-follow');
      knob.style.removeProperty('--ex'); knob.style.removeProperty('--ey');
    };
  }
  // Where the thumb itself is on the slider (the track's ends less half a thumb), in page coordinates.
  function rigThumb(knob, k) {
    var min = Number(knob.min) || 0, max = Number(knob.max) || 100, u = (Number(knob.value) - min) / (max - min || 1), tw = 34;
    return { x: k.left + tw / 2 + u * (k.width - tw), y: k.top + k.height / 2 };
  }

  /* A small bat, wings beating, facing right: the one that is shut in the
     broom and comes out when the bristles are lifted.

     Named for its scene because the flock that crosses the strip has a
     batSvg of its own further down, and the two of them sharing a name is
     why this one never appeared -- the flock's declaration hoisted over
     it and took the call. */
  function broomBatSvg() {
    var wing = function (s) {
      return '<g><animateTransform attributeName="transform" type="rotate" values="' + (s * -35) + ' 14 8;' + (s * 30) + ' 14 8;' + (s * -35) + ' 14 8" dur=".16s" repeatCount="indefinite"/>' +
        '<path d="M14 8Q' + (14 + s * 6) + ' 1 ' + (14 + s * 13) + ' 3Q' + (14 + s * 10) + ' 6 ' + (14 + s * 11) + ' 9Q' + (14 + s * 7) + ' 7 ' + (14 + s * 6) + ' 10Q' + (14 + s * 3) + ' 8 14 10Z" fill="#1e1624"/></g>';
    };
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 16" width="100%" height="100%" overflow="visible">' + wing(-1) + wing(1) +
      '<ellipse cx="14" cy="9" rx="3" ry="4" fill="#2a1f30"/><path d="M12 6L12.4 3.6L13.4 5.6M16 6L15.6 3.6L14.6 5.6" fill="#2a1f30"/>' +
      '<circle cx="13" cy="7.6" r=".6" fill="#ffd23a"/><circle cx="15" cy="7.6" r=".6" fill="#ffd23a"/></svg>';
  }
  // A puff of dark exhaust smoke, blown out behind, swelling and hanging about as it thins.
  function smokeRing(host, x, y, big) {
    var s = big ? 2 : rand(1, 1.3), r = drawn(host, 'st-smokering', 26 * s, 20 * s, '');
    r.animate([{ transform: tr(x - 13 * s, y - 10 * s, ' scale(.35)'), opacity: 0.95 },
      { transform: tr(x - 13 * s - rand(18, 30) * s, y - 10 * s - rand(4, 10), ' scale(1.3)'), opacity: 0.75, offset: 0.35 },
      { transform: tr(x - 13 * s - rand(45, 80) * s, y - 10 * s - rand(18, 34), ' scale(2.3)'), opacity: 0 }],
      { duration: big ? 2600 : rand(1800, 2300), easing: 'ease-out', fill: 'forwards' }).finished.then(function () { r.remove(); }, function () {});
  }

  /* Its sounds, made here like the rest: the engine running and failing
     (sputter), a cough, a backfire, the landing's thud, the wrench's tick
     and clank, a bat's squeak, and the roar as it tears off.

     Levels are measured offline at volume 35 against the helicopter's rotor,
     above 200 Hz (what desk speakers play), by each one's loudest 100ms --
     never set by guess: the first guesses ran 10-11 dB loud, and a sputter
     and roar that measured fine went unheard under programme. Roughly, as
     they stand: the sputter and the thud 5-7 dB over the rotor, the roar and
     the engine about 10 over, the cough, clank and backfire about level with
     it, the squeak 5 and the tick 8 under. Re-measure after any change. */
  var BROOM_LEVELS = { cough: 0.45, bang: 0.25, clank: 0.061, squeak: 0.062, roar: 0.15, sputter: 1.6, tick: 0.04, engine: 0.125, thud: 0.3 };
  function broomSound() {
    var ac = sfx();
    if (!ac) return null;
    var bus = sfxBus(ac, 1), master = bus.master;
    function env(g, at, peak, rise, hold, fall) {
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(peak, at + rise);
      g.gain.setValueAtTime(peak, at + rise + hold);
      g.gain.exponentialRampToValueAtTime(0.0005, at + rise + hold + fall);
    }
    function noise(at, dur, type, f, q) {
      var src = ac.createBufferSource(); src.buffer = noiseOf(ac);
      var fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q;
      var g = ac.createGain(); src.connect(fl); fl.connect(g); g.connect(master);
      src.start(at, rand(0, 1.5)); src.stop(at + dur + 0.05); bus.live.push(src);
      g.__f = fl;
      return g;
    }
    function osc(type, f, at, dur) {
      var o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, at);
      o.start(at); o.stop(at + dur + 0.05); bus.live.push(o);
      return o;
    }
    return {
      stop: bus.stop,
      /* The engine failing, for secs seconds: a chug at a time, uneven,
         missing now and then, slowing down and thinning out to nothing. */
      sputter: function (secs) {
        if (bus.done) return;
        var at = ac.currentTime + 0.02, end = at + secs, gap = 0.1;
        while (at < end) {
          var u = 1 - (end - at) / secs;
          if (Math.random() > 0.18 + u * 0.3) {
            var g = noise(at, 0.07, 'bandpass', rand(380, 620), 1.4);
            env(g, at, BROOM_LEVELS.sputter * rand(0.6, 1) * (1 - u * 0.5), 0.003, 0.012, 0.05);
          }
          gap = 0.085 + u * 0.16 + rand(-0.02, 0.05);
          at += gap;
        }
      },
      // A small click of the wrench on a bolt.
      tick: function () {
        if (bus.done) return;
        var at = ac.currentTime + 0.01;
        [[1900, 1], [4300, 0.5]].forEach(function (p) {
          var o = osc('sine', p[0], at, 0.12), g = ac.createGain();
          env(g, at, BROOM_LEVELS.tick * p[1], 0.002, 0.004, 0.08);
          o.connect(g); g.connect(master);
        });
      },
      // Putt-putt: two quick muffled chugs.
      cough: function () {
        if (bus.done) return;
        var at = ac.currentTime + 0.01;
        [0, 0.11].forEach(function (d, i) { env(noise(at + d, 0.12, 'lowpass', 700), at + d, BROOM_LEVELS.cough * (i ? 0.7 : 1), 0.004, 0.02, 0.08); });
      },
      bang: function () {
        if (bus.done) return;
        var at = ac.currentTime + 0.01;
        env(noise(at, 0.4, 'lowpass', 2400), at, BROOM_LEVELS.bang, 0.002, 0.01, 0.3);
      },
      /* Her boots and the bristles meeting the ground. The first one was a
         sine falling from 110 Hz to 45: all of it below what desk speakers
         play, and not heard. Now a dull wooden knock (a low-mid band of
         noise and a short tone at 190 Hz) and the bristles scuffing, with
         the low thump still under them for bigger speakers. */
      thud: function () {
        if (bus.done) return;
        var at = ac.currentTime + 0.01, L = BROOM_LEVELS.thud;
        env(noise(at, 0.2, 'bandpass', 420, 1.2), at, L, 0.002, 0.01, 0.14);
        var o = osc('triangle', 190, at, 0.2), g = ac.createGain();
        o.frequency.exponentialRampToValueAtTime(120, at + 0.16);
        env(g, at, L * 0.6, 0.002, 0.01, 0.14);
        o.connect(g); g.connect(master);
        env(noise(at + 0.02, 0.2, 'highpass', 2500), at + 0.02, L * 0.25, 0.004, 0.03, 0.12);
        var lo = osc('sine', 110, at, 0.35), lg = ac.createGain();
        lo.frequency.exponentialRampToValueAtTime(45, at + 0.3);
        env(lg, at, BROOM_LEVELS.bang * 1.2, 0.003, 0.02, 0.28);
        lo.connect(lg); lg.connect(master);
      },
      clank: function () {
        if (bus.done) return;
        var at = ac.currentTime + 0.01;
        [[1180, 1], [2730, 0.6], [4150, 0.35]].forEach(function (p) {
          var o = osc('sine', p[0], at, 0.5), g = ac.createGain();
          env(g, at, BROOM_LEVELS.clank * p[1], 0.002, 0.005, 0.4);
          o.connect(g); g.connect(master);
        });
      },
      squeak: function () {
        if (bus.done) return;
        var at = ac.currentTime + 0.01;
        [0, 0.09, 0.2].forEach(function (d) {
          var o = osc('sine', rand(4200, 5200), at + d, 0.06), g = ac.createGain();
          o.frequency.exponentialRampToValueAtTime(rand(2800, 3400), at + d + 0.05);
          env(g, at + d, BROOM_LEVELS.squeak, 0.003, 0.01, 0.04);
          o.connect(g); g.connect(master);
        });
      },
      /* The engine running as she flies in, for secs seconds: a steady
         buzz with its whine, wavering a little, cut short at the end by
         the first misfire -- the sputter takes over from there. */
      engine: function (secs) {
        if (bus.done) return;
        var at = ac.currentTime + 0.01, g = ac.createGain();
        var trem = osc('sine', 26, at, secs), depth = ac.createGain(), am = ac.createGain();
        am.gain.value = 0.7; depth.gain.value = 0.3; trem.connect(depth); depth.connect(am.gain);
        [['sawtooth', 190, 'lowpass', 1600, 0, 1], ['square', 380, 'bandpass', 1100, 1, 0.45]].forEach(function (v) {
          var o = osc(v[0], v[1], at, secs), fl = ac.createBiquadFilter(), vg = ac.createGain();
          for (var k = at + 0.3; k < at + secs - 0.3; k += 0.3) o.frequency.linearRampToValueAtTime(v[1] * rand(0.94, 1.06), k);
          o.frequency.linearRampToValueAtTime(v[1] * 0.8, at + secs);
          fl.type = v[2]; fl.frequency.value = v[3]; if (v[4]) fl.Q.value = v[4]; vg.gain.value = v[5];
          o.connect(fl); fl.connect(vg); vg.connect(am);
        });
        am.connect(g); g.connect(master);
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(BROOM_LEVELS.engine, at + 0.4);
        g.gain.setValueAtTime(BROOM_LEVELS.engine, at + secs - 0.35);
        g.gain.linearRampToValueAtTime(0.0005, at + secs);
      },
      /* An engine revving up and away, for secs seconds: a buzzing low note
         with a brighter whine over it -- the buzz alone went unheard under
         programme, having no edge -- both climbing, rising and falling as it
         swoops about, and fading into the distance over the last second. */
      roar: function (secs) {
        if (bus.done) return;
        secs = Math.max(1.8, secs || 1.8);
        var at = ac.currentTime + 0.01, g = ac.createGain(), pitch = [];
        for (var k = at + 1.1; k < at + secs - 0.4; k += 0.45) pitch.push([k, rand(185, 265)]);
        var voice = function (type, mul, filt, f, q, lvl) {
          var o = osc(type, 70 * mul, at, secs), fl = ac.createBiquadFilter(), vg = ac.createGain();
          o.frequency.exponentialRampToValueAtTime(240 * mul, at + 0.7);
          pitch.forEach(function (p) { o.frequency.linearRampToValueAtTime(p[1] * mul, p[0]); });
          o.frequency.exponentialRampToValueAtTime(170 * mul, at + secs - 0.1);
          fl.type = filt; fl.frequency.value = f; if (q) fl.Q.value = q; vg.gain.value = lvl;
          o.connect(fl); fl.connect(vg);
          return vg;
        };
        var trem = osc('sine', 28, at, secs), depth = ac.createGain(), am = ac.createGain();
        am.gain.value = 0.7; depth.gain.value = 0.3; trem.connect(depth); depth.connect(am.gain);
        voice('sawtooth', 1, 'lowpass', 1600, 0, 1).connect(am);
        voice('square', 2, 'bandpass', 1100, 1, 0.45).connect(am);
        am.connect(g); g.connect(master);
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(BROOM_LEVELS.roar, at + 0.15);
        g.gain.setValueAtTime(BROOM_LEVELS.roar, at + secs - 1);
        g.gain.exponentialRampToValueAtTime(0.0005, at + secs);
      }
    };
  }

  /* The witch comes flying in and her broom starts to go wrong: it coughs
     out dark smoke, dips, backfires, and splutters its way down to the
     ground. A ghost rises up with a wrench and tinkers -- taps, peers,
     taps again -- then lifts the bristles, and a bat flies out. A whack or
     two, and the broom roars off with her hanging on behind it, her hat
     left in the air. The ghost catches it, puts it on and goes to admire
     itself in the lantern; is not so sure after all; drops it and floats
     away. And a moment later the raccoon runs in with its sack, has a look
     round, and goes off wearing the hat. */
  function broomRepair(rig) {
    var t = rig.tuner, ws = windowStage(rig), gen = rig.gen, ok = guard(rig, gen);
    var W = ws.W, H = ws.H, G = H - 4;
    var snd = rig.sound = broomSound();
    var say = function (k) { if (snd && rig.gen === gen) snd[k](); };
    var S = 1.5, fw = 80 * S, fh = 60 * S;
    var fly = drawn(ws, 'st-witch', fw, fh, witchFlySvg(true, false));
    var bristles = part(fly, '.bristles', '90% 30%');
    // Flying in high; coming down to sit on the foot of the glass.
    var y0 = H * 0.22, xa = W * 0.14, xs = W * 0.42 - fw / 2, ys = G - 53 * S;
    var GS = 1.1, gw = 50 * GS, gh = 56 * GS, ghost, hat, coon, smoking = null, stopEye = null;
    // The hat on the ghost's head is the witch's, drawn at the ghost's scale.
    var ghw = 30 * 1.15 * GS, ghh = 26 * 1.15 * GS;
    var hw = 30 * S, hh = 26 * S;
    var at = function (el, x, y, extra) { el.style.transform = tr(x, y, extra); };
    // The exhaust, from wherever the bristles are now.
    var exhaust = function (big) {
      // Stops itself if the scene is cut short.
      if (rig.gen !== gen || !fly.isConnected) { clearInterval(smoking); return; }
      var r = fly.getBoundingClientRect(), d = ws.getBoundingClientRect();
      smokeRing(ws, r.left - d.left + 6 * S, r.top - d.top + 46 * S, big);
    };
    fly.style.transform = tr(-fw - 20, y0);
    stopEye = eyeOn(rig, function () { return fly; });
    t.classList.add('hw-scene');       // the theme's own bats keep away meanwhile
    var facing = 1;
    function turnHead(to, ms) {
      var from = facing, steps = Math.max(2, Math.round(ms / 45)), list = [];
      for (var i = 1; i <= steps; i++) {
        var u = i / steps, e = u < 0.5 ? 2 * u * u : 1 - Math.pow(2 - 2 * u, 2) / 2;
        list.push([from + (to - from) * e, ms / steps]);
      }
      return frames(list, ok, function (f) {
        facing = f;
        fly.innerHTML = witchFlySvg(true, false, true, facing);
        bristles = part(fly, '.bristles', '90% 30%');
      });
    }

    // In she comes on a running engine, which gives out as the sputter starts.
    if (snd) snd.engine(1.8);
    return move(fly, [{ transform: tr(-fw - 20, y0) }, { transform: tr(xa, y0) }], { duration: 1600, easing: 'linear' }).then(ok).then(function () {
      /* The breakdown: slowing, a dip at each cough, a jolt at the backfire,
         and down, spluttering all the way, to a bump on the ground. Sounds
         and smoke are timed to it; smoke trails the whole way down. */
      var DUR = 6000, COUGHS = [0.08, 0.2, 0.32, 0.45, 0.58], BANG = 0.7, fr = [];
      for (var q = 0; q <= 60; q++) {
        var u = q / 60, e = 1 - Math.pow(1 - u, 1.8), dip = 0;
        COUGHS.forEach(function (c) { dip += 10 * Math.exp(-Math.pow((u - c) / 0.03, 2)); });
        dip -= 16 * Math.exp(-Math.pow((u - BANG) / 0.022, 2));
        // Sinking slowly at first, then gliding down the rest of the way.
        var sink = u < 0.55 ? 0.3 * (u / 0.55) : 0.3 + 0.7 * (1 - Math.pow(1 - (u - 0.55) / 0.45, 2));
        var bump = u > 0.94 ? -5 * Math.sin((u - 0.94) / 0.06 * Math.PI) : 0;
        fr.push({ transform: tr(xa + (xs - xa) * e, y0 + (ys - y0) * sink + dip * (1 - u) + bump) });
      }
      smoking = setInterval(function () { exhaust(false); }, 260);
      if (snd) snd.sputter(DUR / 1000);
      COUGHS.forEach(function (c) { setTimeout(function () { if (rig.gen !== gen) return; say('cough'); exhaust(true); }, c * DUR); });
      setTimeout(function () { if (rig.gen !== gen) return; say('bang'); exhaust(true); exhaust(true); }, BANG * DUR);
      // Down: the thump as her boots touch, where the landing's little bounce begins.
      setTimeout(function () { if (rig.gen === gen) say('thud'); }, 0.94 * DUR);
      return move(fly, fr, { duration: DUR, easing: 'linear' });
    }).then(ok).then(function () {
      // Down, and still; a last few wisps.
      fly.innerHTML = witchFlySvg(true, false, true);
      bristles = part(fly, '.bristles', '90% 30%');
      clearInterval(smoking);
      smoking = setInterval(function () { exhaust(false); }, 520);
      setTimeout(function () { clearInterval(smoking); }, 1600);
      return wait(1100);
    }).then(ok).then(function () {
      // Up comes a ghost, beside the bristles, waving both arms: here to help.
      ghost = drawn(ws, 'st-ghost', gw, gh, ghostSvg('hello', 0));
      ws.insertBefore(ghost, fly);
      var gx = xs + 6 * S - gw - 24, gy = G - gh + 2;
      at(ghost, gx, G + 12);
      ghost.gx = gx; ghost.gy = gy;
      return move(ghost, [{ transform: tr(gx, G + 12) }, { transform: tr(gx, gy) }], { duration: 1300, easing: 'ease-out' });
    }).then(ok).then(function () {
      // Hey -- over here -- a bounce or two with it; she turns to look.
      turnHead(-0.9, 600);
      return move(ghost, [{ transform: tr(ghost.gx, ghost.gy) }, { transform: tr(ghost.gx, ghost.gy - 7), offset: 0.2 }, { transform: tr(ghost.gx, ghost.gy), offset: 0.4 },
        { transform: tr(ghost.gx, ghost.gy - 5), offset: 0.6 }, { transform: tr(ghost.gx, ghost.gy), offset: 0.8 }, { transform: tr(ghost.gx, ghost.gy) }], { duration: 1600, easing: 'ease-in-out' });
    }).then(ok).then(function () {
      // To business: a look at it, wrench ready; she turns back; up with the hood.
      ghost.innerHTML = ghostSvg('wrench', 1);
      return Promise.all([turnHead(1, 540), wait(600)]);
    }).then(ok).then(function () {
      say('clank');
      return move(bristles, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(38deg)' }], { duration: 300, easing: 'ease-out' });
    }).then(ok).then(function () {
      /* It leans in and gets to work: the wrench going on a bolt under the
         hood, fast and steady, the ghost rocking into each turn, the hood
         jumping with it, a tick and now and then a spark -- and halfway, a
         real shove at something stuck. One pose throughout, the rhythm all
         in motion, so nothing jumps from frame to frame. */
      ghost.style.transformOrigin = '50% 100%';
      ghost.innerHTML = ghostSvg('tinker', 1);
      var drawnAt = performance.now();    // where the drawing's own cycle of turns and pokes starts
      var gx = ghost.gx, gy = ghost.gy;
      /* How far into a poke the wrench is, 0 to 1, at a moment in the
         drawing's 3.5s cycle: the jabs peak at 2.20, 2.62 and 3.04s (see
         'tinker' in ghostSvg). The body goes in with them. */
      function poking(c) {
        c = ((c % 3.5) + 3.5) % 3.5;
        var b = 0;
        [2.2, 2.62, 3.04].forEach(function (pk) { var x = Math.max(0, 1 - Math.abs(c - pk) / 0.21); b = Math.max(b, x * x * (3 - 2 * x)); });
        return b;
      }
      /* A spell of work: the ghost rocking into each turn, the hood
         jumping, ticks and sparks, a shove at something stuck near its
         middle when shove is set. Ends where it began, leaning in at 9. */
      var BEAT = 320;
      function work(T, shoveAt, cycle0) {
        var fr = [], n = Math.round(T / 40);
        for (var i = 0; i <= n; i++) {
          var u = i / n, osc = Math.sin(2 * Math.PI * u * T / 1750), shove = shoveAt ? Math.exp(-Math.pow((u - shoveAt) / 0.09, 2)) : 0;
          var jab = cycle0 == null ? 0 : poking(cycle0 + u * T / 1000) * 5;
          fr.push({ transform: tr(gx + 5 + 0.8 * osc * (1 - jab / 5) + 5 * shove + jab, gy + shove * 1.5 + jab * 0.35,
            ' rotate(' + (9 + 1.2 * osc * (1 - jab / 5) + 5 * shove + jab * 0.5).toFixed(2) + 'deg)') });
        }
        bristles.animate([{ transform: 'rotate(38deg)' }, { transform: 'rotate(34deg)', offset: 0.3 }, { transform: 'rotate(40deg)', offset: 0.65 }, { transform: 'rotate(38deg)' }],
          { duration: BEAT, iterations: Math.round(T / BEAT), easing: 'ease-in-out' });
        for (var ms = BEAT / 2; ms < T; ms += BEAT) (function (ms) {
          setTimeout(function () {
            if (rig.gen !== gen) return;
            say('tick');
            if (Math.random() < 0.4) sparks(ws, xs + rand(6, 16) * S, ys + rand(36, 44) * S);
          }, ms);
        })(ms);
        return move(ghost, fr, { duration: T, easing: 'linear' });
      }
      // The wrench's turning stopped and started in place: the ghost is never redrawn, so nothing jumps.
      function turning(on) {
        Array.prototype.forEach.call(ghost.querySelectorAll('.g-turn'), function (a) { try { if (on) a.beginElement(); else a.endElement(); } catch (e) {} });
      }
      /* The face, set in place. focus (0 to 1): trying to make something out
         -- the eyes narrowing, the brows coming down and in, the mouth
         pressed small and pulled to one side. 'wide': there it is -- eyes
         big, brows jumping up, mouth an O. Anything else: as it was. */
      function face(how, k) {
        var ey = ghost.querySelectorAll('.g-eye'), br = ghost.querySelector('.g-brows'), mo = ghost.querySelector('.g-mouth');
        var set = function (rx, ry, cy, bo, bt, md, arched) {
          Array.prototype.forEach.call(ey, function (e) { e.setAttribute('rx', rx); e.setAttribute('ry', ry); e.setAttribute('cy', cy); });
          if (br) {
            br.setAttribute('opacity', bo); br.setAttribute('transform', bt);
            var b = br.querySelectorAll('path');
            b[0].setAttribute('d', arched ? 'M18.6 15.4Q21 13 23.6 15' : 'M18.4 15.8Q21 15.6 23.8 17.4');
            b[1].setAttribute('d', arched ? 'M36.2 15.4Q33.8 13 31.2 15' : 'M36.4 15.8Q33.8 15.6 31 17.4');
          }
          if (mo) mo.setAttribute('d', md);
        };
        var L = function (a, b) { return +(a + (b - a) * k).toFixed(2); };
        if (how === 'focus') set(L(2.4, 2.6), L(3.4, 1.7), L(22, 22.5), L(0, 1), 'translate(0 ' + L(0, 1.4) + ')',
          k < 0.4 ? 'M22 29Q25 31 28 29' : 'M24 29.8Q26 29.2 28.4 29.4');
        else if (how === 'wide') set(2.9, 4.5, 22.4, 1, 'translate(0 -1.6)', 'M24.4 29.8Q26 26.8 27.6 29.8Q26 32.8 24.4 29.8', true);
        else set(2.4, 3.4, 22, 0, 'translate(0 0)', 'M22 29Q25 31 28 29');
      }
      // The face, by degrees, over ms.
      function focusIn(ms) {
        return new Promise(function (res) {
          var t0 = performance.now();
          (function step(now) {
            if (rig.gen !== gen) return res();
            var u = Math.min(1, (now - t0) / ms);
            face('focus', 1 - Math.pow(1 - u, 2));
            if (u < 1) requestAnimationFrame(step); else res();
          })(t0);
        });
      }
      return move(ghost, [{ transform: tr(gx, gy, ' rotate(0deg)') }, { transform: tr(gx + 5, gy, ' rotate(9deg)') }], { duration: 350, easing: 'ease-out' }).then(ok).then(function () {
        return work(2560, 0, (performance.now() - drawnAt) / 1000);
      }).then(ok).then(function () {
        /* Hold on -- what's that? It stops and leans right in under the
           hood, and tries to make it out: creeping closer, eyes narrowing,
           brows down, mouth screwed up, its head tipping as it peers --
           then its eyes go wide: there's something in there. */
        turning(false);
        return move(ghost, [{ transform: tr(gx + 5, gy, ' rotate(9deg)') }, { transform: tr(gx + 11, gy + 3, ' rotate(17deg)') }], { duration: 450, easing: 'ease-out' });
      }).then(ok).then(function () {
        // Closer, slowly, as it focuses; a tilt of the head to see better; a little closer still.
        return Promise.all([focusIn(900), move(ghost, [{ transform: tr(gx + 11, gy + 3, ' rotate(17deg)') }, { transform: tr(gx + 14, gy + 4, ' rotate(20deg)'), offset: 0.45 },
          { transform: tr(gx + 13, gy + 4, ' rotate(24deg)'), offset: 0.7 }, { transform: tr(gx + 15, gy + 5, ' rotate(22deg)') }], { duration: 1700, easing: 'ease-in-out' })]);
      }).then(ok).then(function () {
        // Eyes wide, with a start back.
        face('wide');
        return move(ghost, [{ transform: tr(gx + 15, gy + 5, ' rotate(22deg)') }, { transform: tr(gx + 8, gy + 1, ' rotate(12deg)'), offset: 0.25 },
          { transform: tr(gx + 9, gy + 2, ' rotate(14deg)') }], { duration: 900, easing: 'ease-out' });
      }).then(ok).then(function () {
        // Right. Back to it, harder.
        face();
        return move(ghost, [{ transform: tr(gx + 9, gy + 2, ' rotate(14deg)') }, { transform: tr(gx + 5, gy, ' rotate(9deg)') }], { duration: 300, easing: 'ease-in-out' });
      }).then(ok).then(function () {
        turning(true);
        return work(1100, 0.5);
      }).then(ok).then(function () {
        /* And then it pokes at it: the wrench stops turning and the ghost
           drives it straight in, again and again, the last one hardest --
           which is what shifts the bat. */
        turning(false);
        var wr = ghost.querySelector('.g-wrench'), t0 = performance.now();
        (function tip(now) {
          var u = Math.min(1, (now - t0) / 260), e = u * u * (3 - 2 * u);
          if (wr) wr.setAttribute('transform', 'rotate(' + (-30 * e).toFixed(1) + ' 55 37)');
          if (u < 1 && rig.gen === gen) requestAnimationFrame(tip);
        })(t0);
        var jabs = [5, 6, 5, 9], ms = 300, fr = [{ transform: tr(gx + 5, gy, ' rotate(9deg)'), offset: 0 }];
        jabs.forEach(function (d, i) {
          var t0 = i / jabs.length, t1 = (i + 0.4) / jabs.length, t2 = (i + 1) / jabs.length;
          fr.push({ transform: tr(gx + 5 + d, gy + d * 0.35, ' rotate(' + (9 + d * 0.5).toFixed(1) + 'deg)'), offset: t1, easing: 'ease-in-out' });
          fr.push({ transform: tr(gx + 5, gy, ' rotate(9deg)'), offset: t2, easing: 'ease-in-out' });
          setTimeout(function () { if (rig.gen !== gen) return; say(i === jabs.length - 1 ? 'clank' : 'tick'); if (Math.random() < 0.5) sparks(ws, xs + rand(8, 16) * S, ys + rand(38, 44) * S); }, (t1) * ms * jabs.length);
        });
        fr[0].easing = 'ease-in-out';
        return move(ghost, fr, { duration: ms * jabs.length });
      });
    }).then(ok).then(function () {
      // And out flies a bat -- and the ghost jumps back.
      ghost.innerHTML = ghostSvg('jump', 0);
      move(ghost, [{ transform: tr(ghost.gx + 5, ghost.gy, ' rotate(9deg)') }, { transform: tr(ghost.gx - 8, ghost.gy - 14, ' rotate(-8deg)'), offset: 0.4 }, { transform: tr(ghost.gx, ghost.gy, ' rotate(0deg)') }], { duration: 700, easing: 'ease-out' });
      // Up and away, right out through the top of the window, flitting as it goes.
      var bat = drawn(ws, 'st-bat', 28 * 1.4, 16 * 1.4, broomBatSvg()), bx = xs + 8 * S, by = ys + 40 * S, fr = [], rise = by + 16 * 1.4 + 40;
      for (var q = 0; q <= 24; q++) {
        var u = q / 24;
        fr.push({ transform: tr(bx + u * (W * 0.45) + Math.sin(u * 14) * 10, by - u * rise + Math.cos(u * 11) * 8 * (1 - u)) });
      }
      bat.style.transform = fr[0].transform;
      setTimeout(function () { say('squeak'); }, 150);
      bat.animate(fr, { duration: 2200, easing: 'ease-in', fill: 'forwards' }).finished.then(function () { bat.remove(); }, function () {});
      return wait(1500);
    }).then(ok).then(function () {
      // That was the trouble. A whack or two for luck; the hood down.
      ghost.innerHTML = ghostSvg('whack', 1);
      setTimeout(function () { say('clank'); }, 120);
      setTimeout(function () { say('clank'); }, 380);
      return wait(560);
    }).then(ok).then(function () {
      ghost.innerHTML = ghostSvg('float', 1);
      return move(bristles, [{ transform: 'rotate(38deg)' }, { transform: 'rotate(0deg)' }], { duration: 200, easing: 'ease-in' });
    }).then(ok).then(function () { return wait(400); }).then(ok).then(function () {
      /* And it roars off, up off the ground and away, the witch hanging on
         behind -- her hat left where her head was. */
      var ROAR = 5600;
      fly.innerHTML = witchFlySvg(false, true);
      hat = drawn(ws, 'st-hat', hw, hh, hatSvg());
      hat.style.transformOrigin = '50% 85%';
      var hx = xs + 42 * S - hw / 2, hy = ys + 14 * S - hh * 22 / 26;
      at(hat, hx, hy, ' rotate(-14deg)');
      exhaust(true); exhaust(true);
      /* Round the window it goes before it leaves: up off the ground, a
         loop-the-loop, a swoop down and up again, and away to the right --
         nose always along its path, so the loop is a roll right round, not
         a turn. Sampled at an even pace along the way. */
      var pts = [], P = function (x, y) { pts.push([x, y]); };
      var lx = xs + fw * 0.9, ly = ys - H * 0.2, R = Math.min(62, H * 0.2);
      for (var q = 0; q <= 12; q++) { var u = q / 12; P(xs + (lx - xs) * u, ys + (ly - ys) * (1 - Math.pow(1 - u, 2))); }
      for (var q = 1; q <= 30; q++) { var th = Math.PI / 2 - q / 30 * Math.PI * 2; P(lx + R * Math.cos(th), ly - R + R * Math.sin(th)); }
      var way = [[lx, ly], [W * 0.6, H * 0.6], [W * 0.78, H * 0.2], [W + fw, H * 0.3]];
      for (var w = 0; w < way.length - 1; w++) {
        var a0 = way[Math.max(0, w - 1)], a1 = way[w], a2 = way[w + 1], a3 = way[Math.min(way.length - 1, w + 2)];
        for (var q = 1; q <= 14; q++) {
          var u = q / 14, u2 = u * u, u3 = u2 * u;
          P(0.5 * (2 * a1[0] + (-a0[0] + a2[0]) * u + (2 * a0[0] - 5 * a1[0] + 4 * a2[0] - a3[0]) * u2 + (-a0[0] + 3 * a1[0] - 3 * a2[0] + a3[0]) * u3),
            0.5 * (2 * a1[1] + (-a0[1] + a2[1]) * u + (2 * a0[1] - 5 * a1[1] + 4 * a2[1] - a3[1]) * u2 + (-a0[1] + 3 * a1[1] - 3 * a2[1] + a3[1]) * u3));
        }
      }
      var len = [0];
      for (var i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      var L = len[len.length - 1], ang = 0, zf = [{ transform: tr(xs, ys, ' rotate(0deg)'), offset: 0 }, { transform: tr(xs - 8, ys + 2, ' rotate(0deg)'), offset: 0.04 }];
      for (var i = 1; i < pts.length; i++) {
        var raw = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) * 180 / Math.PI;
        while (raw - ang > 180) raw -= 360;
        while (raw - ang < -180) raw += 360;
        ang = raw;
        zf.push({ transform: tr(pts[i][0], pts[i][1], ' rotate(' + ang.toFixed(1) + 'deg)'), offset: +(0.04 + 0.96 * len[i] / L).toFixed(4) });
      }
      fly.style.transformOrigin = '60% 70%';
      if (snd && rig.gen === gen) snd.roar(ROAR / 1000);
      move(fly, zf, { duration: ROAR, easing: 'linear' }).then(function () { fly.remove(); if (stopEye) stopEye(); }, function () {});
      // The hat drifts down, turning, and the ghost gets under it.
      var cx = ghost.gx + gw / 2 - hw / 2, cy = ghost.gy + 5 * GS - hh * 22 / 26, fr = [], kEnd = ghw / hw;
      hat.style.transformOrigin = '50% 85%';
      for (var q = 0; q <= 20; q++) {
        var u = q / 20;
        fr.push({ transform: tr(hx + (cx - hx) * u + Math.sin(u * 9) * 10 * (1 - u), hy + (cy - hy) * u - 30 * Math.sin(u * Math.PI) * 0.6,
          ' rotate(' + (-14 + Math.sin(u * 8) * 26 * (1 - u) - 8 * u).toFixed(1) + 'deg) scale(' + (1 + (kEnd - 1) * u).toFixed(3) + ')') });
      }
      ghost.innerHTML = ghostSvg('float', 0);
      return move(hat, fr, { duration: 1700, easing: 'ease-in-out' });
    }).then(ok).then(function () {
      // On it goes.
      hat.remove();
      ghost.innerHTML = ghostSvg('float', 0, true);
      return wait(700);
    }).then(ok).then(function () {
      // Off to the lantern, to have a look at itself.
      var m = boxIn(rig, '.meter'), d = boxIn(rig, '.display');
      var px = m.x - d.x, py = m.y - d.y;
      var tx = px - gw * 0.55, ty = py + m.h * 0.42 - gh / 2;
      ghost.innerHTML = ghostSvg('float', 1, true);
      ghost.tx = tx; ghost.ty = ty;
      return move(ghost, [{ transform: tr(ghost.gx, ghost.gy) }, { transform: tr(tx, ty) }], { duration: 2400, easing: 'ease-in-out' });
    }).then(ok).then(function () {
      // Rather pleased -- turning this way and that.
      ghost.innerHTML = ghostSvg('proud', 1, true);
      ghost.style.transformOrigin = '50% 100%';
      return move(ghost, [
        { transform: tr(ghost.tx, ghost.ty, ' rotate(0deg)') }, { transform: tr(ghost.tx, ghost.ty, ' rotate(-9deg)'), offset: 0.25 },
        { transform: tr(ghost.tx, ghost.ty, ' rotate(8deg)'), offset: 0.6 }, { transform: tr(ghost.tx, ghost.ty, ' rotate(0deg)') }
      ], { duration: 2000, easing: 'ease-in-out' });
    }).then(ok).then(function () { return wait(500); }).then(ok).then(function () {
      /* And away it goes, drifting up out of the lantern's light and fading
         as it goes -- hat and all, until there is too little of it left to
         hold a hat up: then the hat drops through it and tumbles to the
         ground. The ghost's drawing is never replaced (that restarts its
         bob, a jump): its hat is hidden, and a loose one put exactly where
         that one was drawn, at that moment. */
      var FADE = 2600;
      var fade = ghost.animate([{ opacity: 1 }, { opacity: 1, offset: 0.12 }, { opacity: 0 }], { duration: FADE, easing: 'ease-in-out', fill: 'forwards' });
      var worn = ghost.querySelector('.g-hat');
      worn.style.transition = 'none';
      var gone = move(ghost, [{ transform: tr(ghost.tx, ghost.ty, ' rotate(0deg)') }, { transform: tr(ghost.tx + 8, ghost.ty - 18, ' rotate(4deg)'), offset: 0.3 },
        { transform: tr(ghost.tx + 40, -gh, ' rotate(-3deg)') }], { duration: FADE, easing: 'ease-in-out' });
      var drop = wait(FADE * 0.42).then(ok).then(function () {
        var wr = worn.getBoundingClientRect(), d = ws.getBoundingClientRect();
        var hx = wr.left - d.left + wr.width / 2 - ghw / 2, hy = wr.top - d.top + wr.height / 2 - ghh / 2;
        worn.style.display = 'none';
        hat = drawn(ws, 'st-hat', ghw, ghh, hatSvg());
        hat.style.transformOrigin = '50% 85%';
        hat.lx = hx - 30; hat.ly = G - ghh;
        at(hat, hx, hy, ' rotate(-4deg)');
        return move(hat, [{ transform: tr(hx, hy, ' rotate(-4deg)') }, { transform: tr(hx - 6, hy + 10, ' rotate(-16deg)'), offset: 0.18 },
          { transform: tr(hat.lx, hat.ly, ' rotate(-8deg)'), offset: 0.84 }, { transform: tr(hat.lx, hat.ly - 5, ' rotate(4deg)'), offset: 0.92 },
          { transform: tr(hat.lx, hat.ly, ' rotate(0deg)') }], { duration: 1500, easing: 'ease-in' });
      });
      return Promise.all([gone, drop, fade.finished]);
    }).then(ok).then(function () {
      ghost.remove();
      return wait(1100);
    }).then(ok).then(function () {
      // A moment later: the raccoon, with its sack, running in.
      var rw = 70 * 1.1, rh = 56 * 1.1, ry = G - rh * 52 / 56 - 2, stopX = hat.lx + ghw / 2 - rw * 0.73;
      coon = drawn(ws, 'st-coon', rw, rh, raccoonSvg('run'));
      coon.rw = rw; coon.ry = ry; coon.sx = stopX;
      at(coon, -rw - 20, ry);
      return move(coon, [{ transform: tr(-rw - 20, ry) }, { transform: tr(stopX, ry) }], { duration: (stopX + rw + 20) / 300 * 1000, easing: 'ease-out' });
    }).then(ok).then(function () {
      // A look round -- nobody about -- the head turning, both ways.
      return frames([[0.8, 45], [1, 350], [0.6, 45], [0.2, 45], [-0.2, 45], [-0.6, 45], [-1, 350], [-0.6, 45], [-0.2, 45], [0.2, 45], [0.55, 45]],
        ok, function (h) { redrawCoon(coon, raccoonSvg('look', h)); });
    }).then(ok).then(function () {
      /* The hat comes up off the ground and onto its head.

         This used to be a cut: the hat gone from the floor and already
         worn in the same frame, which reads as a glitch rather than as a
         theft. The theft is the joke, so it is worth the second it takes.

         The lift ends on exactly the transform the worn hat will have, so
         the swap afterwards cannot be seen -- same place, same size, same
         angle. Three things have to agree for that. The scale, because
         the hat is drawn at ghw on the ground and worn at wornW. The
         rotation. And the origin, which is the awkward one: this hat has
         been turning about 50% 85% since it fell, and the worn one turns
         about its middle, so left alone the two would land a few pixels
         out. It is moved to the middle here, which costs nothing because
         the hat is sitting at rotate(0) and has nothing to jump. */
      var k = 1.1, wornW = 30 * k * 0.9;
      var sc = wornW / ghw;
      var headX = coon.sx + 51 * 1.1 - wornW / 2, headY = coon.ry + 17 * 1.1 - 22 * k * 0.9;
      /* A box scales about its origin, so the translate that puts the
         top-left where the worn hat's will be has to give back what the
         shrink takes off either side of the middle. */
      var endX = headX - ghw / 2 * (1 - sc), endY = headY - ghh / 2 * (1 - sc);
      hat.style.transformOrigin = '50% 50%';

      /* Up in an arc and not in a straight line: a hat swung onto a head
         goes through the air above both of them. The little dip at the
         start is it taking hold before it lifts.

         And it turns over on the way. The hat is drawn leaning right --
         the cone runs from (15,2) out to (21,1) -- so worn as drawn, its
         point trails the raccoon, which is walking right. Mirrored, the
         point leads.

         The turn is in the x scale rather than a separate rotation,
         which is what makes it read as a hat being turned round in the
         air rather than a picture being swapped: x runs from 1 down
         through nothing at all, where the hat is edge-on and invisible
         for an instant, and out the other side to -sc. y never changes
         sign, so only the width moves. The flip is its own keyframe
         because interpolating straight from 1 to -sc would cross zero
         wherever the arithmetic happened to put it, which was on the way
         back down. */
      var LIFT = 660;
      var midX = (hat.lx + endX) / 2, midY = Math.min(hat.ly, endY) - 20;
      var mid = (1 + sc) / 2;
      /* Edge-on partway up, and the y scale wherever the arc has got to
         by then -- offset .42 of a span that starts at .16. */
      var edgeY = 1 + (sc - 1) * ((0.42 - 0.16) / (1 - 0.16));
      var lift = move(hat, [
        { transform: tr(hat.lx, hat.ly, ' rotate(0deg) scale(1, 1)') },
        { transform: tr(hat.lx - 4, hat.ly - 2, ' rotate(-6deg) scale(1, 1)'), offset: 0.16 },
        { transform: tr(hat.lx + (midX - hat.lx) * 0.55, hat.ly + (midY - hat.ly) * 0.72,
          ' rotate(-11deg) scale(0.02, ' + edgeY.toFixed(3) + ')'), offset: 0.42 },
        { transform: tr(midX, midY, ' rotate(-14deg) scale(' + (-mid).toFixed(3) + ', ' + mid.toFixed(3) + ')'), offset: 0.58 },
        { transform: tr(endX, endY, ' rotate(8deg) scale(' + (-sc).toFixed(3) + ', ' + sc.toFixed(3) + ')') }
      ], { duration: LIFT, easing: 'ease-in-out' });

      // The raccoon under it: a dip as it takes hold, and up again.
      var dip = move(coon, [
        { transform: tr(coon.sx, coon.ry) },
        { transform: tr(coon.sx, coon.ry + 3), offset: 0.18 },
        { transform: tr(coon.sx, coon.ry + 1), offset: 0.55 },
        { transform: tr(coon.sx, coon.ry) }
      ], { duration: LIFT, easing: 'ease-in-out' });

      /* Its head follows the hat: down to the brim, up with it, and level
         by the time it lands. The same 660ms, spread over the turns. */
      var watch = frames([[0.15, 120], [0, 120], [-0.15, 160], [0.1, 160], [0.55, 100]],
        ok, function (h) { redrawCoon(coon, raccoonSvg('look', h)); });

      return Promise.all([lift, dip, watch]);
    }).then(ok).then(function () {
      /* The swap, and away. The worn hat goes on at the transform the
         lift just ended on, so nothing moves in this frame -- the mirror
         included, or the point would face left all the way up and then
         snap back to the right as it landed. scaleX comes last in the
         list and so applies first, the same order the lift ends on, which
         is what keeps the 8 degrees leaning the same way. */
      var k = 1.1, onHead = document.createElement('div');
      onHead.style.cssText = 'position:absolute;left:0;top:0;width:' + (30 * k * 0.9) + 'px;height:' + (26 * k * 0.9) + 'px;transform:translate(' +
        (51 * 1.1 - 15 * k * 0.9) + 'px,' + (17 * 1.1 - 22 * k * 0.9) + 'px) rotate(8deg) scaleX(-1)';
      onHead.innerHTML = hatSvg();
      coon.appendChild(onHead);
      hat.remove();
      redrawCoon(coon, raccoonSvg('run'));
      return move(coon, [{ transform: tr(coon.sx, coon.ry) }, { transform: tr(W + 30, coon.ry) }], { duration: (W + 30 - coon.sx) / 320 * 1000, easing: 'ease-in' });
    }).then(function () {
      if (stopEye) stopEye();
      t.classList.remove('hw-scene');
      if (smoking) clearInterval(smoking);
      [fly, ghost, hat, coon].forEach(function (el) { if (el && el.isConnected) el.remove(); });
      if (snd) { snd.stop(0.3); if (rig.sound === snd) rig.sound = null; }
    });
  }

  /* ---- April's big scene: the ark ---- */

  /* The ark, facing right: a house on deck with three windows, two
     giraffes behind it (.a-gir, which put their heads up), eyes in the
     first window (.a-eyes) and an elephant at the last (.a-ele). */
  function arkSvg() {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 110" width="100%" height="100%" overflow="visible">' +
      '<g class="a-gir">' +
        '<path d="M104 42L106 2M116 42L119 6" stroke="#e6b34a" stroke-width="5" stroke-linecap="round"/>' +
        '<g fill="#b5782a"><circle cx="105" cy="12" r="1.3"/><circle cx="104.6" cy="24" r="1.3"/><circle cx="118.3" cy="16" r="1.3"/><circle cx="117.6" cy="28" r="1.3"/></g>' +
        '<ellipse cx="110" cy="0" rx="6" ry="3.4" fill="#e6b34a"/><ellipse cx="123" cy="4" rx="6" ry="3.4" fill="#e6b34a"/>' +
        '<path d="M106.5-3L105.5-7.5M109.5-3.2L109.5-7.8M119.5 1L118.5-3.5M122.5.8L122.5-3.8" stroke="#8a5a1e" stroke-width="1.2" stroke-linecap="round"/>' +
        '<circle cx="112" cy="-.8" r=".8" fill="#1a1a1a"/><circle cx="125" cy="3.2" r=".8" fill="#1a1a1a"/>' +
      '</g>' +
      '<rect x="40" y="28" width="80" height="31" fill="#b07a3e" stroke="#5a3418" stroke-width="1.2"/>' +
      '<path d="M44 34H116M44 42H116M44 50H116" stroke="#8e5e2c" stroke-width=".7"/>' +
      '<path d="M33 31L80 8L127 31Z" fill="#7a4a22" stroke="#5a3418" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<g fill="#2a1a10"><rect x="50" y="37" width="13" height="12" rx="2"/><rect x="73.5" y="37" width="13" height="12" rx="2"/><rect x="97" y="37" width="13" height="12" rx="2"/></g>' +
      '<g class="a-eyes"><circle cx="53.5" cy="41.5" r="1.5" fill="#fff"/><circle cx="57.5" cy="41.5" r="1.5" fill="#fff"/>' +
        '<circle cx="57.6" cy="46" r="1.2" fill="#fff"/><circle cx="60.6" cy="46" r="1.2" fill="#fff"/>' +
        '<g class="a-pupils"><circle cx="53.8" cy="41.7" r=".7" fill="#1a1a1a"/><circle cx="57.8" cy="41.7" r=".7" fill="#1a1a1a"/>' +
        '<circle cx="57.8" cy="46.1" r=".55" fill="#1a1a1a"/><circle cx="60.8" cy="46.1" r=".55" fill="#1a1a1a"/></g></g>' +
      '<g class="a-ele"><circle cx="103.5" cy="44" r="5" fill="#9a9aa2"/>' +
        '<g><animateTransform attributeName="transform" type="rotate" values="0 101.5 40;-12 101.5 40;0 101.5 40" dur="2.4s" repeatCount="indefinite"/>' +
        '<path d="M101.5 39.5Q96 38.5 95.8 44Q96 49.5 100.6 49Q103 48.2 102.6 44Z" fill="#8a8a92" stroke="#6c6c74" stroke-width=".6"/>' +
        '<path d="M100.8 41.5Q97.6 41.6 97.6 44.4Q97.8 47.4 100.4 47" fill="none" stroke="#b39aa4" stroke-width=".8"/></g>' +
        '<circle cx="105.8" cy="42.3" r=".8" fill="#1a1a1a"/>' +
        '<g><animateTransform attributeName="transform" type="rotate" values="-8 107 46;10 107 46;-8 107 46" dur="1.6s" repeatCount="indefinite"/>' +
        '<path d="M106 46Q114 52 117 45Q118 41 115 42" stroke="#9a9aa2" stroke-width="3.4" fill="none" stroke-linecap="round"/></g></g>' +
      '<rect x="2" y="57" width="156" height="7" rx="2" fill="#6e4420" stroke="#4a2a10" stroke-width="1"/>' +
      '<path d="M6 63H154Q150 92 124 99H36Q10 92 6 63Z" fill="#8a5a2b" stroke="#5a3418" stroke-width="1.4"/>' +
      '<path d="M9 73H151M15 83H145M26 92H134" stroke="#6e4420" stroke-width="1"/>' +
      '<g fill="#5a3418"><circle cx="30" cy="68" r="1"/><circle cx="60" cy="68" r="1"/><circle cx="100" cy="68" r="1"/><circle cx="130" cy="68" r="1"/></g>' +
    '</svg>';
  }
  // A white dove, facing right, flying or perched, with or without its sprig.
  function doveSvg(sprig, perched) {
    var wing = perched
      ? '<path d="M11 15Q19 11 26 15Q20 20 11 18Z" fill="#eef1f4" stroke="#cfd3d8" stroke-width=".7"/>'
      : '<g><animateTransform attributeName="transform" type="rotate" values="-35 18 15;30 18 15;-35 18 15" dur=".3s" repeatCount="indefinite"/>' +
        '<path d="M18 15Q11 2 3 3Q10 11 17 17Z" fill="#eef1f4" stroke="#cfd3d8" stroke-width=".7"/></g>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 30" width="100%" height="100%" overflow="visible">' +
      (perched ? '<path d="M16 22.5V26M20 22.5V26" stroke="#e8a040" stroke-width="1.2" stroke-linecap="round"/>' : '') +
      '<path d="M9 16L1 13L2 19.5L9 19Z" fill="#fff" stroke="#cfd3d8" stroke-width=".7" stroke-linejoin="round"/>' +
      '<ellipse cx="18" cy="17" rx="10" ry="6" fill="#fff" stroke="#cfd3d8" stroke-width=".7"/>' + wing +
      '<circle cx="28" cy="12" r="4.5" fill="#fff" stroke="#cfd3d8" stroke-width=".7"/>' +
      '<path d="M32 11.5L36 13L32 14Z" fill="#e8a040"/><circle cx="29.5" cy="11" r=".8" fill="#1a1a1a"/>' +
      (sprig ? '<path d="M34 13.2Q38 16 42 14" stroke="#5a7a3a" stroke-width=".9" fill="none"/>' +
        '<ellipse cx="38.5" cy="15.6" rx="2" ry="1" fill="#4f9a5a" transform="rotate(20 38.5 15.6)"/>' +
        '<ellipse cx="41" cy="13.4" rx="2" ry="1" fill="#4f9a5a" transform="rotate(-25 41 13.4)"/>' : '') +
    '</svg>';
  }
  // A fish, facing left, its tail going.
  function fishSvg(body, fin) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 16" width="100%" height="100%" overflow="visible">' +
      '<g>' +
      '<g transform="translate(20.5 8)"><g><animateTransform attributeName="transform" type="scale" values="1 1;.2 1;1 1" dur=".36s" calcMode="spline" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1" repeatCount="indefinite"/>' +
      '<path d="M0 0L9.5-6.5Q7.5 0 9.5 6.5Z" fill="' + fin + '"/></g></g>' +
      '<ellipse cx="12" cy="8" rx="10.5" ry="5.6" fill="' + body + '"/>' +
      '<path d="M10 3Q14 0 17 3" fill="' + fin + '"/>' +
      '<path d="M15 4Q12.5 8 15 12" stroke="' + fin + '" stroke-width=".8" fill="none"/>' +
      '<circle cx="5.6" cy="6.6" r="1.4" fill="#fff"/><circle cx="5.2" cy="6.6" r=".7" fill="#1a1a1a"/></g></svg>';
  }
  var FISH = [['#f28c38', '#d0621c'], ['#f2c14e', '#c9972a'], ['#6fb3d9', '#3f86b3'], ['#e0527a', '#b0335a']];
  /* A few fish swim through the flood, right to left, each at its own depth
     and pace. In front of the water, which washed them out entirely, and
     let half into it by the stylesheet. Not waited for: they come and go
     while the rest goes on. */
  function fishes(ws, flood, surf, H) {
    for (var i = 0; i < 4; i++) (function (i) {
      var s = rand(1.25, 1.75), fw = 30 * s, fh = 16 * s, c = FISH[i % FISH.length];
      var el = document.createElement('div');
      el.className = 'st-fish';
      el.style.width = fw + 'px'; el.style.height = fh + 'px';
      el.innerHTML = fishSvg(c[0], c[1]);
      ws.appendChild(el);
      var y = rand(surf + 18, H - 26), ph = rand(0, 6.28), fr = [];
      for (var q = 0; q <= 20; q++) {
        var u = q / 20;
        fr.push({ transform: tr(ws.W + 20 - (ws.W + 60 + fw) * u, y + Math.sin(u * Math.PI * 4 + ph) * 5) });
      }
      el.style.transform = fr[0].transform;
      el.animate(fr, { duration: rand(7000, 10500), delay: i * rand(900, 1600), easing: 'linear', fill: 'both' })
        .finished.then(function () { el.remove(); }, function () {});
    })(i);
  }
  /* The eyes in the window blinking, a few times over, to be noticed. */
  function blinks(eyes) {
    var f = [[0, 1], [0.08, 1], [0.12, 0.1], [0.16, 1], [0.36, 1], [0.4, 0.1], [0.44, 1], [0.6, 1], [0.63, 0.1], [0.66, 1], [0.7, 0.1], [0.74, 1], [1, 1]];
    eyes.animate(f.map(function (k) { return { transform: 'scaleY(' + k[1] + ')', offset: k[0] }; }), { duration: 2400 });
  }

  // Along a curve, from p0 bending toward c to p1, sampled so the speed is the easing's alone.
  function curve(el, p0, c, p1, ms, ease, w, h) {
    var fr = [];
    for (var q = 0; q <= 30; q++) {
      var u = ease(q / 30), a = (1 - u) * (1 - u), b = 2 * u * (1 - u), d = u * u;
      fr.push({ transform: tr(a * p0[0] + b * c[0] + d * p1[0] - w / 2, a * p0[1] + b * c[1] + d * p1[1] - h / 2) });
    }
    return move(el, fr, { duration: ms, easing: 'linear' });
  }

  /* It pours; the water comes up over the bed; the ark comes sailing in,
     giraffes and an elephant putting their heads out, two ducks on the
     rail. A dove goes out, comes back round the sky with a sprig and
     settles on the roof, and the rain stops. The ark sails on, the water
     goes down into the puddle, the tulips come up again -- and the last
     pair, late, run after it: the raccoons, one still with its sack. */
  function ark(rig) {
    var t = rig.tuner, ws = windowStage(rig), gen = rig.gen, ok = guard(rig, gen);
    var W = ws.W, H = ws.H, S = 1.4, aw = 160 * S, ah = 110 * S;
    var surf = H - 104;                  // the flood's top, over the tulips
    var ay = surf - ah * 80 / 110;       // its waterline, 80 of the hull's 110 down
    var parkX = W * 0.42 - aw / 2;
    t.classList.add('sp-pour');

    // The ark first, then the water, so the flood lies over the hull.
    var arkEl = drawn(ws, 'st-ark', aw, ah, '');
    var bob = document.createElement('div');
    bob.className = 'st-arkbob';
    bob.innerHTML = arkSvg();
    arkEl.appendChild(bob);
    var dw = 40 * 0.42 * S, dh = 36 * 0.42 * S;
    for (var k = 0; k < 2; k++) {
      var d = document.createElement('div');
      d.style.width = dw + 'px'; d.style.height = dh + 'px';
      d.innerHTML = duckSvg('stand', 1, k === 1);
      d.style.transform = tr((12 + 15 * k) * S, 57 * S - dh * 35 / 36);
      bob.appendChild(d);
    }
    arkEl.style.transform = tr(-aw - 30, ay);
    var flood = drawn(ws, 'st-flood', W, H + 20, '');
    flood.style.transform = tr(0, H + 10);
    var gir = part(bob, '.a-gir', '50% 100%'), ele = part(bob, '.a-ele', '0% 50%'), eyes = part(bob, '.a-eyes'), pupils = part(bob, '.a-pupils');
    gir.style.transform = 'translateY(40px)';
    ele.style.opacity = 0; eyes.style.opacity = 0;
    var rock = bob.animate([{ transform: 'translateY(0) rotate(-2deg)' }, { transform: 'translateY(2px) rotate(2deg)' }, { transform: 'translateY(0) rotate(-2deg)' }],
      { duration: 2600, iterations: Infinity, easing: 'ease-in-out' });
    var dove, easeOut = function (u) { return 1 - (1 - u) * (1 - u); }, easeIn = function (u) { return u * u; };
    var coons = [];

    return wait(2200).then(ok).then(function () {
      // The sky is dark: lightning, and thunder.
      strike(rig, ws);
      return wait(400);
    }).then(ok).then(function () {
      // The water comes up.
      return move(flood, [{ transform: tr(0, H + 10) }, { transform: tr(0, surf) }], { duration: 4500, easing: 'ease-in-out' });
    }).then(ok).then(function () {
      fishes(ws, flood, surf, H);
      t.classList.add('sp-flooded');       // the tulips sway under the water
      return wait(1500);
    }).then(ok).then(function () {
      // In she sails.
      return move(arkEl, [{ transform: tr(-aw - 30, ay) }, { transform: tr(parkX, ay) }], { duration: 6000, easing: 'ease-out' });
    }).then(ok).then(function () {
      // Heads out, two by two.
      eyes.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' });
      blinks(eyes);
      return move(gir, [{ transform: 'translateY(40px)' }, { transform: 'translateY(-2px)', offset: 0.8 }, { transform: 'translateY(0)' }], { duration: 900, easing: 'ease-out' });
    }).then(ok).then(function () {
      ele.style.opacity = 1;
      return move(ele, [{ transform: 'translateX(-8px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 500, easing: 'ease-out' });
    }).then(ok).then(function () { return wait(1400); }).then(ok).then(function () {
      /* The dove comes out of the middle window as the turkey came out of
         the helicopter: out of the dark, small and confined to the window as
         though still inside, then into the light and out past the frame,
         full size -- and up and away. clip-path is in the element's own
         unscaled box and it scales about its middle, so the window is mapped
         back through the scale at each step to stay on the frame. */
      var dw = 32, dh = 24;
      dove = drawn(ws, 'st-dove', dw, dh, doveSvg(false, false));
      var wx = parkX + 73.5 * S, wy = ay + 37 * S, ww = 13 * S, wh = 12 * S;
      var cx = wx + ww / 2, cy = wy + wh / 2;
      var inset = function (x, y, k) {
        var L = dw / 2 + (wx - x - dw / 2) / k, R = dw / 2 + (wx + ww - x - dw / 2) / k;
        var T = dh / 2 + (wy - y - dh / 2) / k, B = dh / 2 + (wy + wh - y - dh / 2) / k;
        return 'inset(' + T.toFixed(1) + 'px ' + (dw - R).toFixed(1) + 'px ' + (dh - B).toFixed(1) + 'px ' + L.toFixed(1) + 'px)';
      };
      var p = [[cx - dw / 2, cy - dh / 2, 0.35], [cx - dw / 2, cy - dh / 2, 0.45], [cx - dw / 2 + 6, cy - dh / 2 - 6, 0.75], [cx - dw / 2 + 14, cy - dh / 2 - 14, 1]];
      dove.style.transform = tr(p[0][0], p[0][1], ' scale(.35)');
      var out = dove.animate([
        { transform: tr(p[0][0], p[0][1], ' scale(.35)'), opacity: 0, filter: 'brightness(0)', clipPath: inset(p[0][0], p[0][1], 0.35) },
        { transform: tr(p[1][0], p[1][1], ' scale(.45)'), opacity: 1, filter: 'brightness(.1)', clipPath: inset(p[1][0], p[1][1], 0.45), offset: 0.35 },
        { transform: tr(p[2][0], p[2][1], ' scale(.75)'), opacity: 1, filter: 'brightness(.6)', clipPath: inset(p[2][0], p[2][1], 0.75), offset: 0.7 },
        { transform: tr(p[3][0], p[3][1], ' scale(1)'), opacity: 1, filter: 'brightness(1)', clipPath: 'inset(-60% -60% -60% -60%)' }
      ], { duration: 900, easing: 'ease-in-out', fill: 'forwards' });
      return out.finished.then(function () {
        out.cancel();
        dove.style.transform = tr(p[3][0], p[3][1]);
        var x0 = p[3][0] + dw / 2, y0 = p[3][1] + dh / 2;
        return curve(dove, [x0, y0], [x0 + 130, y0 - 100], [W + 40, H * 0.08], 2500, easeIn, dw, dh);
      });
    }).then(ok).then(function () {
      /* With the dove gone, whoever it is in the first window moves along to
         the middle one it went from -- gone from the one, there in the other
         -- and looks about, this way and that, blinking. The ark's own
         distance between the two windows is 23.5. */
      eyes.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).finished.then(function () {
        if (rig.gen !== gen) return;
        eyes.style.translate = '23.5px 0';
        eyes.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 250, fill: 'forwards' });
        blinks(eyes);
        (function look(at) {
          if (rig.gen !== gen || !eyes.isConnected) return;
          var to = at === 0 ? (Math.random() < 0.5 ? -0.7 : 0.7) : (Math.random() < 0.4 ? -at : 0);
          move(pupils, [{ transform: 'translateX(' + at + 'px)' }, { transform: 'translateX(' + to + 'px)' }], { duration: 130, easing: 'ease-out' })
            .then(function () { setTimeout(function () { look(to); }, rand(450, 1400)); }, function () {});
        })(0);
      }, function () {});
      return wait(2200);
    }).then(ok).then(function () {
      // Back round the sky from the other side, with something in its beak.
      dove.innerHTML = doveSvg(true, false);
      var lx = parkX + 80 * S, ly = ay + 8 * S - 24 * 0.35;
      return curve(dove, [-40, H * 0.12], [W * 0.2, H * 0.02], [lx, ly], 3200, easeOut, 32, 24);
    }).then(ok).then(function () {
      /* Settled on the roof, going up and down with the boat; the rain
         stops, the storm clears off, and a rainbow comes up. */
      dove.innerHTML = doveSvg(true, true);
      bob.appendChild(dove);
      dove.style.transform = tr(80 * S - 16, 8 * S - 24 * 0.35 - 12);
      t.classList.remove('sp-pour');
      t.classList.add('sp-lull');
      return wait(2600);
    }).then(ok).then(function () {
      t.classList.add('sp-rainbow');
      return wait(2000);
    }).then(ok).then(function () {
      // And she sails on.
      return move(arkEl, [{ transform: tr(parkX, ay) }, { transform: tr(W + 30, ay) }], { duration: 6000, easing: 'ease-in' });
    }).then(ok).then(function () {
      rock.cancel();
      arkEl.remove();
      // The sway dies down, and the tulips ease back to the music, before it stops.
      t.classList.add('sp-ebb');
      t.classList.remove('sp-flooded');
      setTimeout(function () { if (rig.gen === gen) t.classList.remove('sp-ebb'); }, 1800);
      // The water goes down, into the puddle.
      return move(flood, [{ transform: tr(0, surf) }, { transform: tr(0, H + 10) }], { duration: 4000, easing: 'ease-in' });
    }).then(ok).then(function () {
      flood.remove();
      var bed = t.querySelector('.sp-bed'), yard = yardOf(rig);
      // The tulips come up again, and the puddle takes the last of it.
      if (bed) bed.animate([{ transform: 'translateY(40px)' }, { transform: 'translateY(-6px)', offset: 0.7 }, { transform: 'translateY(0)' }], { duration: 700, easing: 'ease-out' });
      if (yard) splash(yard, yard.clientWidth - 133, yard.clientHeight - 25, 3);
      return wait(1200);
    }).then(ok).then(function () {
      /* The last pair, late, and the wrong way: the raccoons come running
         through from the right, one with its sack. Drawn facing left from
         the start, so nothing turns round. */
      var yard = yardOf(rig);
      if (!yard) return;
      var YW = yard.clientWidth, rw = 70, rh = 56, fy = yard.clientHeight - 7 - rh * 52 / 56;
      var lead = drawn(yard, 'st-coon', rw, rh, ''), lugger = drawn(yard, 'st-coon', rw, rh, '');
      redrawCoon(lead, raccoonSvg('run', null, true), true);
      redrawCoon(lugger, raccoonSvg('run'), true);
      coons = [lead, lugger];
      coons.forEach(function (c) { c.style.transform = tr(YW + 20, fy); });
      var run = function (el, speed) {
        return move(el, [{ transform: tr(YW + 20, fy) }, { transform: tr(-rw - 10, fy) }], { duration: (YW + rw + 30) / speed * 1000, easing: 'linear' });
      };
      return Promise.all([run(lead, 300), wait(700).then(ok).then(function () { return run(lugger, 230); })]);
    }).then(ok).then(function () {
      coons.forEach(function (c) { c.remove(); });
      // The rainbow fades, and the rain comes back.
      return wait(3000);
    }).then(ok).then(function () {
      t.classList.remove('sp-rainbow');
      return wait(3200);
    }).then(ok).then(function () {
      t.classList.remove('sp-lull');
      return wait(1500);
    });
  }

  /* ------------------------------------------------------------------ */
  /* The skeleton, Halloween's small scene. Drawn front-on with its feet  */
  /* turned the way it goes, the way a cartoon skeleton walks: a loose,  */
  /* bouncing stride, knees kicking up on the swing, arms swinging       */
  /* against the legs, the skull bobbing and the jaw chattering.         */
  /* ------------------------------------------------------------------ */

  var BONE = '#f1ecdc', BONE_LINE = '#2b2233', BONE_SHADE = '#cfc6b0';
  // A bone: a rounded bar with a knuckle at each end, from (x1,y1) to (x2,y2).
  function bone(x1, y1, x2, y2, w) {
    return '<path d="M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2 + '" stroke="' + BONE_LINE + '" stroke-width="' + (w + 1.6) + '" stroke-linecap="round"/>' +
      '<path d="M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2 + '" stroke="' + BONE + '" stroke-width="' + w + '" stroke-linecap="round"/>' +
      '<circle cx="' + x1 + '" cy="' + y1 + '" r="' + (w * 0.75) + '" fill="' + BONE + '" stroke="' + BONE_LINE + '" stroke-width=".8"/>' +
      '<circle cx="' + x2 + '" cy="' + y2 + '" r="' + (w * 0.75) + '" fill="' + BONE + '" stroke="' + BONE_LINE + '" stroke-width=".8"/>';
  }
  /* Rotations about a joint. vals in degrees; a leg hanging down turned
     clockwise (positive) swings its foot back, the skeleton facing right. */
  function swing(vals, cx, cy, dur, keys) {
    return '<animateTransform attributeName="transform" type="rotate" values="' +
      vals.map(function (v) { return v + ' ' + cx + ' ' + cy; }).join(';') + '"' +
      (keys ? ' keyTimes="' + keys + '" calcMode="spline" keySplines="' + keys.split(';').slice(1).map(function () { return '.45 0 .55 1'; }).join(';') + '"' : '') +
      ' dur="' + dur + 's" repeatCount="indefinite"/>';
  }
  function still(deg, cx, cy) { return deg ? ' transform="rotate(' + deg + ' ' + cx + ' ' + cy + ')"' : ''; }

  /* A leg from the hip at (x, 62): thigh to the knee at y 77, shin to the
     ankle at y 92, and the foot pointing right. thigh/knee are either
     fixed angles or animation markup. */
  function skelLeg(x, thigh, knee) {
    var tA = typeof thigh === 'number', kA = typeof knee === 'number';
    return '<g' + (tA ? still(thigh, x, 62) : '') + '>' + (tA ? '' : thigh) + bone(x, 62, x, 77, 3.2) +
      '<g' + (kA ? still(knee, x, 77) : '') + '>' + (kA ? '' : knee) + bone(x, 77, x, 92, 2.8) +
      '<path d="M' + (x - 2) + ' 92.5Q' + x + ' 90.5 ' + (x + 6.5) + ' 93.2Q' + (x + 7.4) + ' 95.2 ' + (x + 5) + ' 95.4L' + (x - 2) + ' 95.2Q' + (x - 3.2) + ' 94 ' + (x - 2) + ' 92.5Z" fill="' + BONE + '" stroke="' + BONE_LINE + '" stroke-width=".9"/>' +
      '</g></g>';
  }
  // An arm from the shoulder at (x, 33): upper arm to the elbow at y 45, forearm to the wrist at y 56, a hand of three fingers.
  function skelArm(x, shoulder, elbow) {
    var sA = typeof shoulder === 'number', eA = typeof elbow === 'number';
    return '<g' + (sA ? still(shoulder, x, 33) : '') + '>' + (sA ? '' : shoulder) + bone(x, 33, x, 45, 2.6) +
      '<g' + (eA ? still(elbow, x, 45) : '') + '>' + (eA ? '' : elbow) + bone(x, 45, x, 56, 2.2) +
      '<path d="M' + x + ' 56l-1.8 4M' + x + ' 56l0 4.4M' + x + ' 56l1.8 4" stroke="' + BONE_LINE + '" stroke-width="2.4" stroke-linecap="round"/>' +
      '<path d="M' + x + ' 56l-1.8 4M' + x + ' 56l0 4.4M' + x + ' 56l1.8 4" stroke="' + BONE + '" stroke-width="1.2" stroke-linecap="round"/>' +
      '</g></g>';
  }
  var SKEL_TRUNK =
    // Spine, neck to tail.
    '<path d="M30 25V60" stroke="' + BONE_LINE + '" stroke-width="3.6" stroke-linecap="round"/>' +
    '<path d="M30 25V60" stroke="' + BONE + '" stroke-width="2" stroke-dasharray="2.2 .9" stroke-linecap="round"/>' +
    // Collarbones.
    '<path d="M19 33Q24 30.5 30 31.5Q36 30.5 41 33" fill="none" stroke="' + BONE_LINE + '" stroke-width="3.4" stroke-linecap="round"/>' +
    '<path d="M19 33Q24 30.5 30 31.5Q36 30.5 41 33" fill="none" stroke="' + BONE + '" stroke-width="1.8" stroke-linecap="round"/>' +
    // Ribs, four a side, getting shorter towards the bottom.
    [35, 39, 43, 47].map(function (y, i) {
      var w = 9.5 - i * 1.3, d = 'M30 ' + y + 'Q' + (30 - w) + ' ' + (y - 1) + ' ' + (30 - w + 1) + ' ' + (y + 3.4) + 'M30 ' + y + 'Q' + (30 + w) + ' ' + (y - 1) + ' ' + (30 + w - 1) + ' ' + (y + 3.4);
      return '<path d="' + d + '" fill="none" stroke="' + BONE_LINE + '" stroke-width="2.9" stroke-linecap="round"/>' +
        '<path d="' + d + '" fill="none" stroke="' + BONE + '" stroke-width="1.5" stroke-linecap="round"/>';
    }).join('') +
    // Pelvis.
    '<path d="M23 58Q30 55 37 58Q38.5 63 35 65Q30 62 25 65Q21.5 63 23 58Z" fill="' + BONE + '" stroke="' + BONE_LINE + '" stroke-width="1"/>' +
    '<circle cx="30" cy="61" r="1.3" fill="' + BONE_SHADE + '"/>';
  /* The skull, big and goofy: round dome, huge sockets with a glint each,
     a grin of teeth, and a jaw of its own that chatters. tilt is animation
     markup or a fixed angle. */
  function skelSkull(tilt, chatter, look) {
    var tA = typeof tilt === 'number';
    var eyeX = look || 0;
    return '<g' + (tA ? still(tilt, 30, 25) : '') + '>' + (tA ? '' : tilt) +
      '<path d="M18.5 15C18.5 6 23.8 2.5 30 2.5S41.5 6 41.5 15C41.5 19.5 39 21.5 37.5 22.5L22.5 22.5C21 21.5 18.5 19.5 18.5 15Z" fill="' + BONE + '" stroke="' + BONE_LINE + '" stroke-width="1.2"/>' +
      '<path d="M21 8Q24 4.6 28 4.4" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>' +
      '<ellipse cx="25.3" cy="13.6" rx="3.6" ry="4.3" fill="' + BONE_LINE + '"/><ellipse cx="34.7" cy="13.6" rx="3.6" ry="4.3" fill="' + BONE_LINE + '"/>' +
      '<circle cx="' + (26.2 + eyeX) + '" cy="12.6" r="1.1" fill="#fff"/><circle cx="' + (35.6 + eyeX) + '" cy="12.6" r="1.1" fill="#fff"/>' +
      '<path d="M30 16.6L28.6 19.4H31.4Z" fill="' + BONE_LINE + '"/>' +
      '<path d="M23.4 21.4H36.6" stroke="' + BONE_LINE + '" stroke-width="1"/>' +
      '<g>' + (chatter ? '<animateTransform attributeName="transform" type="translate" values="0 0;0 1.8;0 0" dur="' + chatter + 's" repeatCount="indefinite"/>' : '') +
        '<path d="M22.8 21.6H37.2V24.2Q30 27.4 22.8 24.2Z" fill="' + BONE + '" stroke="' + BONE_LINE + '" stroke-width="1.1"/>' +
        '<path d="M25.4 21.8V24.6M28 21.8V25.4M30.6 21.8V25.6M33.2 21.8V25.2M35.6 21.8V24.4" stroke="' + BONE_LINE + '" stroke-width=".7"/>' +
      '</g></g>';
  }

  var STRIDE = 0.86;   // seconds a full stride takes: both feet once
  /* Each pose as the angle of every joint: a number held, or a loop
     { v: [...], dur, keys }. A new pose does not cut to its angles: each
     joint turns from wherever it is at that moment -- read off the drawing
     being replaced, mid-swing and all -- over EASE seconds, and only then
     starts its loop. Turning from the old pose's first angle instead
     snapped a limb caught mid-swing back to it first: a stutter. */
  var EASE = 0.4;
  var SKEL_JOINTS = {
    aBs: [41, 33], aBe: [41, 45], aFs: [19, 33], aFe: [19, 45],
    lBh: [31.5, 62], lBk: [31.5, 77], lFh: [28.5, 62], lFk: [28.5, 77],
    sk: [30, 25], rock: [30, 95], up: [30, 60]
  };
  function skelPose(pose) {
    var T = STRIDE, K = '0;.25;.5;.75;1', W = function (v, keys) { return { v: v, dur: T, keys: keys || K }; };
    if (pose === 'walk') {
      /* A loose, wobbly stride. Thighs swing ±28°, out of step with each
         other; each knee kicks high on its forward swing. The whole frame
         rocks from foot to foot, the bones above the pelvis rock the other
         way on top of that, the arms flop, and the skull lolls a beat
         behind. Down at each foot-fall, up as the legs pass. */
      return { aBs: W([-34, 4, 38, 4, -34]), aBe: W([-8, -52, -14, -36, -8]), aFs: W([38, 4, -34, 4, 38]), aFe: W([-14, -36, -8, -52, -14]),
        lBh: W([24, 0, -28, 0, 24]), lBk: W([6, 52, 10, 2, 6]), lFh: W([-28, 0, 24, 0, -28]), lFk: W([10, 2, 6, 52, 10]),
        sk: W([-13, 2, 11, -2, -13], '0;.3;.55;.8;1'), rock: W([-6, 6, -6], '0;.5;1'), up: W([7, -7, 7], '0;.5;1'),
        bob: W([3.2, 0, 3.2, 0, 3.2]), chatter: 0.2, look: 0.8 };
    }
    var still = { lBh: -4, lBk: 0, lFh: 4, lFk: 0, rock: 0, up: 0, bob: 0 };
    var o = function (x) { for (var k in still) if (!(k in x)) x[k] = still[k]; return x; };
    if (pose === 'wave') {
      // Turned to us: one arm up and waving from the elbow, the other hand on its hip.
      return o({ aBs: -168, aBe: { v: [-30, 30, -30], dur: 0.5 }, aFs: 38, aFe: -95, sk: { v: [-8, 8, -8], dur: 1 }, chatter: 0.3, look: 0 });
    }
    if (pose === 'look') {
      // Just up: looks one way, then the other, jaw going.
      return o({ aBs: -12, aBe: -20, aFs: 12, aFe: 20, sk: { v: [-14, -14, 14, 14, -14], dur: 1.6, keys: '0;.3;.4;.8;1' }, chatter: 0.25, look: 0 });
    }
    // 'rise' and 'sink': arms up over its head, waving slowly, jaw chattering.
    return o({ lBh: -3, lFh: 3, aBs: -160, aBe: { v: [10, -10, 10], dur: 0.8 }, aFs: 160, aFe: { v: [-10, 10, -10], dur: 0.8 },
      sk: { v: [-6, 6, -6], dur: 0.7 }, chatter: 0.18, look: 0 });
  }
  function first(j) { return typeof j === 'number' ? j : j.v[0]; }
  /* A joint's animation: the turn from its old angle to its new one, held,
     and its loop starting when the turn is done. */
  function joint(key, cur, from, cx, cy, type) {
    var to = first(cur);
    if (from == null) from = to;
    var fmt = function (a) { return type === 'translate' ? '0 ' + a : a + ' ' + cx + ' ' + cy; };
    var s = '<animateTransform data-j="' + key + '" data-base="' + (type === 'translate' ? 'translate(' : 'rotate(') + fmt(+from.toFixed(2)) + ')" attributeName="transform" type="' + (type || 'rotate') + '" values="' + fmt(+from.toFixed(2)) + ';' + fmt(to) +
      '" dur="' + EASE + 's" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .55 1"/>';
    if (typeof cur !== 'number') {
      var keys = cur.keys;
      s += '<animateTransform attributeName="transform" type="' + (type || 'rotate') + '" values="' + cur.v.map(fmt).join(';') + '"' +
        (keys ? ' keyTimes="' + keys + '" calcMode="spline" keySplines="' + keys.split(';').slice(1).map(function () { return '.45 0 .55 1'; }).join(';') + '"' : '') +
        ' dur="' + cur.dur + 's" begin="' + EASE + 's" repeatCount="indefinite"/>';
    }
    return s;
  }
  /* Where every joint is right now in a drawing: its angle (or, for the
     bob, its height), from the transform the animations have it at. */
  function skelNow(svg) {
    var at = {};
    if (!svg) return at;
    Array.prototype.forEach.call(svg.querySelectorAll('[data-j]'), function (a) {
      // The animated value is read-only (consolidate() throws on it); each group carries one transform.
      var list = a.parentNode.transform && a.parentNode.transform.animVal;
      if (!list || !list.numberOfItems) return;
      var t = list.getItem(list.numberOfItems - 1), k = a.getAttribute('data-j');
      at[k] = k === 'bob' ? t.matrix.f : t.angle;
    });
    return at;
  }
  function skelSvg(pose, from) {
    var P = skelPose(pose), Q = from || {};
    var J = function (k) { return joint(k, P[k], Q[k], SKEL_JOINTS[k][0], SKEL_JOINTS[k][1]); };
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 100" width="100%" height="100%" overflow="visible">' +
      '<g>' + joint('bob', P.bob, Q.bob, 0, 0, 'translate') +
        '<g>' + J('rock') +
          '<g>' + J('up') + skelArm(41, J('aBs'), J('aBe')) + '</g>' +
          skelLeg(31.5, J('lBh'), J('lBk')) + skelLeg(28.5, J('lFh'), J('lFk')) +
          '<g>' + J('up') + SKEL_TRUNK + skelArm(19, J('aFs'), J('aFe')) + skelSkull(J('sk'), P.chatter, P.look) + '</g>' +
        '</g></g></svg>';
  }

  /* The stone it climbs, as a shape it can be hidden behind -- and below,
     to the foot of the stage, so it can wait out of sight under the stone
     before it rises. Drawn in the stone's own frame and turned by the
     stone's own lean, so the edge it walks is the edge you see. */
  function stoneMask(W, H, s) {
    var w = s.w + 2, h = s.h + 2, rx = w * 0.46, ry = h * 0.4, x = -1, y = -1;
    var d = 'M' + x + ' ' + (y + ry) + 'A' + rx + ' ' + ry + ' 0 0 1 ' + (x + rx) + ' ' + y + 'H' + (x + w - rx) +
      'A' + rx + ' ' + ry + ' 0 0 1 ' + (x + w) + ' ' + (y + ry) + 'V' + (H + h) + 'H' + x + 'Z';
    // Read by alpha, so the stone must be a hole: an SVG mask cuts it out of a full rectangle.
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"><defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '">' +
      '<rect width="' + W + '" height="' + H + '" fill="white"/>' +
      '<path fill="black" d="' + d + '" transform="translate(' + s.left + ' ' + s.top + ') rotate(' + s.deg + ' ' + s.w / 2 + ' ' + s.h / 2 + ')"/></mask></defs>' +
      '<rect width="' + W + '" height="' + H + '" mask="url(#m)"/></svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }
  /* A point on the stone's top edge, x along it from its left end, in
     stage pixels; and the slope there, in degrees. The top corners are
     quarter-ellipses rx = .46w across and ry = .4h down, as the
     stylesheet's border-radius draws them. */
  function stoneEdge(s, x) {
    var rx = s.w * 0.46, ry = s.h * 0.4, y = 0, dx = 0;
    if (x < rx) dx = rx - x; else if (x > s.w - rx) dx = x - (s.w - rx);
    if (dx) y = ry - ry * Math.sqrt(Math.max(0, 1 - (dx / rx) * (dx / rx)));
    var a = s.deg * Math.PI / 180, cx = s.w / 2, cy = s.h / 2;
    var px = x - cx, py = y - cy;
    return { x: s.left + cx + px * Math.cos(a) - py * Math.sin(a), y: s.top + cy + px * Math.sin(a) + py * Math.cos(a) };
  }

  function skeletonWalk(rig) {
    var stage = stageOf(rig), gen = rig.gen, ok = guard(rig, gen);
    var W = stage.clientWidth, H = stage.clientHeight;
    var row = boxIn(rig, '.presets'), t = rig.tuner.getBoundingClientRect();
    if (!row) return Promise.resolve();
    // A station's stone wholly in view in the row, not the add button.
    var stones = Array.prototype.map.call(rig.tuner.querySelectorAll('.preset:not(.preset-add)'), function (el) {
      var r = el.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
      var deg = parseFloat(getComputedStyle(el).rotate) || 0;
      // The bounding box is the turned stone's; its centre is the stone's centre.
      return { w: w, h: h, deg: deg, left: r.left - t.left + r.width / 2 - w / 2, top: r.top - t.top + r.height / 2 - h / 2, bt: r.top - t.top, bb: r.bottom - t.top };
    }).filter(function (s) { return s.w > 0 && s.bt >= row.y - 4 && s.bb <= row.y + row.h + 4; });
    if (!stones.length) return Promise.resolve();
    var S = stones[Math.floor(Math.random() * stones.length)];

    var yard = document.createElement('div');
    yard.className = 'st-graveyard';
    yard.style.width = W + 'px'; yard.style.height = H + 'px';
    yard.style.webkitMaskImage = yard.style.maskImage = stoneMask(W, H, S);
    stage.appendChild(yard);

    // As tall as a stone and a half; its feet are 95.4% of the way down its box.
    var h = Math.round(Math.max(70, Math.min(110, S.h * 1.45))), w = Math.round(h * 0.6), FEET = 0.954;
    var dir = Math.random() < 0.5 ? 1 : -1;
    var xa = S.w * (dir > 0 ? 0.13 : 0.87), xb = S.w * (dir > 0 ? 0.87 : 0.13);
    var sk = drawn(yard, 'st-skeleton', w, h, '<div class="st-face"></div>');
    sk.style.transformOrigin = '50% ' + FEET * 100 + '%';
    var face = sk.firstChild;
    /* Each joint is also given its starting angle as its resting one, in
       the same task as the drawing goes in: a new drawing was painted once
       with every joint at rest -- arms hanging straight -- before its
       animations took hold, which flashed at each change of pose. */
    var show = function (p) {
      face.innerHTML = skelSvg(p, skelNow(face.querySelector('svg')));
      Array.prototype.forEach.call(face.querySelectorAll('[data-base]'), function (a) { a.parentNode.setAttribute('transform', a.getAttribute('data-base')); });
      face.style.transform = dir < 0 ? 'scaleX(-1)' : '';
    };
    /* Standing at x along the stone: feet on the edge, leaning a little
       with the slope -- half of it, so it reads as climbing rather than
       as falling over. drop pushes it straight down behind the stone. */
    var at = function (x, drop) {
      var p = stoneEdge(S, x), q = stoneEdge(S, x + 1);
      var lean = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI * 0.5;
      return tr(p.x - w / 2, p.y - h * FEET + (drop || 0), ' rotate(' + lean.toFixed(1) + 'deg)');
    };
    var hidden = h + 6;
    var path = function (x0, x1) {
      var n = 28, pts = [], len = [0];
      for (var i = 0; i <= n; i++) pts.push(x0 + (x1 - x0) * i / n);
      for (var j = 1; j <= n; j++) {
        var p = stoneEdge(S, pts[j - 1]), q = stoneEdge(S, pts[j]);
        len.push(len[j - 1] + Math.hypot(q.x - p.x, q.y - p.y));
      }
      var total = len[n];
      return { total: total, frames: pts.map(function (x, k) { return { transform: at(x), offset: total ? len[k] / total : k / n }; }) };
    };

    sk.style.transform = at(xa, hidden);
    show('rise');
    return wait(10).then(ok).then(function () {
      return move(sk, [{ transform: at(xa, hidden) }, { transform: at(xa) }], { duration: 1600, easing: 'cubic-bezier(.3,.7,.4,1)' });
    }).then(ok).then(function () {
      show('look');
      return wait(1700);
    }).then(ok).then(function () {
      show('walk');
      // About two-thirds of its height a stride, walked at that pace so the feet do not slide.
      var p = path(xa, xb), pace = h * 0.62 / STRIDE;
      return move(sk, p.frames, { duration: p.total / pace * 1000, easing: 'linear' });
    }).then(ok).then(function () {
      show('wave');
      return wait(2400);
    }).then(ok).then(function () {
      show('rise');
      return move(sk, [{ transform: at(xb) }, { transform: at(xb, hidden) }], { duration: 1400, easing: 'cubic-bezier(.6,0,.8,.4)' });
    }).then(function () { yard.remove(); }, function (e) { yard.remove(); throw e; });
  }

  var SCENES = { skeleton: skeletonWalk, turkey: turkeyRun, wkrp: wkrp, snowman: snowman, elf: elfFix, cardinal: cardinal, sleigh: sleigh,
    duck: duck, umbrella: umbrella, butterfly: butterfly, rainbow: rainbow, ark: ark, broom: broomRepair };

  function play(rig, name) {
    if (rig.busy || !SCENES[name]) return Promise.resolve();
    rig.busy = true;
    var gen = rig.gen;
    return SCENES[name](rig).then(null, function (e) { if (e !== ABORT && !(e && e.name === 'AbortError')) throw e; })
      .then(function () { if (rig.gen === gen) rig.busy = false; });
  }

  /* Time is counted only while the scene could be seen, so "rarely" means
     rarely in listening, not in hours since the machine was switched on. */
  var TICK = 1000;
  function nextSmall(cast) { return rand(cast.gap[0], cast.gap[1]) * 1000; }
  /* The first one comes sooner than the rest: somebody who has just put
     this face on has not seen it, and a scene they never get to is the
     same as no scene. After that it is rarer, so that coming across one
     stays an event rather than a feature of the furniture. */
  function nextBig(first) { return (first ? rand(8, 30) : rand(15, 35)) * 60000; }

  /* A change of face clears the stage: whatever was on it belonged to the
     old one. Asked before anything is played, as well as every tick, so a
     scene sent for before the first tick has noticed the face is not taken
     for a change of face a moment later and swept away. */
  function syncFace(rig) {
    var face = themeOf(rig.tuner), cast = CAST[face];
    if (face === rig.face) return cast;
    if (rig.busy || (rig.stage && rig.stage.firstChild)) clear(rig);
    rig.face = face;
    rig.smallIn = cast ? nextSmall(cast) : 0;
    rig.bigIn = nextBig(true);
    return cast;
  }

  /* ------------------------------------------------------------------ */
  /* Halloween's cobweb and its spider. The web is drawn here rather    */
  /* than in the stylesheet so that it can reach the station name: its  */
  /* spokes run straight out of the corner, the lower ones ending on    */
  /* the tops of the letters, and the outer thread runs along them. It  */
  /* is measured again every second, so it fits any window and any name. */
  /* The spider now and then lets itself down on a thread, drifts in    */
  /* the draught, and climbs back up; its eyes blink.                   */
  /* ------------------------------------------------------------------ */

  var SILK_REST = 12;
  var SPIDER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -3 20 17" width="20" height="17" overflow="visible">' +
    '<g class="hw-legs" fill="none" stroke="#1c0802" stroke-width=".9" stroke-linecap="round">' +
      '<path class="hw-legs-l" d="M-2.4 2.6Q-6 -1.4 -9 .8M-3 4.2Q-7 2.2 -9.6 5M-3 6Q-7 6.6 -9 10.2M-2.4 7.6Q-5 10.4 -7 13.4"/>' +
      '<path class="hw-legs-r" d="M2.4 2.6Q6 -1.4 9 .8M3 4.2Q7 2.2 9.6 5M3 6Q7 6.6 9 10.2M2.4 7.6Q5 10.4 7 13.4"/>' +
    '</g>' +
    '<ellipse cx="0" cy="6" rx="3.9" ry="4.8" fill="#3a1c10"/><circle cx="0" cy=".6" r="2.6" fill="#3a1c10"/>' +
    '<g class="hw-eyes"><circle cx="-.9" cy=".2" r=".75" fill="#ffe08a"/><circle cx=".9" cy=".2" r=".75" fill="#ffe08a"/></g></svg>';

  function spiderOff(rig) {
    if (!rig.web) return;
    clearTimeout(rig.web.blinkT);
    rig.web.root.getAnimations({ subtree: true }).forEach(function (a) { a.cancel(); });
    rig.web.root.remove();
    rig.web = null;
  }
  function spiderOn(rig) {
    var disp = rig.tuner.querySelector('.display');
    if (!disp) return null;
    if (rig.web && rig.web.root.isConnected) return rig.web;
    var root = document.createElement('div');
    root.className = 'hw-web';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '<svg class="hw-threads" width="100%" height="100%" fill="none" stroke="#1c0802" stroke-width=".9">' +
      '<path class="hw-spokes" stroke-opacity=".55"/><path class="hw-rings" stroke-opacity=".55"/><path class="hw-rim" stroke-opacity=".38"/></svg>' +
      '<div class="hw-silk"><svg class="hw-thread" width="1" height="1" overflow="visible"><path d="M0 0V1" fill="none" stroke="rgba(28,8,2,.62)" stroke-width=".8" vector-effect="non-scaling-stroke"/></svg><div class="hw-spider">' + SPIDER_SVG + '</div></div>';
    disp.appendChild(root);
    var web = rig.web = { root: root, spokes: root.querySelector('.hw-spokes'), rings: root.querySelector('.hw-rings'), rim: root.querySelector('.hw-rim'),
      silk: root.querySelector('.hw-silk'), thread: root.querySelector('.hw-thread'), spider: root.querySelector('.hw-spider'),
      eyes: root.querySelector('.hw-eyes'), len: SILK_REST, busy: false, next: Date.now() + rand(20, 60) * 1000, gen: 0, key: '' };
    setSilk(web, SILK_REST);
    blinkLater(web);
    return web;
  }
  function setSilk(web, len) {
    web.len = len;
    web.thread.style.transform = 'scaleY(' + len.toFixed(1) + ')';
    web.spider.style.transform = 'translate(-10px,' + len.toFixed(1) + 'px)';
  }
  /* The eyes blink at random: now and then, once in a while twice. */
  function blinkLater(web) {
    web.blinkT = setTimeout(function () {
      if (!web.root.isConnected) return;
      if (!document.hidden && !(reduced && reduced.matches)) {
        var shut = [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.08)', offset: 0.45 }, { transform: 'scaleY(.08)', offset: 0.6 }, { transform: 'scaleY(1)' }];
        var twice = Math.random() < 0.25;
        web.eyes.animate(shut, { duration: 170, easing: 'ease-in-out' });
        if (twice) setTimeout(function () { if (web.root.isConnected) web.eyes.animate(shut, { duration: 170, easing: 'ease-in-out' }); }, 300);
      }
      blinkLater(web);
    }, rand(1800, 7000));
  }

  /* The web, fitted to the name. The corner is the glass's top left, and
     every spoke is one straight line from it to the top of a letter: the
     top spoke to the fifth letter, then the third, the second, and the
     first. Where the top of a letter is comes from the font's own
     measurements of that glyph, not from its box -- the box runs well
     above the ink, by an amount that changes with the face and the size,
     and a fixed share of it left the web hanging short of the name on a
     bigger window. The rings sag towards the corner, as a web's do. */
  var inkCanvas = null;
  function inkTop(ch, font) {
    inkCanvas = inkCanvas || document.createElement('canvas').getContext('2d');
    inkCanvas.font = font;
    var m = inkCanvas.measureText(ch);
    // From the top of the glyph's box down to the top of its ink.
    return (m.fontBoundingBoxAscent || 0) - (m.actualBoundingBoxAscent || 0);
  }
  function fitWeb(rig, web) {
    var disp = rig.tuner.querySelector('.display'), name = rig.tuner.querySelector('.display-name');
    if (!disp || !name) return;
    var line = name.querySelector('.name-line') || name;
    var d = disp.getBoundingClientRect(), n = name.getBoundingClientRect(), l = line.getBoundingClientRect();
    var glyphs = [], range = document.createRange(), walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT), node;
    var cs = getComputedStyle(line), font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    while ((node = walker.nextNode()) && glyphs.length < 6) {
      for (var i = 0; i < node.length && glyphs.length < 6; i++) {
        // Letters and digits only: a thread tied to a full stop or a dot between words hangs in the air.
        if (!/[\p{L}\p{N}]/u.test(node.data[i])) continue;
        range.setStart(node, i); range.setEnd(node, i + 1);
        var r = range.getBoundingClientRect();
        // Against the line the letters sit in, not where a scrolling name has carried them.
        if (r.width) glyphs.push({ x: r.left - l.left + n.left - d.left, w: r.width, ink: r.top - d.top + inkTop(node.data[i], font) });
      }
    }
    var C = { x: 3, y: 3 }, ends;
    if (glyphs.length) {
      // A pixel into the ink, so the thread is seen to touch it.
      var on = function (i, across) { var g = glyphs[Math.min(i, glyphs.length - 1)]; return { x: g.x + g.w * across, y: g.ink + 1 }; };
      ends = [on(4, 0.45), on(2, 0.5), on(1, 0.5), on(0, 0.35)];
    } else {
      ends = [{ x: 110, y: 20 }, { x: 100, y: 64 }, { x: 64, y: 100 }, { x: 22, y: 112 }];
    }
    // In order round from the top, which is the order the rings join them in.
    ends.sort(function (p, q) { return Math.atan2(p.y - C.y, p.x - C.x) - Math.atan2(q.y - C.y, q.x - C.x); });
    var key = ends.map(function (e) { return Math.round(e.x) + ':' + Math.round(e.y); }).join(',');
    /* Where the spider is allowed to come to rest.

       Anywhere clear of the writing: in a gap between two lines of it, or
       below the last line. Which of those it takes is picked afresh every
       time it goes down, so it is not always found in the same place.
       What it may not do is stop in front of any of them -- it used to
       measure the name alone, so it cleared that and parked squarely over
       the line beneath, which is the very thing the rule existed to stop.

       Measured by the ink and not by the boxes. A display name is set in
       a line box far taller than its letters: by the rectangle there is
       no gap under it worth having, and by the ink there is room for a
       spider. An element with nothing in it is skipped rather than
       measured -- a status between messages, or a tag a station never
       filled in, is not a thing to hang below.

       And measured against the spider's body rather than its full
       height. Its legs trail below it -- the drawing is 17 tall and the
       body and head account for about 13 of that, starting a pixel down
       -- and a leg tip grazing the top of a letter is not what anybody
       means by blocking the text. Going by the whole box instead, the
       gap above the tag line is three pixels short and the spider would
       never be seen there at all, which is the half of this that was
       asked for. */
    var inkOf = function (sel) {
      var e = rig.tuner.querySelector(sel);
      if (!e) return null;
      var rr = document.createRange();
      rr.selectNodeContents(e);
      var list = rr.getClientRects(), lo = Infinity, hi = -Infinity;
      for (var k = 0; k < list.length; k++) {
        if (!list[k].height) continue;
        lo = Math.min(lo, list[k].top);
        hi = Math.max(hi, list[k].bottom);
      }
      return lo === Infinity ? null : { top: lo - d.top, bottom: hi - d.top };
    };
    /* Two places to stop, both against the tag line -- the codec, the
       bitrate and the city -- and picked between at random each time:
       just above it, and just below it.

       There used to be a third, the open glass under the status, and it
       was the wrong one. It is the biggest space on the display, so a
       random spot in it was usually a long way down, and the spider ran
       past everything and hung in front of the tuning scale.

       Placed by the body, a pixel clear of the tag's ink either side,
       and only kept if the body is also clear of the name and the
       status. The gap above the tag is fourteen pixels on this face and
       the body is thirteen, which is why it is measured in ink and
       not in boxes. */
    var BODY = 13, BODY_TOP = 1;
    var nameInk = inkOf('.display-name'), tagInk = inkOf('.display-tag'), statusInk = inkOf('.display-status');
    var clearOf = function (bt) {
      var bb = bt + BODY;
      return [nameInk, statusInk].every(function (r) { return !r || bb <= r.top || bt >= r.bottom; });
    };
    web.rests = [];
    if (tagInk) {
      var above = tagInk.top - 1 - BODY, below = tagInk.bottom + 1;
      if (clearOf(above)) web.rests.push(above - BODY_TOP);
      if (clearOf(below)) web.rests.push(below - BODY_TOP);
    }
    // A face with no tag line: hang clear below the name, as it always did.
    web.below = nameInk ? nameInk.bottom : n.bottom - d.top;

    /* Where the spider is right now, and the thread length that put it
       there. Those two together are all that is needed to work out the
       length for anywhere else: it is a delta, so nothing else has to
       be right.

       It was worked out from web.top plus a measured offset, and that
       was wrong often enough to matter -- web.top is only refreshed on
       the passes where the web's own shape changes, because fitWeb
       returns early otherwise, so it can be a few pixels stale. A few
       pixels is the difference between hanging below a line of text and
       sitting on it, and one rest in three landed on the status line.

       Taken only while it is at rest: mid-drop the transform is an
       animation in flight and does not agree with web.len. */
    if (!web.busy) {
      var sr = web.spider.getBoundingClientRect();
      if (sr.height) {
        web.restTop = sr.top - d.top;
        web.restLen = web.len;
        web.boxH = sr.height;
      }
    }
    if (key === web.key) return;
    /* A web that was already up dissolves into the new one -- a new
       station's name, or the window changed size -- rather than jumping:
       the old threads fade out over the new ones fading in. */
    var was = web.key && !(reduced && reduced.matches) ? web.root.querySelector('.hw-threads:not(.is-going)') : null;
    if (was) {
      var ghost = was.cloneNode(true);
      ghost.classList.add('is-going');
      web.root.insertBefore(ghost, was);
      ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, easing: 'ease-in-out' }).finished.then(function () { ghost.remove(); }, function () { ghost.remove(); });
      was.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: 'ease-in-out' });
    }
    web.key = key;

    var f = function (v) { return v.toFixed(1); };
    var at = function (e, k) { return { x: C.x + (e.x - C.x) * k, y: C.y + (e.y - C.y) * k }; };
    web.spokes.setAttribute('d', ends.map(function (e) { return 'M' + C.x + ' ' + C.y + 'L' + f(e.x) + ' ' + f(e.y); }).join(''));
    var ring = function (k) {
      var dd = '';
      for (var j = 0; j < ends.length - 1; j++) {
        var p = at(ends[j], k), q = at(ends[j + 1], k);
        var c = { x: C.x + ((p.x + q.x) / 2 - C.x) * 0.8, y: C.y + ((p.y + q.y) / 2 - C.y) * 0.8 };
        dd += (j ? '' : 'M' + f(p.x) + ' ' + f(p.y)) + 'Q' + f(c.x) + ' ' + f(c.y) + ' ' + f(q.x) + ' ' + f(q.y);
      }
      return dd;
    };
    web.rings.setAttribute('d', ring(0.26) + ring(0.5) + ring(0.75));
    web.rim.setAttribute('d', ring(1));
    // The spider hangs from the middle ring, between spokes two and three.
    var p2 = at(ends[1], 0.5), p3 = at(ends[2], 0.5);
    var c2 = { x: C.x + ((p2.x + p3.x) / 2 - C.x) * 0.8, y: C.y + ((p2.y + p3.y) / 2 - C.y) * 0.8 };
    web.silk.style.left = f(0.25 * p2.x + 0.5 * c2.x + 0.25 * p3.x) + 'px';
    web.silk.style.top = f(0.25 * p2.y + 0.5 * c2.y + 0.25 * p3.y) + 'px';
    web.top = 0.25 * p2.y + 0.5 * c2.y + 0.25 * p3.y;
    web.root.classList.add('is-fitted');
  }

  /* Down, slowly, sometimes in two goes; a while drifting in the draught;
     back up, legs going. The thread is exactly as long as the drop -- it
     ends at the spider. Every move is checked against web.gen, so taking
     the face away stops it dead. */
  function spiderDrop(rig, web) {
    var gen = ++web.gen;
    var live = function (v) { if (!rig.web || rig.web !== web || web.gen !== gen) throw ABORT; return v; };
    var let_ = function (to, pxPerS, easing) {
      var from = web.len, dur = Math.abs(to - from) / pxPerS * 1000;
      var o = { duration: dur, easing: easing || 'ease-in-out', fill: 'forwards' };
      var a = web.thread.animate([{ transform: 'scaleY(' + from + ')' }, { transform: 'scaleY(' + to + ')' }], o);
      var b = web.spider.animate([{ transform: 'translate(-10px,' + from + 'px)' }, { transform: 'translate(-10px,' + to + 'px)' }], o);
      return a.finished.then(function () { setSilk(web, to); a.cancel(); b.cancel(); });
    };
    /* A draught, not a pendulum: a gust that builds, flutters and dies, at
       uneven moments.

       It used to rotate the whole silk, thread and spider together, as one
       rigid piece -- which kept the strand dead straight however hard the
       gust, and a straight line swinging from a pin reads as a pendulum,
       not as silk in moving air. What the breeze actually catches is the
       spider: it swings out, tilts with its abdomen kicked downwind, and
       pulls the strand into a bow behind it. See TILT and REACH inside.

       None of that can be done with a transform -- no rotation bends a
       line -- so for the length of a gust the thread is a path redrawn
       each frame and the spider is placed at its end. That is a few
       seconds of main-thread work every minute or two, against the
       compositor transform it replaces: a fair price for the one thing on
       the face meant to look as if it is moving through air. Straight and
       scaled again the moment the gust and the swing home are over.

       The path is drawn with fill="none", and has to be. SVG fills a path
       unless told otherwise, closing an open one back to its start to do
       it; straight, the thread enclosed nothing and it never mattered,
       but bent, the whole sliver between the bow and the chord was
       painted solid and the strand looked as if it were swelling. */
    var drift = function () {
      /* One gust: it builds over the first third, then dies away. The
         whole thing is a handful of smooth functions of time, because it
         used to be twelve keyframes with a random angle and a jittered
         moment each, and however gently they were blended the swing
         changed its mind every second or so. Wind has flutter in it, but
         flutter is a ripple on a swing, not a new swing.

         Twelve to eighteen degrees at the height of it. */
      var dur = rand(7000, 11000), dirn = Math.random() < 0.5 ? -1 : 1, A = rand(12, 18);
      var f1 = rand(1.4, 2.2), f2 = rand(4, 6), p1 = rand(0, 6.283), p2 = rand(0, 6.283);
      var swing = function (u) {
        var env = u < 0.3 ? (function (x) { return x * x * (3 - 2 * x); })(u / 0.3) : Math.pow(1 - (u - 0.3) / 0.7, 1.4);
        var flutter = 0.8 + 0.14 * Math.sin(6.283 * f1 * u + p1) + 0.06 * Math.sin(6.283 * f2 * u + p2);
        return dirn * A * env * flutter;
      };

      var path = web.thread.querySelector('path'), body = web.spider.querySelector('svg');
      var L = web.len, t0 = performance.now();

      /* What the breeze catches is the spider, and mostly the back of it:
         the abdomen hangs below the head, where the thread holds on, so a
         gust swings the body out and kicks the abdomen out further,
         tilting the spider about the point it hangs from. Blown right, its
         back end goes right. It tilts a beat behind the swing because the
         abdomen has weight: TILT is degrees of lean per degree of swing,
         FOLLOW how fast it catches up, per frame. */
      var TILT = 2.2, FOLLOW = 0.07, lean = 0;

      /* And the strand bows out downwind behind it, from the web down.
         The control point of the curve is carried out past the spider by
         BOW times the spider's own swing, and sits a little above half
         way, so the curve leaves the anchor at a lean, bellies out, and
         comes back in to the spider's head. The bow is proportional to
         the swing, so it is nothing at rest and most at the height of the
         gust. Earlier cuts had it at a fraction of the swing, which on an
         0.8px line over 140px is a bow nobody can see. */
      var BOW = 1.2, WAIST = 0.45;

      var straighten = function () {
        path.setAttribute('d', 'M0 0V1');
        body.style.transform = '';
        setSilk(web, L);
      };
      return new Promise(function (done) {
        (function frame(now) {
          // Stopped mid-gust -- a new station, the face changed -- put it back straight and go.
          if (rig.web !== web || web.gen !== gen) { straighten(); done(); return; }
          var u = Math.min(1, (now - t0) / dur);
          var deg = swing(u), th = deg * Math.PI / 180;
          var ex = L * Math.sin(th), ey = L * Math.cos(th);
          var cx = ex * 0.5 + ex * BOW, cy = ey * WAIST;
          web.thread.style.transform = 'none';
          path.setAttribute('d', 'M0 0Q' + cx.toFixed(2) + ' ' + cy.toFixed(2) + ' ' + ex.toFixed(2) + ' ' + ey.toFixed(2));
          web.spider.style.transform = 'translate(' + (ex - 10).toFixed(2) + 'px,' + ey.toFixed(2) + 'px)';
          /* Swung right is a positive angle, and the abdomen hangs below
             the point the body turns about -- so turning it out to the
             right is a clockwise turn, the same sign as the swing. The
             first cut had this the other way and the spider leaned into
             the wind. */
          lean += (deg * TILT - lean) * FOLLOW;
          body.style.transform = 'rotate(' + lean.toFixed(2) + 'deg)';
          // Not done until the abdomen has swung home as well.
          if (u < 1 || Math.abs(lean) > 0.25) requestAnimationFrame(frame);
          else { straighten(); done(); }
        })(t0);
      });
    };
    web.busy = true;
    /* Down in two goes, with a pause between: part way, then on to
       wherever it has decided to stop, and never past the bottom of the
       glass.

       Where it stops is one of the gaps fitWeb worked out, taken at
       random -- above the tag line or below it, or below the status
       under that -- and then a random spot within whichever gap it drew,
       so two visits to the same gap do not look like the same visit. */
    var disp = rig.tuner.querySelector('.display');
    var floor = (disp ? disp.clientHeight : 300) - (web.top || 0) - 24;
    var deep, halfway = null;
    if (web.rests && web.rests.length && web.restTop != null) {
      /* One of the two, and exactly there: it was asked to come to rest
         just above the tag or just below it, not somewhere in a range. */
      var pick = Math.floor(Math.random() * web.rests.length);
      var toLen = function (bt) { return Math.min(floor, Math.max(SILK_REST + 10, web.restLen + (bt - web.restTop))); };
      /* A delta from where it is hanging now, which is the one thing
         about its position that is known to be true. */
      deep = toLen(web.rests[pick]);
      /* On its way to the lower of the two it stops at the upper one
         first -- the only place on the way down that is clear of the
         writing. On its way to the upper one it does not stop at all. */
      if (web.rests.length > 1 && pick === web.rests.length - 1) halfway = toLen(web.rests[0]);
    } else {
      deep = Math.min(floor, Math.max(SILK_REST + 40, (web.below || 0) - (web.top || 0) + 4));
    }
    /* Down in one go, or in two with a pause above the tag line. It
       used to pause wherever forty to sixty-five percent of the way
       happened to fall, which on this face is in front of the station's
       name -- a stop of up to three and a half seconds over the very
       thing it is meant to stay off. A face with no tag line keeps the
       old fraction, since there is no clear spot to name instead. */
    var first = halfway !== null ? halfway
      : (web.rests && web.rests.length ? deep : SILK_REST + (deep - SILK_REST) * rand(0.4, 0.65));
    return Promise.resolve().then(function () { return let_(first, rand(7, 11)); }).then(live)
      .then(function () { return first === deep ? null : wait(rand(1200, 3500)); }).then(live)
      .then(function () { return first === deep ? null : let_(deep, rand(7, 11)); }).then(live)
      .then(drift).then(live)
      .then(function () { return wait(rand(800, 2500)); }).then(live)
      /* And home again, by the same rule as the way down. It used to stop
         part way up -- thirty-five to sixty percent of the climb -- which
         was in front of the station's name; now, coming up from below the
         tag, it stops at the clear spot above it, and coming up from
         there it climbs straight home. A face with no tag line keeps
         the old fraction. */
      .then(function () {
        web.spider.classList.add('is-climbing');
        var stop = halfway !== null ? halfway
          : (web.rests && web.rests.length ? SILK_REST : SILK_REST + (web.len - SILK_REST) * rand(0.35, 0.6));
        return let_(stop, rand(12, 16), stop === SILK_REST ? 'ease-out' : 'linear');
      }).then(live)
      .then(function () {
        web.spider.classList.remove('is-climbing');
        return web.len === SILK_REST ? null : wait(rand(600, 1500));
      }).then(live)
      .then(function () {
        if (web.len === SILK_REST) return null;
        web.spider.classList.add('is-climbing');
        return let_(SILK_REST, rand(12, 16), 'ease-out');
      })
      .then(function () {
        web.spider.classList.remove('is-climbing');
        web.busy = false;
        web.next = Date.now() + rand(40, 120) * 1000;
      }, function (e) { if (e !== ABORT && !(e && e.name === 'AbortError')) throw e; });
  }

  /* Once a second, with the scenes: on the Halloween face the web is
     fitted to the name and the spider kept; anywhere else, both gone. The
     spider only moves while it can be seen and motion is allowed. */
  function spiderTick(rig) {
    if (themeOf(rig.tuner) !== 'halloween') { spiderOff(rig); return; }
    var web = spiderOn(rig);
    if (!web) return;
    fitWeb(rig, web);
    if (web.busy || document.hidden || (reduced && reduced.matches) || Date.now() < web.next) return;
    spiderDrop(rig, web);
  }

  function tick() {
    rigs.forEach(function (rig) {
      spiderTick(rig);
      var cast = syncFace(rig);
      if (!cast || !active(rig) || rig.busy) return;
      rig.smallIn -= TICK;
      rig.bigIn -= TICK;
      if (cast.big && rig.bigIn <= 0) {
        rig.bigIn = nextBig(false);
        rig.smallIn = Math.max(rig.smallIn, 20000);
        play(rig, cast.big);
      } else if (rig.smallIn <= 0) {
        rig.smallIn = nextSmall(cast);
        // Not the same small scene twice running, where there is a choice.
        var pool = cast.small.filter(function (n) { return n !== rig.last || cast.small.length === 1; });
        rig.last = pool[Math.floor(Math.random() * pool.length)];
        play(rig, rig.last);
      }
    });
  }

  /* April's bed of tulips, one element each so each can rise on its own
     (the stylesheet moves them; hidden on every other face). The four
     drawings repeat along the row, each weighted like a bar of the mini
     radio's meter, fixed rather than random, so it is the same bed every
     time. More than the widest set needs; the bed clips the rest. */
  var TULIPS = [
    [16, 'M9 26C8 16 12 12 12.5 17L16 11L19.5 17C20 12 24 16 23 26C22 33 10 33 9 26Z', '#e0527a', 31, 'M16 70Q4 58 7 46Q13 58 16 64Z'],
    [44, 'M37 34C36 24 40 20 40.5 25L44 19L47.5 25C48 20 52 24 51 34C50 41 38 41 37 34Z', '#f2c14e', 39, 'M44 72Q56 60 53 48Q47 60 44 66Z'],
    [74, 'M67 22C66 12 70 8 70.5 13L74 7L77.5 13C78 8 82 12 81 22C80 29 68 29 67 22Z', '#a98bd6', 27, 'M74 68Q62 56 65 44Q71 56 74 62Z'],
    [102, 'M95 30C94 20 98 16 98.5 21L102 15L105.5 21C106 16 110 20 109 30C108 37 96 37 95 30Z', '#f07a5a', 35, 'M102 72Q114 60 111 48Q105 60 102 66Z']
  ];
  function plantBed(tuner) {
    var meter = tuner.querySelector('.meter');
    if (!meter || meter.querySelector('.sp-bed')) return;
    var bed = document.createElement('span'), html = '';
    bed.className = 'sp-bed';
    bed.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 48; i++) {
      var t = TULIPS[i % 4], w = 0.55 + 0.45 * Math.abs(Math.sin(i * 2.399963));
      html += '<span class="sp-tulip" style="--w:' + w.toFixed(3) + '"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 76">' +
        '<g transform="translate(' + (15 - t[0]) + ' 0)">' +
        '<path d="M' + t[0] + ' ' + t[3] + 'V76" stroke="#4f9a5a" stroke-width="2.2" stroke-linecap="round"/>' +
        '<path d="' + t[4] + '" fill="#4f9a5a"/><path d="' + t[1] + '" fill="' + t[2] + '"/></g></svg></span>';
    }
    bed.innerHTML = html;
    meter.appendChild(bed);
    // The ground the duck walks on, in front of the bed and behind the grass.
    var yard = document.createElement('span');
    yard.className = 'sp-yard';
    yard.setAttribute('aria-hidden', 'true');
    meter.appendChild(yard);
    /* Clouds, drifting across behind the rain: the higher smaller, paler
       and slower. Each keeps to a height band of its own, their paces are
       close enough that one seldom overtakes another, and they start spread
       evenly across the sky, a little differently every time -- so they
       seldom sit on top of one another. */
    var disp = tuner.querySelector('.display');
    if (disp && !disp.querySelector('.sp-sky')) {
      var sky = document.createElement('span'), clouds = '';
      sky.className = 'sp-sky';
      sky.setAttribute('aria-hidden', 'true');
      for (var c = 0; c < 3; c++) {
        var dur = [125, 110, 95][c] * rand(0.95, 1.05);
        clouds += '<span class="sp-cloud" style="--ct:' + ([4, 30, 58][c] + rand(-2, 2)).toFixed(0) + 'px;--cw:' +
          ([80, 105, 130][c] * rand(0.92, 1.08)).toFixed(0) + 'px;--co:' + [0.55, 0.7, 0.85][c] +
          ';--cd:' + dur.toFixed(0) + 's;--cdel:-' + ((c / 3 + rand(0, 0.1)) * dur).toFixed(0) + 's"></span>';
      }
      // And heavier ones that only come over in a downpour (.sp-pour).
      for (var sc = 0; sc < 4; sc++) {
        var sdur = rand(55, 62);
        clouds += '<span class="sp-cloud sp-storm" style="--ct:' + ([-6, 24, 4, 34][sc] + rand(-3, 3)).toFixed(0) + 'px;--cw:' +
          rand(150, 200).toFixed(0) + 'px;--co:.95;--cd:' + sdur.toFixed(0) + 's;--cdel:-' + ((sc / 4 + rand(0, 0.06)) * sdur).toFixed(0) + 's"></span>';
      }
      sky.innerHTML = clouds;
      disp.appendChild(sky);
    }
  }

  function adopt(tuner) {
    for (var i = 0; i < rigs.length; i++) if (rigs[i].tuner === tuner) return rigs[i];
    plantBed(tuner);
    var rig = { tuner: tuner, stage: null, busy: false, gen: 0, face: undefined, last: null };
    rigs.push(rig);
    return rig;
  }

  /* April's puddle takes each beat as a ring thrown out to its edge. A beat
     is --bass (app.js writes it on the meter each frame) jumping up from one
     frame to the next -- it rises at once and falls away slowly -- no oftener
     than a beat could come. A fixed threshold did not do: measured live, one
     track's beats peaked at 0.5-1.0 and the next one's at 0.17-0.41. For the
     same reason a ring's brightness is the beat against the loudest of the
     last few seconds, not an absolute. A frame loop, run only while an April
     set is playing and stopped when none is. */
  var BEAT_JUMP = 0.08, BEAT_MIN = 0.12, BEAT_GAP = 180, beatLoop = false;
  function beatRing(meter, v) {
    var r = document.createElement('span');
    r.className = 'st-beatring';
    meter.appendChild(r);
    r.animate([{ transform: 'scale(.12)', opacity: 0.45 + v * 0.55 }, { transform: 'scale(1)', opacity: 0 }],
      { duration: 1300, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' }).finished.then(function () { r.remove(); }, function () { r.remove(); });
  }
  function beats(now) {
    var any = false;
    rigs.forEach(function (rig) {
      if (themeOf(rig.tuner) !== 'spring' || !active(rig)) { rig.bassWas = 0; return; }
      any = true;
      var m = rig.meterEl || (rig.meterEl = rig.tuner.querySelector('.meter'));
      if (!m) return;
      var v = parseFloat(m.style.getPropertyValue('--bass')) || 0;
      var was = rig.bassWas || 0;
      rig.bassPeak = Math.max(v, (rig.bassPeak || 0) * 0.995);
      if (v - was > BEAT_JUMP && v > BEAT_MIN && !(now - (rig.beatAt || 0) < BEAT_GAP)) {
        rig.beatAt = now;
        beatRing(m, Math.min(1, v / Math.max(0.2, rig.bassPeak)));
      }
      rig.bassWas = v;
    });
    if (any) requestAnimationFrame(beats); else beatLoop = false;
  }
  function watchBeats() {
    if (beatLoop) return;
    if (!rigs.some(function (rig) { return themeOf(rig.tuner) === 'spring' && active(rig); })) return;
    beatLoop = true;
    requestAnimationFrame(beats);
  }

  /* April's volume knob is a daisy that rolls along the slider as it
     moves, and the stylesheet can only turn it by a value it can read: the
     slider's, as --v (0-100), kept on the slider. Checked often as well as
     on input, since a schedule slot, the wheel or the double-click glide
     set the value without an event. */
  function watchVolume() {
    Array.prototype.forEach.call(document.querySelectorAll('.fader.volume input'), function (el) {
      var max = Number(el.max) || 100, v = (Number(el.value) / max * 100).toFixed(1);
      if (el.__v !== v) { el.__v = v; el.style.setProperty('--v', v); }
    });
  }

  /* Halloween's lightning is CSS, on two slow loops; this only moves it. A
     loop starts or comes round with the bolt dark, a good while before it
     strikes, so a new place set then is never seen to jump. */
  function moveBolt(e) {
    if (!/^hw-(bolt|storm-[ab])$/.test(e.animationName)) return;
    e.target.style.setProperty('--hw-x', (4 + Math.random() * 92).toFixed(1) + '%');
    e.target.style.setProperty('--hw-h', (58 + Math.random() * 28).toFixed(1) + '%');
  }

  /* The bats cross on a CSS loop too. Each time it starts or comes round,
     with the flock still off the left of the set, a new flock is drawn for
     the next crossing: two to five of them, spread out across the strip at
     different heights and sizes, wings out of step. */
  function batSvg(x, y, k, lag) {
    var t = function (vals) { return '<animateTransform attributeName="transform" type="' + vals + '" calcMode="spline" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1" begin="-' + lag + 's" dur=".34s" repeatCount="indefinite"/>'; };
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + k + ')"><g>' +
      t('translate" values="0 0;0 1.6;0 0') +
      '<path d="M1.5-2C6-7 12-9 20-6C17-3.5 16-.5 17 3C14 1 11 1.5 9 4.5C7 1.8 4 1.2 1.5 2.5Z">' + t('rotate" values="-38 1.5 -1;30 1.5 -1;-38 1.5 -1') + '</path>' +
      '<path d="M-1.5-2C-6-7-12-9-20-6C-17-3.5-16-.5-17 3C-14 1-11 1.5-9 4.5C-7 1.8-4 1.2-1.5 2.5Z">' + t('rotate" values="38 -1.5 -1;-30 -1.5 -1;38 -1.5 -1') + '</path>' +
      '<ellipse cx="0" cy="0" rx="2.6" ry="4.4"/><circle cx="0" cy="-4.6" r="2.3"/><path d="M-2-5.6L-2.7-9.4L-.5-6.6ZM2-5.6L2.7-9.4L.5-6.6Z"/></g></g>';
  }
  function newFlock(e) {
    if (e.animationName !== 'hw-bats') return;
    // Never the same number twice running: one of the other three.
    var last = e.target.batCount || 3, n = 2 + Math.floor(Math.random() * 3), bats = '';
    if (n >= last) n++;
    e.target.batCount = n;
    for (var i = 0; i < n; i++) {
      var x = 34 + i * 232 / (n - 1) + rand(-10, 10), k = rand(0.95, 1.65);
      bats += batSvg(x.toFixed(1), (rand(22, 66)).toFixed(1), k.toFixed(2), rand(0, 0.34).toFixed(2));
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 90" fill="#080407">' + bats + '</svg>';
    e.target.style.setProperty('--hw-bats', 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")');
  }

  function start() {
    Array.prototype.forEach.call(document.querySelectorAll('.tuner'), adopt);
    document.addEventListener('animationstart', newFlock, true);
    document.addEventListener('animationiteration', newFlock, true);
    document.addEventListener('animationstart', moveBolt, true);
    document.addEventListener('animationiteration', moveBolt, true);
    setInterval(tick, TICK);
    setInterval(watchBeats, TICK);
    watchVolume();
    document.addEventListener('input', watchVolume, true);
    setInterval(watchVolume, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  /* Each face's letters, with Shift, send for its big scene: W K R P on
     Autumn Gobble, N O E L on Noel, and only on that face. Held together,
     or typed in order with Shift down -- plenty of keyboards cannot report
     five keys at once. Not from inside a text field, where they are a word.
     A request outranks the dice: it plays whether or not a station is on. */
  var held = {}, typed = '', typedAt = 0;
  var LETTERS = Object.keys(CAST).map(function (f) { return CAST[f].combo || ''; }).join('');
  function inField(el) {
    return !!(el && el.closest && el.closest('input:not([type="range"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]'));
  }
  window.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    if (!e.shiftKey || k.length !== 1 || LETTERS.indexOf(k) === -1 || inField(e.target)) return;
    held[k] = true;
    var now = Date.now();
    if (now - typedAt > 2500) typed = '';
    typedAt = now;
    if (!e.repeat) typed = (typed + k).slice(-8);
    for (var i = 0; i < rigs.length; i++) {
      // Only a set that is on screen: the preview page hides the others.
      if (!rigs[i].tuner.offsetParent) continue;
      var cast = syncFace(rigs[i]);
      if (!cast) continue;
      var c = cast.combo;
      if (!c) continue;
      var all = c.split('').every(function (ch) { return held[ch]; });
      if (all || typed.slice(-c.length) === c) {
        held = {}; typed = '';
        if (rigs[i].busy) clear(rigs[i]);
        play(rigs[i], cast.big);
        break;
      }
    }
  });
  window.addEventListener('keyup', function (e) {
    var k = (e.key || '').toLowerCase();
    if (k === 'shift') { held = {}; typed = ''; } else delete held[k];
  });
  window.addEventListener('blur', function () { held = {}; typed = ''; });

  /* For the preview page, which has buttons to run a scene on demand. */
  window.DesksideSeasonal = {
    play: function (name, within) {
      var tuner = within && within.closest ? (within.closest('.face') || document).querySelector('.tuner') : document.querySelector('.tuner');
      if (!tuner) return;
      var rig = adopt(tuner);
      syncFace(rig);
      if (rig.busy) clear(rig);
      play(rig, name);
    }
  };
})();
