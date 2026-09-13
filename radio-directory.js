/* Deskside Radio — station lookup.

   Two public services, both free and both CORS-open:
     - open-meteo geocoding turns a city name into coordinates
     - radio-browser.info lists stations, with a stream URL it has resolved
   Pure helpers live at the top so they can be unit tested; the two fetch
   wrappers at the bottom are the only part that touches the network. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Directory = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
  var DIRECTORY = 'https://de2.api.radio-browser.info/json/stations/search';

  // Station colours for the editorial theme, kept clear of each other.
  var PALETTE = ['#10307a', '#e11d74', '#0f6b4f', '#a8321c', '#5b2a86', '#0b6a86', '#8a6a12', '#3b3f8f'];
  function pickColour(index) { return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length]; }

  function geocodeUrl(city) {
    return GEOCODE + '?count=6&language=en&format=json&name=' + encodeURIComponent(String(city || '').trim());
  }

  // Either a name, a place, or both. Nothing at all is not a search.
  function searchUrl(opts) {
    opts = opts || {};
    var name = String(opts.name == null ? '' : opts.name).trim();
    var hasPlace = typeof opts.lat === 'number' && typeof opts.lon === 'number';
    if (!name && !hasPlace) return null;

    var q = ['hidebroken=true', 'order=votes', 'reverse=true', 'limit=' + (opts.limit || 25)];
    if (name) q.push('name=' + encodeURIComponent(name));
    if (opts.countryCode) q.push('countrycode=' + encodeURIComponent(opts.countryCode));
    if (hasPlace) {
      q.push('geo_lat=' + opts.lat);
      q.push('geo_long=' + opts.lon);
      q.push('geo_distance=' + Math.round((opts.radiusKm || 60) * 1000));
    }
    return DIRECTORY + '?' + q.join('&');
  }

  /* What the audio element is being handed. HLS used to belong on the same
     side of this line as .pls and .m3u — it does not any more: current
     desktop browsers, Chrome included, play an HLS playlist off the element
     with no library. A .pls or .m3u is still a text file listing streams
     rather than a stream, so it genuinely has nothing to play. */
  function streamKind(url, hlsFlag) {
    if (hlsFlag) return 'hls';
    var path = String(url || '').split('?')[0].toLowerCase();
    if (/\.m3u8$/.test(path)) return 'hls';
    if (/\.(pls|m3u|asx|xspf)$/.test(path)) return 'playlist';
    return 'direct';
  }

  function cleanName(raw) {
    return String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  }

  /* Frequency out of a piece of text, e.g. 'KISS 92.5' -> '92.5 FM'.
     Strict mode requires the band to be spelled out, which is what tags
     need: "90s" and "top 40" are a decade and a chart, not frequencies. */
  function bandFromName(text, strict) {
    var m = /(\d{2,3}(?:\.\d)?)\s*(?:fm)\b/i.exec(text);
    if (m) return m[1] + ' FM';
    m = /(\d{3,4})\s*(?:am|khz)\b/i.exec(text);
    if (m) return m[1] + ' AM';
    if (strict) return '';
    // No band word: infer from the number itself.
    m = /(?:^|[^\d.])(\d{2,4}(?:\.\d)?)(?![\d.])/.exec(text);
    if (!m) return '';
    var v = parseFloat(m[1]);
    if (v >= 87.5 && v <= 108) return m[1] + ' FM';
    if (v >= 530 && v <= 1700 && m[1].indexOf('.') === -1) return m[1] + ' AM';
    return '';
  }

  /* North American call signs are three or four letters starting with C,
     K, W or X, sometimes carrying a -FM or -AM suffix. radio-browser has
     no field for them, but its own names carry them in capitals often
     enough to read: "CFRB News/Talk 1010", "CFNY 102.1 The Edge".

     Only the name is searched. Tags are lowercase free text, where a
     four-letter entry like "kids" or "kpop" would match the same shape and
     be wrong every time.

     Network acronyms are the same shape and are not call signs: CBC Radio
     1 Toronto is CBLA-FM, not CBC. A brand can be too — KISS 92.5 is
     CKIS-FM — but that one cannot be told apart by shape, so it is left
     to the caller, which drops any sign the name already opens with. */
  var NOT_A_CALL_SIGN = /^(CBC|CTV|CBS|CNN)$/;

  function callSignFrom(result) {
    var m = /\b([CKWX][A-Z]{2,3}(?:-(?:FM|AM|TV))?)\b/.exec(cleanName(result && result.name));
    if (!m) return '';
    return NOT_A_CALL_SIGN.test(m[1].replace(/-(?:FM|AM|TV)$/, '')) ? '' : m[1];
  }

  // The name is the reliable source; the tags are a second chance.
  function bandFrom(result) {
    if (!result) return '';
    return bandFromName(result.name || '') || bandFromName(result.tags || '', true);
  }

  /* A .pls or .m3u is a pointer to a stream, not a stream. Both are plain
     text and both put the address on a line of its own, so one reader covers
     them: File1= and friends in a .pls, and in an .m3u the first line that is
     not a # comment. ASX and XSPF are XML and are not handled here; they fall
     through and fail the way they always did.

     The lowest-numbered File entry wins rather than the first one seen, since
     a .pls is not obliged to list them in order. */
  function parsePlaylist(text) {
    var lines = String(text == null ? '' : text).split(/\r?\n/);
    var bestNum = Infinity, best = '', firstUrl = '';
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === '#') continue;
      var m = /^File(\d+)\s*=\s*(\S+)$/i.exec(line);
      if (m && /^https?:\/\//i.test(m[2])) {
        var n = parseInt(m[1], 10);
        if (n < bestNum) { bestNum = n; best = m[2]; }
      } else if (!firstUrl && /^https?:\/\/\S+$/i.test(line)) {
        firstUrl = line;
      }
    }
    return best || firstUrl || '';
  }

  /* The one rendition to hand the browser out of an HLS master playlist, or
     '' when the text is not a master at all. Chrome plays HLS itself, and
     given the master it starts on the lowest bitrate and steps up once it
     has measured the connection. CBC's master lists every bitrate twice, on
     two CDN paths, and those are packaged separately: their live windows
     sit some seconds apart, so the step-up lands on the other path and the
     listener hears the last few seconds over again. Handed one media
     playlist there is nothing to switch to.

     The highest bandwidth wins, and on a tie the one listed first, which
     keeps whichever path the master leads with. A URI relative to the
     master is resolved against it. */
  function pickHlsVariant(text, masterUrl) {
    var lines = String(text == null ? '' : text).split(/\r?\n/);
    var best = '', bestBw = -1, pending = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (/^#EXT-X-STREAM-INF:/i.test(line)) {
        var m = /BANDWIDTH=(\d+)/i.exec(line);
        pending = m ? parseInt(m[1], 10) : 0;
        continue;
      }
      if (line.charAt(0) === '#' || pending === null) continue;
      if (pending > bestBw) {
        bestBw = pending;
        try { best = new URL(line, masterUrl).href; } catch (e) { best = line; }
      }
      pending = null;
    }
    return best;
  }

  function normalizeStation(result, index) {
    if (!result) return null;
    var resolved = String(result.url_resolved || '').trim();
    var raw = String(result.url || '').trim();
    // Prefer https: a plain-http stream is blocked on any hosted page.
    var url = resolved;
    if (!url) url = raw;
    else if (/^http:/i.test(resolved) && /^https:/i.test(raw)) url = raw;
    if (!url) return null;

    var name = cleanName(result.name);
    var kind = streamKind(url, result.hls);
    var bits = [];
    if (result.codec && !/^unknown$/i.test(result.codec)) bits.push(result.codec);
    if (result.bitrate) bits.push(result.bitrate + ' kbps');
    if (result.state) bits.push(result.state);
    else if (result.country) bits.push(result.country);

    return {
      id: 'rb_' + (result.stationuuid || Math.random().toString(36).slice(2, 10)),
      name: name,
      band: bandFrom(result),
      callSign: callSignFrom(result),
      tag: bits.join(' · '),
      url: url,
      colour: pickColour(index || 0),
      kind: kind,
      playable: kind !== 'playlist',
      distanceKm: typeof result.geo_distance === 'number' ? Math.round(result.geo_distance / 1000) : null,
      lat: typeof result.geo_lat === 'number' ? result.geo_lat : null,
      lon: typeof result.geo_long === 'number' ? result.geo_long : null,
      region: result.state || '',
      favicon: result.favicon || '',
      homepage: result.homepage || ''
    };
  }

  // The directory lists the same stream under several names.
  function dedupe(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (s) {
      if (!s) return;
      var key = s.url.replace(/^https?:/i, '').replace(/\/+$/, '');
      if (seen[key]) return;
      seen[key] = true;
      out.push(s);
    });
    return out;
  }

  /* Pressing "Add station" leaves an empty row waiting to be filled in.
     A station chosen from the search belongs in that row, not underneath
     it. Only a wholly empty row counts, so half-typed entries survive. */
  function placeStation(list, incoming) {
    var out = (list || []).slice();
    for (var i = 0; i < out.length; i++) {
      var row = out[i] || {};
      if (!String(row.name || '').trim() && !String(row.url || '').trim()) {
        out[i] = incoming;
        return out;
      }
    }
    out.push(incoming);
    return out;
  }

  /* Retrying forever is right for a stream that has dropped and wrong for
     one this player cannot sustain: the listener just hears the same few
     buffered seconds replay on every attempt. Note that beginning is not
     proof of anything. Edge reports an HLS playlist as playing for a few
     seconds before it stalls, so the caller passes whether the stream has
     ever held up for a sustained run, not whether it ever started. */
  var GIVE_UP_AFTER = 6;

  /* Judge a stream by whether it plays, never by its file extension. Edge
     plays HLS perfectly well, and an earlier version of this refused a
     working CBC stream on the strength of a .m3u8 in its URL. */
  function hopelessReason(url, everSustained, attempts) {
    if (everSustained) return null;
    if (attempts >= GIVE_UP_AFTER) return 'Cannot play this stream';
    return null;
  }

  function toHex(r, g, b) {
    return '#' + [r, g, b].map(function (n) {
      var h = Math.max(0, Math.min(255, Math.round(n))).toString(16);
      return h.length < 2 ? '0' + h : h;
    }).join('');
  }

  /* The brand colour of a station logo. Logos are mostly white padding and
     black type, so those are skipped along with anything too grey to be a
     brand colour; what is left is bucketed and the biggest bucket wins. */
  function dominantColour(data) {
    if (!data || !data.length) return null;
    var buckets = {}, best = null, bestCount = 0;
    for (var i = 0; i + 3 < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      var r = data[i], g = data[i + 1], b = data[i + 2];
      var hi = Math.max(r, g, b), lo = Math.min(r, g, b);
      if (hi > 235 && lo > 235) continue;   // paper white
      if (hi < 25) continue;                // ink black
      if (hi - lo < 28) continue;           // grey, not a brand colour
      var key = (r >> 5) + ':' + (g >> 5) + ':' + (b >> 5);
      var bucket = buckets[key] || (buckets[key] = { n: 0, r: 0, g: 0, b: 0 });
      bucket.n++; bucket.r += r; bucket.g += g; bucket.b += b;
      if (bucket.n > bestCount) { bestCount = bucket.n; best = bucket; }
    }
    if (!best) return null;
    return toHex(best.r / best.n, best.g / best.n, best.b / best.n);
  }

  /* Reading pixels needs the logo host to allow it. Plenty will not, so
     this resolves to null rather than failing and the palette colour stands. */
  function logoColour(url) {
    return new Promise(function (resolve) {
      if (!url || typeof Image === 'undefined') return resolve(null);
      var settled = false;
      var finish = function (v) { if (!settled) { settled = true; resolve(v); } };
      setTimeout(function () { finish(null); }, 4000);
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onerror = function () { finish(null); };
      img.onload = function () {
        try {
          var size = 32;
          var cv = document.createElement('canvas');
          cv.width = size; cv.height = size;
          var ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0, size, size);
          finish(dominantColour(ctx.getImageData(0, 0, size, size).data));
        } catch (e) { finish(null); }   // tainted canvas
      };
      img.src = url;
    });
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    var R = 6371, toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(a))) * 10) / 10;
  }

  /* Most directory entries carry no coordinates, so a strict geographic
     query throws away the very stations people are looking for. Search
     wide, then sort: nearby first, then the same region, then the rest. */
  function rankByPlace(list, place) {
    var items = (list || []).slice();
    if (!place) return items;
    var radius = place.radiusKm || 60;
    var region = String(place.region || '').toLowerCase();

    items.forEach(function (s, i) {
      s._i = i;
      if (typeof s.lat === 'number' && typeof s.lon === 'number' && (s.lat || s.lon)) {
        s.distanceKm = Math.round(haversineKm(place.lat, place.lon, s.lat, s.lon));
      }
      var nearby = typeof s.distanceKm === 'number' && s.distanceKm <= radius;
      s.tier = nearby ? 0 : (region && String(s.region || '').toLowerCase() === region ? 1 : 2);
    });

    items.sort(function (a, b) {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.tier === 0) return a.distanceKm - b.distanceKm;
      return a._i - b._i;
    });
    items.forEach(function (s) { delete s._i; });
    return items;
  }

  // ---- network ----
  function getJson(url, signal) {
    return fetch(url, { signal: signal, headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function findCities(city, signal) {
    var url = geocodeUrl(city);
    return getJson(url, signal).then(function (d) {
      return ((d && d.results) || []).map(function (r) {
        return {
          label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
          lat: r.latitude, lon: r.longitude,
          region: r.admin1 || '', countryCode: r.country_code || ''
        };
      });
    });
  }

  /* With a name to go on, search by name across the country and rank by
     distance afterwards. With only a city, a geographic query is the only
     way to enumerate what is nearby. */
  function findStations(opts, signal) {
    opts = opts || {};
    var named = !!String(opts.name || '').trim();
    var place = (typeof opts.lat === 'number' && typeof opts.lon === 'number')
      ? { lat: opts.lat, lon: opts.lon, region: opts.region, radiusKm: opts.radiusKm || 60 } : null;

    var query = { name: opts.name, limit: opts.limit };
    if (named) { if (opts.countryCode) query.countryCode = opts.countryCode; }
    else if (place) { query.lat = place.lat; query.lon = place.lon; query.radiusKm = place.radiusKm; }

    var url = searchUrl(query);
    if (!url) return Promise.resolve([]);
    return getJson(url, signal).then(function (rows) {
      var list = dedupe((rows || []).map(function (r, i) { return normalizeStation(r, i); }));
      return rankByPlace(list, place);
    });
  }

  return {
    PALETTE: PALETTE, pickColour: pickColour,
    geocodeUrl: geocodeUrl, searchUrl: searchUrl,
    streamKind: streamKind, parsePlaylist: parsePlaylist, pickHlsVariant: pickHlsVariant,
    bandFromName: bandFromName, callSignFrom: callSignFrom, bandFrom: bandFrom, normalizeStation: normalizeStation, dedupe: dedupe,
    haversineKm: haversineKm, rankByPlace: rankByPlace,
    placeStation: placeStation, dominantColour: dominantColour, logoColour: logoColour,
    hopelessReason: hopelessReason,
    findCities: findCities, findStations: findStations
  };
});
