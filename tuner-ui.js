/* Deskside Radio — shared tuner drawing: dial scales, VU face, spectrogram, name fitting.
   Consumed by both the app (app.js) and the design preview page. */
(function (root) {
  'use strict';
  var S = root.Signal;
  var SVG = 'http://www.w3.org/2000/svg';

  var VU_R = 82;          // arc radius
  /* Inside the ticks, not among them. A major tick reaches in to VU_R-12,
     which is 70, and a figure centred at 65 puts its own box across that
     -- so -20 and +3 were printed touching the marks they belong to.
     61 is as far out as they go: the binding pair is -20 and +3, whose
     boxes turn with the ray and reach their own tick corner-first, and
     the four numerals read as belonging to their marks rather than
     floating below them. */
  var VU_LABEL_R = 61;    // where the printed numbers sit
  var VU_NEEDLE_R = 76;

  /* The card, and every layer printed on it. Narrower than the drawing
     area and carried further below the pivot: the sweep is 104 degrees,
     so the corners either side of the arc were always empty card, while
     the movement's own tail -- Marconi's counterweight, at pivot + 14 --
     sat past the bottom edge and was cut off by it.

     The bottom edge lands at 123, which is the tail's own 122 plus one:
     that spike is the lowest thing drawn, and it is what stops this
     number coming down any further.

     Nothing inside moves. VU_R, VU_PIVOT and the needle are untouched,
     and the viewBox keeps its 200 units across, so the scale, the ticks
     and the pointer are drawn at exactly the size they were. */
  var VU_BOX = { x: 12, y: 2, width: 176, height: 121, rx: 6 };

  function svg(tag, attrs) {
    var e = document.createElementNS(SVG, tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
    return e;
  }
  function themeOf(el) {
    var n = el && el.closest ? el.closest('[data-theme]') : null;
    return n ? n.getAttribute('data-theme') : '';
  }

  // ---- dial scale: ticks and labels placed at their true frequency ----
  function buildScale(scaleEl) {
    var kind = scaleEl.getAttribute('data-scale');
    var ticks = S.scaleTicks(kind);
    if (!ticks.length) return;

    var tickBox = scaleEl.querySelector('.scale-ticks');
    var labelBox = scaleEl.querySelector('.scale-labels');
    tickBox.textContent = '';
    labelBox.textContent = '';

    ticks.forEach(function (t) {
      var i = document.createElement('i');
      i.className = t.major ? 'tick is-major' : 'tick';
      i.style.left = t.pct + '%';
      tickBox.appendChild(i);
      if (t.label !== null) {
        var s = document.createElement('span');
        s.textContent = t.label;
        s.style.left = t.pct + '%';
        labelBox.appendChild(s);
      }
    });
  }

  // Restart a one-shot animation that may already be running.
  function replay(el, cls, ms, key) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    clearTimeout(el[key]);
    el[key] = setTimeout(function () { el.classList.remove(cls); }, ms);
  }

  /* Point the needle at a station. Crossing between AM and FM rolls the
     band label, sweeps a glint along the newly lit scale, and sends the
     needle travelling in from the side the other band sits on. */
  function setNeedle(tunerEl, bandText) {
    var band = S.parseBand(bandText);
    var next = band ? band.kind : '';
    var prev = tunerEl.getAttribute('data-band-kind') || '';
    var changed = !!(prev && next && prev !== next);
    tunerEl.setAttribute('data-band-kind', next);
    if (changed) replay(tunerEl, 'band-change', 900, '_bandTimer');

    var scales = tunerEl.querySelectorAll('[data-scale]');
    Array.prototype.forEach.call(scales, function (scale) {
      var kind = scale.getAttribute('data-scale');
      var on = !!band && kind === next;
      var needle = scale.querySelector('.needle');
      var wasOn = scale.classList.contains('is-active');

      if (on) {
        var pct = S.dialPercent(kind, band.value);
        if (changed && needle) {
          needle.style.transition = 'none';
          needle.style.setProperty('--pos', (next === 'fm' ? 0 : 100) + '%');
          void needle.offsetWidth;
          needle.style.transition = '';
          replay(scale, 'is-sweeping', 900, '_sweepTimer');
          requestAnimationFrame(function () { needle.style.setProperty('--pos', pct + '%'); });
        } else if (needle) {
          needle.style.setProperty('--pos', pct + '%');
        }
        scale.classList.add('is-active');
      } else {
        // Send the outgoing needle off the far edge as it fades.
        if (changed && wasOn && needle) needle.style.setProperty('--pos', (next === 'fm' ? 100 : 0) + '%');
        scale.classList.remove('is-active');
      }
    });
    return band;
  }

  // ---- VU face, drawn from the same geometry the needle uses ----
  /* Gradient stops carry classes, not colours, so the themes keep owning
     the palette. The ids carry a counter because the preview page puts
     four faces on the screen at once and duplicate ids would collide. */
  var faceSeq = 0;
  function gradient(tag, id, attrs, stops) {
    attrs.id = id;
    var g = svg(tag, attrs);
    stops.forEach(function (st) { g.appendChild(svg('stop', { class: st[0], offset: st[1] })); });
    return g;
  }

  /* Every layer of the card is the same rectangle: paper, lamp, vignette
     and the sheen over the print. They are drawn as separate rects so the
     gradients can stack, and any one of them a pixel out from the others
     shows as a seam along an edge. */
  function card(cls, gradientId) {
    return svg('rect', {
      class: cls, x: VU_BOX.x, y: VU_BOX.y, width: VU_BOX.width, height: VU_BOX.height,
      rx: VU_BOX.rx, fill: 'url(#' + gradientId + ')'
    });
  }

  function buildVuFace(host) {
    var marks = S.vuMarks();
    var pivot = S.VU_PIVOT;
    var p0 = S.vuPoint(S.vuAngle(0), VU_R), p1 = S.vuPoint(S.vuAngle(1), VU_R);
    var zero = marks.filter(function (m) { return m.vu === 0; })[0];
    var pz = S.vuPoint(zero.angle, VU_R);
    var uid = 'vu' + (++faceSeq);

    var face = svg('svg', { viewBox: '0 0 200 125', 'aria-hidden': 'true' });

    /* Lit from above: card stock graded light to warm, a darkened rim, a
       sheen across the glass, and a real cast shadow under the needle. */
    var defs = svg('defs', {});
    defs.appendChild(gradient('linearGradient', uid + '-paper', { x1: 0, y1: 0, x2: 0, y2: 1 },
      [['vu-paper-a', '0'], ['vu-paper-b', '1']]));
    /* The lamp behind the card. A meter of this vintage is lit by one small
       bulb sitting in the bottom of the case, below the movement -- so the
       pool is low and tight, brightest along the bottom edge and gone well
       before the top corners, rather than a even wash behind the whole
       scale. The vignette darkening the far corners is the same light
       running out. Themes that want an unlit movement leave the stops
       alone and get nothing. */
    defs.appendChild(gradient('radialGradient', uid + '-lamp', { cx: '.5', cy: '1.02', r: '.66' },
      [['vu-lamp-a', '0'], ['vu-lamp-b', '1']]));
    defs.appendChild(gradient('radialGradient', uid + '-vig', { cx: '.5', cy: '.86', r: '1' },
      [['vu-vig-a', '.5'], ['vu-vig-b', '1']]));
    defs.appendChild(gradient('linearGradient', uid + '-gloss', { x1: 0, y1: 0, x2: 0, y2: 1 },
      [['vu-gloss-a', '0'], ['vu-gloss-b', '.52']]));
    defs.appendChild(gradient('radialGradient', uid + '-pin', { cx: '.36', cy: '.3', r: '.85' },
      [['vu-pin-a', '0'], ['vu-pin-b', '1']]));
    /* The filter sits on the arm, not the needle, so the light keeps coming
       from one place instead of swinging round with the pointer. */
    var cast = svg('filter', { id: uid + '-cast', x: '-40%', y: '-40%', width: '180%', height: '180%' });
    cast.appendChild(svg('feDropShadow', { dx: '1.4', dy: '2.2', stdDeviation: '1.7', 'flood-color': '#3a2a12', 'flood-opacity': '.42' }));
    defs.appendChild(cast);
    face.appendChild(defs);

    face.appendChild(card('vu-face', uid + '-paper'));
    face.appendChild(card('vu-lamp', uid + '-lamp'));
    face.appendChild(card('vu-vignette', uid + '-vig'));
    face.appendChild(svg('path', { class: 'vu-arc', d: 'M' + p0.x + ' ' + p0.y + ' A' + VU_R + ' ' + VU_R + ' 0 0 1 ' + p1.x + ' ' + p1.y }));
    face.appendChild(svg('path', { class: 'vu-red', d: 'M' + pz.x + ' ' + pz.y + ' A' + VU_R + ' ' + VU_R + ' 0 0 1 ' + p1.x + ' ' + p1.y }));

    marks.forEach(function (m) {
      var outer = S.vuPoint(m.angle, VU_R);
      var inner = S.vuPoint(m.angle, m.major ? VU_R - 12 : VU_R - 6.5);
      face.appendChild(svg('line', { class: m.major ? 'vu-tick is-major' : 'vu-tick', x1: outer.x, y1: outer.y, x2: inner.x, y2: inner.y }));
      if (m.label !== null) {
        var lp = S.vuPoint(m.angle, VU_LABEL_R);
        var t = svg('text', { class: 'vu-label', x: lp.x, y: lp.y + 3, 'text-anchor': 'middle' });
        t.textContent = m.label;
        face.appendChild(t);
      }
    });

    // Higher off the pivot than it was, and set a little larger in CSS.
    var vu = svg('text', { class: 'vu-mark', x: pivot.x, y: pivot.y - 27, 'text-anchor': 'middle' });
    vu.textContent = 'VU';
    face.appendChild(vu);

    /* Glass goes over the print but under the needle, which stays crisp.
       It reuses the face rect: a shape of its own would cut a visible seam
       wherever its edge fell while the sheen was still partly opaque. */
    face.appendChild(card('vu-gloss', uid + '-gloss'));

    /* A tapered pointer reads as a machined arm; a straight stroke reads as
       a line. It pivots as a path, which setLevel rotates the same way. */
    var tip = S.vuPoint(0, VU_NEEDLE_R);
    var arm = svg('g', { filter: 'url(#' + uid + '-cast)' });
    var needle = svg('path', { class: 'vu-needle', d:
      'M' + (pivot.x - 1.6) + ' ' + pivot.y +
      ' L' + (pivot.x - 0.5) + ' ' + tip.y +
      ' Q' + pivot.x + ' ' + (tip.y - 1.7) + ' ' + (pivot.x + 0.5) + ' ' + tip.y +
      ' L' + (pivot.x + 1.6) + ' ' + pivot.y + ' Z' });
    needle.style.transformOrigin = pivot.x + 'px ' + pivot.y + 'px';
    arm.appendChild(needle);

    /* Two pieces of deco jewellery for the pointer: a counterweight spike
       behind the pivot and a lozenge part way up the arm, which is what a
       lacquer-and-gold instrument of that period would have been given
       instead of a plain machined arm.

       They carry .vu-needle so setLevel swings them with the pointer -- it
       rotates everything with that class -- and .vu-orn so every theme but
       Marconi can keep them off. Built for all of them rather than only
       when Marconi is showing, because the face is drawn once and the
       theme can change under it without it being drawn again. */
    var ornAt = pivot.y - VU_NEEDLE_R * 0.52;
    [
      // the tail, balancing the arm across the pivot
      'M' + (pivot.x - 1.45) + ' ' + pivot.y +
      ' L' + pivot.x + ' ' + (pivot.y + 14) +
      ' L' + (pivot.x + 1.45) + ' ' + pivot.y + ' Z',
      // and the lozenge riding on it
      'M' + pivot.x + ' ' + (ornAt - 6.4) +
      ' L' + (pivot.x + 3.3) + ' ' + ornAt +
      ' L' + pivot.x + ' ' + (ornAt + 6.4) +
      ' L' + (pivot.x - 3.3) + ' ' + ornAt + ' Z'
    ].forEach(function (d) {
      var orn = svg('path', { class: 'vu-needle vu-orn', d: d });
      orn.style.transformOrigin = pivot.x + 'px ' + pivot.y + 'px';
      arm.appendChild(orn);
    });

    face.appendChild(arm);

    face.appendChild(svg('circle', { class: 'vu-pin', cx: pivot.x, cy: pivot.y, r: 5, fill: 'url(#' + uid + '-pin)' }));
    face.appendChild(svg('circle', { class: 'vu-pin-gloss', cx: pivot.x - 1.5, cy: pivot.y - 1.7, r: 1.5 }));

    host.textContent = '';
    host.appendChild(face);
  }

  // The LED bar's printed scale, positioned to match the bar's own fill.
  function buildMeterScale(el) {
    el.textContent = '';
    S.vuMarks().filter(function (m) { return m.label !== null; }).forEach(function (m) {
      var span = document.createElement('span');
      span.textContent = m.label;
      span.style.left = (S.vuFraction(m.vu) * 100).toFixed(3) + '%';
      el.appendChild(span);
    });
  }

  /* What the level has to touch, worked out once per theme instead of
     sixty times a second. setLevel is the hottest thing in the app -- it
     runs every frame for as long as the radio is on -- so everything in
     it that can be hoisted out of the frame has been.

     --vu is written on the meter rather than on the tuner. A custom
     property inherits, so setting it at the root asked the browser to
     recompute the style of everything underneath: 127 elements a frame,
     measured, which was over half of all the work the page was doing
     while playing. Written on the meter it is around nine.

     And in three themes it is not written at all. Dial and Marconi move
     an SVG needle, Editorial draws a canvas; none of them read --vu from
     CSS, so the whole recalculation was for a value nobody looked at.
     A theme says so with --vu-live: 0 beside the rules that would have
     read it. The default is 1, so a new theme that forgets gets a meter
     that works rather than one that does not. */
  var vu = { tuner: null, meter: null, needles: null, live: true, last: '', scope: null };

  function vuTargets(tunerEl) {
    if (vu.meter && vu.tuner === tunerEl) return vu;
    vu.tuner = tunerEl;
    vu.meter = tunerEl.querySelector('.meter') || tunerEl;
    vu.needles = tunerEl.querySelectorAll('.vu-needle');
    vu.scope = tunerEl.querySelector('.scope');
    vu.last = '';
    vu.live = true;
    try {
      vu.live = getComputedStyle(vu.meter).getPropertyValue('--vu-live').trim() !== '0';
      /* A meter built from cells says how wide one of them is, and the
         level is then snapped to whole ones -- half a lit LED is not
         something a bank of LEDs can do. The step has to be a fraction of
         the bar rather than a length, so it is measured; measured here,
         once when the theme changes, rather than sixty times a second. */
      var cs = getComputedStyle(vu.meter);
      var cell = parseFloat(cs.getPropertyValue('--vu-cell')) || 0;
      var gap = parseFloat(cs.getPropertyValue('--vu-gap')) || 0;
      var bar = tunerEl.querySelector('.meter-bar');
      var w = bar ? bar.clientWidth : 0;

      /* The cells are cut by hard mask stops, and a hard stop lands on a
         device pixel or it is antialiased. At 100% scaling 19px does land
         on one; at 125% it lands on a half pixel four times out of five,
         and each of those cells is painted with a thinner, weaker line
         down one side than its neighbours have. It is not a rounding
         error anyone would find by reading the sheet -- it depends on the
         screen, which the sheet cannot see.

         So the authored lengths are rounded here to whole device pixels,
         and the pattern is shifted by whatever fraction of a pixel the bar
         itself begins on, so that the first edge is aligned as well as
         every edge after it. Rounding is done against --vu-cell and
         --vu-gap, which nothing writes to, so this stays put rather than
         creeping a little further each time it runs. */
      if (bar && cell > 0) {
        var dpr = root.devicePixelRatio || 1;
        var snap = function (px) { return Math.max(1, Math.round(px * dpr)) / dpr; };
        cell = snap(cell);
        bar.style.setProperty('--cell-dp', cell + 'px');
        if (gap > 0) bar.style.setProperty('--gap-dp', snap(gap) + 'px');
        var left = bar.getBoundingClientRect().left * dpr;
        bar.style.setProperty('--cell-origin', (-(left - Math.floor(left)) / dpr).toFixed(4) + 'px');
      }

      if (cell > 0 && w > 0) vu.meter.style.setProperty('--vu-step', (cell / w).toFixed(5));
      else vu.meter.style.removeProperty('--vu-step');
    } catch (e) { /* unreadable: write it, which is the safe way to be wrong */ }
    return vu;
  }

  /* The theme decides all of the above, and changing it changes none of
     the elements, so nothing else would have told us to look again. */
  function refreshMeter(tunerEl) {
    vu.meter = null;
    vuTargets(tunerEl);
  }

  /* Whether the frequency bars are on screen at all. Every theme but
     Editorial has the canvas at display:none, where it is 0 wide for as
     long as that theme is showing -- so the analyser's FFT was being run
     sixty times a second to fill a buffer that was thrown away. */
  function scopeShowing(tunerEl) {
    var t = vuTargets(tunerEl);
    return !!(t.scope && t.scope.clientWidth);
  }

  // Deflect every meter in the tuner to the same level (0..1).
  function setLevel(tunerEl, level) {
    var t = vuTargets(tunerEl);
    if (t.live) {
      var s = level.toFixed(4);
      // Writing the same string again still counts as a mutation.
      if (s !== t.last) { t.last = s; t.meter.style.setProperty('--vu', s); }
    }
    var needles = t.needles;
    if (!needles.length) return;
    var turn = 'rotate(' + S.vuAngle(level) + 'deg)';
    for (var i = 0; i < needles.length; i++) needles[i].style.transform = turn;
  }

  /* ---- level bars ----
     Fixed columns mirrored about a centre line, rising and falling in
     place. Heights come from the frequency bins, spaced logarithmically
     so voice and music get the width rather than the top octave. */
  function scopeState(cv) {
    var w = Math.round(cv.clientWidth), h = Math.round(cv.clientHeight);
    if (!w || !h) return null;
    var st = cv._scope;
    if (!st) st = cv._scope = { ctx: cv.getContext('2d') };
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return st;
  }

  function clearScope(tunerEl) {
    var cv = tunerEl.querySelector('.scope');
    if (!cv || !cv.clientWidth) return;
    var st = scopeState(cv);
    if (!st) return;
    st.ctx.clearRect(0, 0, cv.width, cv.height);
    if (st.bars) for (var i = 0; i < st.bars.length; i++) st.bars[i] = 0;
  }

  var BAR_RISE = 0.55, BAR_FALL = 0.14;

  function drawBars(tunerEl, data) {
    var cv = tunerEl.querySelector('.scope');
    if (!cv || !cv.clientWidth) return;
    var st = scopeState(cv);
    if (!st) return;

    var ctx = st.ctx, w = cv.width, h = cv.height, mid = h / 2;
    var gap = 3;
    var want = Math.max(10, Math.min(56, Math.round(w / 11)));
    if (!st.bars || st.bars.length !== want) st.bars = new Float32Array(want);
    var n = st.bars.length;
    var barWidth = Math.max(2, (w - (n - 1) * gap) / n);

    var bins = data ? data.length : 0;
    var top = Math.max(2, Math.floor(bins * 0.62));
    for (var i = 0; i < n; i++) {
      var value = 0;
      if (bins) {
        var lo = Math.floor(Math.pow(top, i / n));
        var hi = Math.max(lo + 1, Math.floor(Math.pow(top, (i + 1) / n)));
        var sum = 0, count = 0;
        for (var b = lo; b < hi && b < bins; b++) { sum += data[b]; count++; }
        value = count ? (sum / count) / 255 : 0;
      }
      var ease = value > st.bars[i] ? BAR_RISE : BAR_FALL;
      st.bars[i] += (value - st.bars[i]) * ease;
    }

    ctx.clearRect(0, 0, w, h);
    for (var k = 0; k < n; k++) {
      var level = st.bars[k];
      if (level < 0.02) continue;
      var half = Math.max(1, level * (mid - 1));
      ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + level * 0.5).toFixed(3) + ')';
      ctx.fillRect(k * (barWidth + gap), mid - half, barWidth, half * 2);
    }
  }

  // ---- station name: line breaks, then the largest size that fits ----
  /* ---- split-flap ----
     The departures board sets each character in its own flap so the name
     can be turned into place the way the real thing does: every panel
     starts moving at once and they land left to right. The flaps are built
     inside the .name-line span rather than beside it, so fitName still
     counts one line and measures one box. */
  var FLAP_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-';
  var flapRun = 0;

  function buildFlaps(line, text) {
    for (var i = 0; i < text.length; i++) {
      var c = document.createElement('span');
      c.className = 'flap-ch';
      c.setAttribute('data-ch', text.charAt(i));
      c.textContent = text.charAt(i);
      line.appendChild(c);
    }
  }

  /* ---- the console's worn grid ----
     A vacuum display fails one character at a time, because each character
     is its own grid with its own drive. So the flicker is per glyph, and
     the glyphs that do it are fixed: wear is a physical fact about the
     tube, and a weak spot that wandered would read as noise rather than as
     age. They are positions rather than letters for the same reason -- the
     grid stays where it is for as long as one name is on the glass.

     They are drawn again when the station changes, and that is a
     deliberate departure from the physics. A real tube keeps the same weak
     grid for its whole life -- but a readout that always stumbles on the
     third letter stops reading as age after a week and starts reading as a
     fault in that letter. Re-drawn per name, it holds steady for as long
     as anyone is actually looking at it and never becomes a tic.

     The interval is drawn fresh each time rather than run off a keyframe
     cycle. A cycle repeats, and the eye is unreasonably good at finding
     the repeat in something it is not even looking at.

     Between events nothing runs at all, and an event repaints one
     character's glow rather than the whole readout's -- which matters,
     because text-shadow is a paint property and there is no compositor
     shortcut for a glow. */
  var VFD_WEAK = 2;                // how many grids are weak at a time
  var VFD_GAP = [2600, 11600];     // how long until the next stumble
  var VFD_DIP = [40, 110];         // and how long it lasts
  var vfdRun = 0;
  var vfdTimer = null;

  function buildVfdChars(line, text) {
    for (var i = 0; i < text.length; i++) {
      var c = document.createElement('span');
      c.className = 'vfd-ch';
      // pre, or the browser collapses the spaces between the spans away.
      c.style.whiteSpace = 'pre';
      c.textContent = text.charAt(i);
      line.appendChild(c);
    }
  }

  function between(pair) { return pair[0] + Math.random() * (pair[1] - pair[0]); }

  function vfdStop() {
    clearTimeout(vfdTimer);
    vfdTimer = null;
    vfdRun++;
  }

  function vfdFlicker(nameEl) {
    vfdStop();
    var still = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) return;
    var all = nameEl.querySelectorAll('.vfd-ch');
    if (!all.length) return;

    // Spaces have no grid to be weak, so they are not candidates.
    var lit = [];
    for (var i = 0; i < all.length; i++) if (all[i].textContent !== ' ') lit.push(all[i]);
    if (!lit.length) return;
    /* Drawn once per name and then kept, rather than per event: a weak
       spot that moved between stumbles reads as noise across the whole
       readout instead of as two tired grids. */
    var weak = [];
    var pool = lit.slice();
    for (var k = 0; k < VFD_WEAK && pool.length; k++) {
      weak.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
    }
    if (!weak.length) return;

    var run = ++vfdRun;
    function dim(ch, to, ms, then) {
      if (run !== vfdRun) return;
      ch.style.setProperty('--lit', to.toFixed(3));
      setTimeout(function () {
        if (run !== vfdRun) return;
        ch.style.setProperty('--lit', '1');
        if (then) then();
      }, ms);
    }
    function stumble() {
      if (run !== vfdRun) return;
      var ch = weak[(Math.random() * weak.length) | 0];
      dim(ch, 0.5 + Math.random() * 0.3, between(VFD_DIP), function () {
        // A loose drive often catches twice before it settles.
        if (Math.random() < 0.4) {
          setTimeout(function () { dim(ch, 0.7 + Math.random() * 0.2, 28 + Math.random() * 40, next); }, 55 + Math.random() * 80);
        } else next();
      });
    }
    function next() {
      if (run !== vfdRun) return;
      vfdTimer = setTimeout(stumble, between(VFD_GAP));
    }
    next();
  }

  function randomGlyph() {
    return FLAP_GLYPHS.charAt((Math.random() * FLAP_GLYPHS.length) | 0);
  }

  function flapReveal(nameEl) {
    var chars = nameEl.querySelectorAll('.flap-ch');
    if (!chars.length) return;
    // A run number, so a station changed mid-turn abandons the old one
    // instead of two sets of timers fighting over the same panels.
    var run = ++flapRun;
    nameEl.setAttribute('data-flap-run', run);

    /* Emptied first, and in one pass before any of the timers start.

       Each panel used to be left showing its own final letter until its
       turn came round, and the turns are staggered by 45ms -- so a
       thirteen-letter name was painted in full, correct and readable, for
       up to six tenths of a second, and only then scrambled and flipped
       back to what it had already been showing. The board arrived having
       already finished.

       A board that is about to turn is blank, so that is where this one
       starts. The width of each panel is measured off its own letter and
       held while it is empty; without that the line collapses to nothing
       and springs back open as the letters land. */
    for (var m = 0; m < chars.length; m++) {
      var w = chars[m].getBoundingClientRect().width;
      if (w) chars[m].style.minWidth = w.toFixed(2) + 'px';
      chars[m].textContent = '';
    }

    for (var i = 0; i < chars.length; i++) {
      (function (ch, index) {
        var target = ch.getAttribute('data-ch');
        // A blank flap has nothing to show, so it stays as it now is.
        if (target === ' ') { ch.textContent = ' '; return; }
        var left = 3 + (index % 4);          // uneven, so they do not land together
        ch.classList.add('is-flapping');
        var tick = function () {
          if (nameEl.getAttribute('data-flap-run') !== String(run)) return;
          if (left <= 0) {
            ch.textContent = target;
            ch.classList.remove('is-flapping');
            // The panel is carrying its letter again, so it can size itself.
            ch.style.removeProperty('min-width');
            return;
          }
          left -= 1;
          ch.textContent = randomGlyph();
          setTimeout(tick, 60);
        };
        setTimeout(tick, 60 + index * 45);
      })(chars[i], i);
    }
  }

  function setName(nameEl, text) {
    if (!nameEl) return;
    var str = String(text == null ? '' : text);
    var theme = themeOf(nameEl);
    var lines = theme === 'editorial' ? S.splitStationName(str) : [str];
    // Only a real change turns the board. Re-rendering the same name, which
    // a theme switch does, leaves it standing.
    var changed = nameEl.getAttribute('data-name') !== str;
    nameEl.setAttribute('data-name', str);

    nameEl.textContent = '';
    lines.forEach(function (line) {
      var s = document.createElement('span');
      s.className = 'name-line';
      if (theme === 'departures') buildFlaps(s, line);
      else if (theme === 'console') buildVfdChars(s, line);
      else s.textContent = line;
      nameEl.appendChild(s);
    });
    fitName(nameEl);

    var still = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (theme === 'departures' && changed && !still) flapReveal(nameEl);
    // Re-armed on every name, and stopped the moment another theme takes
    // the readout, or its timer would go on firing at glyphs that are gone.
    if (theme === 'console') vfdFlicker(nameEl); else vfdStop();
  }

  // Widest line and total line height, taken from the lines themselves.
  function contentSize(el) {
    var w = 0, h = 0;
    for (var i = 0; i < el.children.length; i++) {
      var r = el.children[i].getBoundingClientRect();
      if (r.width > w) w = r.width;
      h += r.height;
    }
    return { w: w, h: h };
  }

  /* A line box tighter than the glyphs does not contain them: ink spills
     above the first line and below the last, and an overflow-hidden box
     shears whatever spills. Line boxes alone therefore report a fit that
     visibly clips. Canvas reports the real ink extents of the face actually
     in use, which is the only dependable way to know where the type ends. */
  var INK_EM = 1.3;   // fallback allowance if canvas metrics are unavailable
  var inkCtx;

  function inkExtents(el, px, cs) {
    if (inkCtx === undefined) {
      var cv = document.createElement('canvas');
      inkCtx = cv.getContext ? cv.getContext('2d') : null;
    }
    if (!inkCtx || !el.children.length) return null;
    inkCtx.font = (cs.fontStyle || 'normal') + ' ' + (cs.fontWeight || '400') + ' ' + px + 'px ' + cs.fontFamily;
    var first = inkCtx.measureText(el.children[0].textContent);
    var last = inkCtx.measureText(el.children[el.children.length - 1].textContent);
    if (typeof first.fontBoundingBoxAscent !== 'number') return null;
    return {
      fontAscent: first.fontBoundingBoxAscent,
      fontDescent: first.fontBoundingBoxDescent,
      inkAscent: first.actualBoundingBoxAscent,
      inkDescent: last.actualBoundingBoxDescent
    };
  }

  /* Height is only a constraint where the theme hands the name a fixed box,
     which is exactly where it also sets --fit-max. Everywhere else the box
     grows with its content, so testing height compares a number with itself
     and every candidate size fails. */
  function fitsAt(el, px, boxed) {
    el.style.fontSize = px + 'px';
    var c = contentSize(el);
    if (c.w > el.clientWidth + 0.5) return false;
    if (!boxed) return true;

    var cs = getComputedStyle(el);
    var lineHeight = parseFloat(cs.lineHeight) || px;
    var lines = el.children.length || 1;
    var box = el.clientHeight;
    if (lines * lineHeight > box + 0.5) return false;

    var ink = inkExtents(el, px, cs);
    if (!ink) {
      var ratio = lineHeight / px;
      var slack = ratio < INK_EM ? (INK_EM - ratio) * px : 0;
      return c.h + slack <= box + 0.5;
    }

    // Where the lines actually sit, so this holds whatever the alignment.
    var blockTop = el.children[0].getBoundingClientRect().top - el.getBoundingClientRect().top;
    var halfLeading = (lineHeight - (ink.fontAscent + ink.fontDescent)) / 2;
    var firstBaseline = blockTop + halfLeading + ink.fontAscent;
    var inkTop = firstBaseline - ink.inkAscent;
    var inkBottom = firstBaseline + (lines - 1) * lineHeight + ink.inkDescent;
    return inkTop >= -0.5 && inkBottom <= box + 0.5;
  }

  /* ---- one line that will not fit: tighten it, or move it ----
     A line that overruns by less than a character is not worth moving for.
     The travel is a twitch rather than a scroll, it never stops, and the
     eye reads it as a fault. Tightening the tracking by a fraction of a
     pixel per gap absorbs that much and nobody sees it. Past what tracking
     can absorb, it scrolls, on the same measurement either way.

     Both sides of this are shared with the preset buttons, which had the
     same twitch on a name a few pixels too wide. */
  var MAX_SQUEEZE_EM = 0.04;
  /* ...but never more than this, whatever the size. Quoted per em, the
     budget scales with the face: at 22px a theme absorbed three times the
     overrun an 8px one did, so the same name slid in one theme and was
     silently tracked-in in another. The complaint was that console did not
     scroll; it did, only later than everywhere else. */
  var MAX_SQUEEZE_PX = 0.34;

  /* The thing that actually moves. A display name is already built as one
     or more .name-line blocks, which are the right shape for it. Anything
     else -- a preset button, whose text is bare -- gets a wrapper, and
     only while it is scrolling: text-overflow: ellipsis does not apply to
     a child element, so a permanent wrapper would cost every overflowing
     name its ellipsis. */
  function runnersOf(el) {
    var lines = el.getElementsByClassName('name-line');
    if (lines.length) return Array.prototype.slice.call(lines);
    var run = el.querySelector(':scope > .scroll-run');
    if (!run) {
      run = document.createElement('span');
      run.className = 'scroll-run';
      while (el.firstChild) run.appendChild(el.firstChild);
      el.appendChild(run);
    }
    return [run];
  }

  function unwrapRun(el) {
    var run = el.querySelector(':scope > .scroll-run');
    if (!run) return;
    while (run.firstChild) el.insertBefore(run.firstChild, run);
    run.remove();
  }

  function clearFit(el) {
    if (!el) return;
    el.classList.remove('can-scroll');
    el.style.letterSpacing = '';
    el.style.removeProperty('--marquee-by');
    el.style.removeProperty('--marquee-ms');
    var lines = el.getElementsByClassName('name-line');
    for (var i = 0; i < lines.length; i++) lines[i].style.animationTimingFunction = '';
    unwrapRun(el);
  }

  /* The travel is 46% of the cycle -- 12% to 58% of the keyframes -- and
     the rest is the pause at each end. Both speeds below are quoted for
     the travel and converted here, so changing the keyframes does not
     quietly change the pace. */
  /* The outward share of name-marquee's cycle, 12% to 58%. Only the
     stepped path needs it, and the stepped path is only ever a display
     name, so this tracks that one keyframe block and not preset-marquee,
     which spends a different share of its cycle travelling. */
  var TRAVEL_SHARE = 0.46;
  var STEP_MS = 230;           // one flap, on a board
  var PRESET_SLOWER = 1.4;     // a button's name, against the readout's

  /* `paceBySteps` is what tells a flap from a pitch. A board is paced by
     its flaps, because the flap is the event -- one every 230ms reads as a
     mechanism. A name quantised to a dot grid is not a mechanism; it is a
     slide that happens to land on whole dots, and pacing 116 six-pixel
     dots at 230ms each would take the best part of a minute to cross. */
  function startScroll(el, by, steps, paceBySteps) {
    el.classList.add('can-scroll');
    el.style.setProperty('--marquee-by', '-' + by.toFixed(2) + 'px');

    /* A stepped scroll is paced per step; a sliding one per pixel.

       Per pixel, a stepped name took 21 seconds to cross -- one flap every
       470ms, which does not read as a board turning over, it reads as a
       board that has stopped working. A flap every 230ms is brisk enough
       to be a mechanism and slow enough to read.

       The sliding pace is left exactly as it was. It was not what was
       reported and it does not have the same problem: a slide has no
       cadence to get wrong, only a speed, and that one reads fine. */
    /* A preset's name is glanced at rather than watched, and it was still
       going out quicker than it could be taken in. Its cycle is stretched;
       the readout's is left exactly as it was, since that one reads fine
       and was not what was reported. The presets never take the stepped
       path -- that is only ever a display name -- so this only ever
       touches the slide. Stretching the cycle stretches the pauses at
       each end with it, which is no loss on a name you are trying to
       read. */
    var slide = 2600 + by * 28;
    if (el.classList.contains('preset-name')) slide *= PRESET_SLOWER;
    var total = (steps && paceBySteps)
      ? Math.round(steps * STEP_MS / TRAVEL_SHARE)
      : Math.round(slide);
    el.style.setProperty('--marquee-ms', total + 'ms');

    /* The timing function belongs on whatever carries the animation, which
       is the runner and not the box around it. */
    var runners = runnersOf(el);
    for (var i = 0; i < runners.length; i++) {
      runners[i].style.animationTimingFunction = steps ? 'steps(' + steps + ', end)' : '';
    }
  }

  /* Call with the tracking and any previous scroll already cleared, or the
     measurement is of the last fit rather than this one. */
  /* The advance of the first character, measured rather than assumed --
     which is what "a character at a time" has to mean for a face whose
     letters are not all one width. */
  function firstCharWidth(el) {
    var node = el.firstChild;
    while (node && node.nodeType !== 3) node = node.firstChild;
    if (!node || !node.textContent.length) return 0;
    var r = document.createRange();
    r.setStart(node, 0);
    r.setEnd(node, 1);
    var w = r.getBoundingClientRect().width;
    r.detach();
    return w;
  }

  function fitLine(el) {
    if (!el || !el.clientWidth) return;
    var over = el.scrollWidth - el.clientWidth;
    if (over <= 1) return;

    /* A split-flap name has to stay on its cells, so it moves a whole flap
       at a time and steps rather than slides -- which is what a board does
       anyway. Tracking is what sets the cell pitch here, so it cannot be
       borrowed against. */
    var flaps = el.getElementsByClassName('flap-ch');
    if (flaps.length) {
      var pitch = flaps[0].getBoundingClientRect().width;
      var n = pitch > 0 ? Math.ceil(over / pitch) : 1;
      startScroll(el, pitch > 0 ? n * pitch : over, n, true);
      return;
    }

    var cs = getComputedStyle(el);
    var px = parseFloat(cs.fontSize) || 16;
    var gaps = Math.max(1, el.textContent.trim().length - 1);
    var squeeze = over / gaps;
    if (squeeze <= Math.min(MAX_SQUEEZE_EM * px, MAX_SQUEEZE_PX)) {
      el.style.letterSpacing = ((parseFloat(cs.letterSpacing) || 0) - squeeze).toFixed(3) + 'px';
      return;
    }
    /* Anything the tracking cannot absorb moves. There was a floor here,
       below which a short overrun was left to the ellipsis on the grounds
       that a few pixels of drift reads as a fault -- but an ellipsis that
       never resolves reads as a fault too, and worse, because it is the
       app telling you there is more and then not showing it. The twitch
       that floor was guarding against was a stale measurement, and that is
       fixed where it belongs. */
    /* A theme can ask for the name to step rather than slide, so the
       glyphs stay on whatever grid is drawn behind them: the console's
       phosphor dot field, the 8-bit face's own cells. A length is a pitch;
       `char` measures the first glyph, because on an 8-bit face the grid
       is the glyph. */
    var spec = String(cs.getPropertyValue('--scroll-step') || '').trim();
    if (spec) {
      var pitch = spec === 'char' ? firstCharWidth(el) : (parseFloat(spec) || 0);
      if (pitch > 0.5) {
        var steps = Math.ceil(over / pitch);
        startScroll(el, steps * pitch, steps);
        return;
      }
    }
    startScroll(el, over);
  }

  /* Grow to --fit-max where a theme sets one -- editorial, the only theme
     that hands the name a fixed box and wraps inside it. Everywhere else
     the name is a readout on a piece of hardware, and hardware does not
     resize its characters to suit the message: it keeps the size it has
     and moves the message past. */
  function fitName(nameEl) {
    if (!nameEl || !nameEl.textContent.trim()) return;
    nameEl.style.fontSize = '';
    clearFit(nameEl);
    var cs = getComputedStyle(nameEl);
    var cap = parseFloat(cs.getPropertyValue('--fit-max'));
    if (!(cap > 0)) { fitLine(nameEl); return; }
    if (!nameEl.clientWidth) return;
    var hi = cap, lo = 11;
    if (fitsAt(nameEl, hi, true)) return;
    for (var i = 0; i < 16; i++) {
      var mid = (lo + hi) / 2;
      if (fitsAt(nameEl, mid, true)) lo = mid; else hi = mid;
    }
    nameEl.style.fontSize = lo.toFixed(2) + 'px';
  }

  // Keep a name fitted through webfont swaps and container resizes.
  function watchName(nameEl) {
    if (!nameEl) return;
    var box = nameEl.parentElement;
    var last = '';
    var refit = function () { fitName(nameEl); };
    if (root.ResizeObserver && box) {
      new ResizeObserver(function () {
        var key = box.clientWidth + 'x' + box.clientHeight;
        if (key === last) return;
        last = key;
        refit();
      }).observe(box);
    } else {
      root.addEventListener('resize', refit);
    }
    /* Same reason as the preset buttons: fonts.ready settles once, and a
       theme switch starts a load after it. */
    if (document.fonts) {
      if (document.fonts.ready) document.fonts.ready.then(refit);
      if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', refit);
    }
    // And settled over the first second, for the same reason.
    [0, 120, 400, 1200].forEach(function (ms) { setTimeout(refit, ms); });
  }

  // Build the instruments inside one tuner element.
  function init(tunerEl) {
    var scales = tunerEl.querySelectorAll('[data-scale]');
    for (var i = 0; i < scales.length; i++) buildScale(scales[i]);
    var faces = tunerEl.querySelectorAll('.meter-face');
    for (var k = 0; k < faces.length; k++) buildVuFace(faces[k]);
    var meterScales = tunerEl.querySelectorAll('.meter-scale');
    for (var j = 0; j < meterScales.length; j++) buildMeterScale(meterScales[j]);
    watchName(tunerEl.querySelector('.display-name'));
    refreshMeter(tunerEl);
    setLevel(tunerEl, 0);
  }

  root.TunerUI = {
    init: init, buildScale: buildScale, buildVuFace: buildVuFace, buildMeterScale: buildMeterScale,
    setNeedle: setNeedle, setLevel: setLevel, refreshMeter: refreshMeter,
    scopeShowing: scopeShowing, drawBars: drawBars, clearScope: clearScope,
    setName: setName, fitName: fitName, watchName: watchName,
    clearFit: clearFit, fitLine: fitLine
  };
})(window);
