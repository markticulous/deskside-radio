const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../radio-directory.js');

const near = (a, b, tol = 0.001) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

// ---------- request builders ----------

test('geocodeUrl escapes the city and asks for a short list', () => {
  const u = new URL(D.geocodeUrl('St. John’s'));
  assert.equal(u.origin + u.pathname, 'https://geocoding-api.open-meteo.com/v1/search');
  assert.equal(u.searchParams.get('name'), 'St. John’s');
  assert.ok(Number(u.searchParams.get('count')) > 0);
});

test('searchUrl sends a plain name query when no city is chosen', () => {
  const u = new URL(D.searchUrl({ name: 'kiss 92.5' }));
  assert.equal(u.searchParams.get('name'), 'kiss 92.5');
  assert.equal(u.searchParams.get('hidebroken'), 'true');
  assert.equal(u.searchParams.get('geo_lat'), null);
});

test('searchUrl adds a geographic filter once a city is chosen', () => {
  const u = new URL(D.searchUrl({ name: '1010', lat: 43.70643, lon: -79.39864, radiusKm: 60 }));
  assert.equal(u.searchParams.get('name'), '1010');
  near(Number(u.searchParams.get('geo_lat')), 43.70643);
  near(Number(u.searchParams.get('geo_long')), -79.39864);
  assert.equal(u.searchParams.get('geo_distance'), '60000');
});

test('searchUrl refuses a query with neither a name nor a place', () => {
  assert.equal(D.searchUrl({}), null);
  assert.equal(D.searchUrl({ name: '   ' }), null);
});

// ---------- result mapping ----------

const RESULT = {
  stationuuid: 'abc-123',
  name: 'CKIS "KISS 92.5" Toronto, ON',
  url: 'http://rogers-hls.leanstream.co/rogers/tor925.stream/play',
  url_resolved: 'https://rogers-hls.leanstream.co/rogers/tor925.stream/play',
  codec: 'AAC+', bitrate: 47, hls: 0, state: 'Ontario', countrycode: 'CA', geo_distance: 7043
};

test('streamKind separates direct audio from playlists and HLS', () => {
  assert.equal(D.streamKind('https://x.example/live.mp3', 0), 'direct');
  assert.equal(D.streamKind('https://x.example/stream', 0), 'direct');
  assert.equal(D.streamKind('https://x.example/live.m3u8', 0), 'hls');
  assert.equal(D.streamKind('https://x.example/live', 1), 'hls');
  assert.equal(D.streamKind('https://x.example/listen.pls', 0), 'playlist');
  assert.equal(D.streamKind('https://x.example/listen.m3u', 0), 'playlist');
});

test('normalizeStation keeps the resolved URL and reads the band out of the name', () => {
  const s = D.normalizeStation(RESULT);
  assert.equal(s.url, 'https://rogers-hls.leanstream.co/rogers/tor925.stream/play');
  assert.equal(s.band, '92.5 FM');
  assert.equal(s.playable, true);
  assert.equal(s.distanceKm, 7);
  assert.ok(s.id.length > 0);
  assert.ok(/AAC\+/.test(s.tag) && /47/.test(s.tag));
});

test('normalizeStation prefers a secure URL when the resolved one is plain http', () => {
  const s = D.normalizeStation(Object.assign({}, RESULT, {
    url: 'https://secure.example/live.mp3',
    url_resolved: 'http://secure.example/live.mp3'
  }));
  assert.equal(s.url, 'https://secure.example/live.mp3');
});

test('normalizeStation treats an HLS station as playable', () => {
  // Browsers caught up: Chrome plays an HLS playlist off the audio element,
  // so flagging these as unplayable was turning away working stations.
  const s = D.normalizeStation(Object.assign({}, RESULT, { hls: 1 }));
  assert.equal(s.playable, true);
  assert.equal(s.kind, 'hls');
});

test('normalizeStation still marks a playlist file unplayable', () => {
  // A .pls lists streams; it is not one, so the element has nothing to play.
  const s = D.normalizeStation(Object.assign({}, RESULT, {
    url: 'https://x.example/listen.pls', url_resolved: 'https://x.example/listen.pls', hls: 0
  }));
  assert.equal(s.playable, false);
  assert.equal(s.kind, 'playlist');
});

test('normalizeStation tidies a quoted callsign name and survives missing fields', () => {
  assert.equal(D.normalizeStation({ name: '  CBC Radio 1 Toronto  ', url: 'https://a/b' }).name, 'CBC Radio 1 Toronto');
  const bare = D.normalizeStation({ url: 'https://a/b' });
  assert.equal(bare.band, '');
  assert.equal(bare.distanceKm, null);
});

test('normalizeStation drops a result with no usable URL', () => {
  assert.equal(D.normalizeStation({ name: 'Ghost' }), null);
  assert.equal(D.normalizeStation(null), null);
});

// ---------- de-duplication and ranking ----------

test('dedupe removes stations that resolve to the same stream', () => {
  const list = [RESULT, Object.assign({}, RESULT, { stationuuid: 'dup', name: 'KISS 92.5' })]
    .map(D.normalizeStation);
  const out = D.dedupe(list);
  assert.equal(out.length, 1);
});

test('dedupe keeps genuinely different stations and drops nulls', () => {
  const other = D.normalizeStation(Object.assign({}, RESULT, { stationuuid: 'z', url_resolved: 'https://other/live.mp3' }));
  assert.equal(D.dedupe([D.normalizeStation(RESULT), other, null]).length, 2);
});

// ---------- colour assignment ----------

test('pickColour cycles the palette so a new station never repeats the last one', () => {
  const a = D.pickColour(0), b = D.pickColour(1);
  assert.notEqual(a, b);
  assert.match(a, /^#[0-9a-f]{6}$/i);
  assert.equal(D.pickColour(0), D.pickColour(D.PALETTE.length));
});

// ---------- place-aware ranking ----------

test('searchUrl can narrow by country without demanding coordinates', () => {
  const u = new URL(D.searchUrl({ name: '1010', countryCode: 'CA' }));
  assert.equal(u.searchParams.get('countrycode'), 'CA');
  assert.equal(u.searchParams.get('geo_lat'), null);
});

test('haversineKm measures real ground distance', () => {
  const km = D.haversineKm(43.7064, -79.3986, 43.2557, -79.8711); // Toronto to Hamilton
  assert.ok(km > 55 && km < 72, 'got ' + km);
  assert.equal(D.haversineKm(43.7, -79.4, 43.7, -79.4), 0);
});

test('rankByPlace puts nearby stations first, then same region, then the rest', () => {
  const mk = (name, lat, lon, region) => ({ name, lat, lon, region, url: 'https://x/' + name, distanceKm: null });
  const place = { lat: 43.7064, lon: -79.3986, region: 'Ontario', radiusKm: 60 };
  const far = mk('Vancouver One', 49.2827, -123.1207, 'British Columbia');
  const noCoords = mk('Ontario Somewhere', null, null, 'Ontario');
  const near = mk('Toronto Local', 43.65, -79.38, 'Ontario');
  const out = D.rankByPlace([far, noCoords, near], place);
  assert.deepEqual(out.map(s => s.name), ['Toronto Local', 'Ontario Somewhere', 'Vancouver One']);
  assert.equal(out[0].distanceKm, 6);
  assert.equal(out[1].distanceKm, null);
});

test('rankByPlace leaves the order alone when no place is given', () => {
  const list = [{ name: 'a' }, { name: 'b' }];
  assert.deepEqual(D.rankByPlace(list, null).map(s => s.name), ['a', 'b']);
});

test('normalizeStation carries coordinates and region for later ranking', () => {
  const s = D.normalizeStation({ name: 'Test 90.1', url: 'https://a/b', geo_lat: 43.7, geo_long: -79.4, state: 'Ontario' });
  assert.equal(s.lat, 43.7);
  assert.equal(s.lon, -79.4);
  assert.equal(s.region, 'Ontario');
});

// ---------- placing a found station into the draft list ----------

test('placeStation fills the blank row that Add station created', () => {
  const list = [{ id: 'a', name: 'One', url: 'https://x/1' }, { id: 'blank', name: '', url: '' }];
  const out = D.placeStation(list, { id: 'new', name: 'Found', url: 'https://x/2' });
  assert.equal(out.length, 2);
  assert.equal(out[1].name, 'Found');
  assert.equal(out[1].url, 'https://x/2');
});

test('placeStation appends when every row is already filled', () => {
  const list = [{ id: 'a', name: 'One', url: 'https://x/1' }];
  const out = D.placeStation(list, { id: 'new', name: 'Found', url: 'https://x/2' });
  assert.equal(out.length, 2);
  assert.equal(out[1].name, 'Found');
});

test('placeStation uses only the first blank row and leaves later ones alone', () => {
  const list = [{ name: '', url: '' }, { name: '', url: '' }];
  const out = D.placeStation(list, { id: 'new', name: 'Found', url: 'https://x/2' });
  assert.equal(out[0].name, 'Found');
  assert.equal(out[1].name, '');
});

test('placeStation never overwrites a row someone is part way through typing', () => {
  const list = [{ name: 'Half typed', url: '' }, { name: '', url: '   ' }];
  const out = D.placeStation(list, { id: 'new', name: 'Found', url: 'https://x/2' });
  assert.equal(out[0].name, 'Half typed');
  assert.equal(out[1].name, 'Found');
});

test('placeStation copes with an empty list', () => {
  assert.equal(D.placeStation([], { id: 'n', name: 'F', url: 'https://x' }).length, 1);
});

// ---------- reading a colour off a station logo ----------

const pixels = (colours) => {
  const out = new Uint8ClampedArray(colours.length * 4);
  colours.forEach(([r, g, b, a], i) => {
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = a === undefined ? 255 : a;
  });
  return out;
};
const hexChannels = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

test('dominantColour reads a solid brand colour off the artwork', () => {
  const c = D.dominantColour(pixels(Array(40).fill([225, 29, 116])));
  assert.match(c, /^#[0-9a-f]{6}$/);
  const [r, g, b] = hexChannels(c);
  assert.ok(Math.abs(r - 225) < 12 && Math.abs(g - 29) < 12 && Math.abs(b - 116) < 12, c);
});

test('dominantColour ignores the white and black most logos are padded with', () => {
  const art = Array(60).fill([255, 255, 255]).concat(Array(60).fill([8, 8, 8])).concat(Array(20).fill([16, 90, 200]));
  const [r, g, b] = hexChannels(D.dominantColour(pixels(art)));
  assert.ok(b > r && b > g, 'expected the blue to win, got ' + D.dominantColour(pixels(art)));
});

test('dominantColour returns nothing when there is no colour to find', () => {
  assert.equal(D.dominantColour(pixels(Array(30).fill([250, 250, 250]))), null);
  assert.equal(D.dominantColour(pixels(Array(30).fill([128, 128, 128]))), null);
  assert.equal(D.dominantColour(pixels(Array(30).fill([200, 30, 30, 0]))), null);
  assert.equal(D.dominantColour(new Uint8ClampedArray(0)), null);
  assert.equal(D.dominantColour(null), null);
});

test('dominantColour picks the most common colour, not simply the first', () => {
  const art = Array(10).fill([20, 160, 60]).concat(Array(70).fill([200, 40, 40]));
  const [r, g, b] = hexChannels(D.dominantColour(pixels(art)));
  assert.ok(r > g && r > b, 'expected the red to win');
});

// ---------- knowing when a stream will never play ----------

test('hopelessReason keeps retrying a normal stream that has simply dropped', () => {
  assert.equal(D.hopelessReason('https://x/live.mp3', false, 1), null);
  assert.equal(D.hopelessReason('https://x/live.mp3', false, 4), null);
});

test('hopelessReason judges a stream by whether it plays, not by its extension', () => {
  // Edge plays HLS. Refusing a .m3u8 on sight rejected a working station.
  assert.equal(D.hopelessReason('https://x/live.m3u8', false, 1), null);
  assert.equal(D.hopelessReason('https://x/listen.pls', false, 1), null);
});

test('hopelessReason gives up on any stream that never once started', () => {
  assert.match(D.hopelessReason('https://x/live.mp3', false, 6), /cannot play/i);
});

test('hopelessReason never gives up on a stream that has held up before', () => {
  // Once a stream has run for a sustained spell, a failure is an outage and the
  // watchdog should keep going. Merely starting does not count: a half-working
  // stream reports itself as playing for a few seconds before it stalls.
  assert.equal(D.hopelessReason('https://x/live.m3u8', true, 9), null);
  assert.equal(D.hopelessReason('https://x/live.mp3', true, 40), null);
});

// ---------- finding the frequency wherever the directory hides it ----------

test('bandFrom reads the frequency out of the station name first', () => {
  assert.equal(D.bandFrom({ name: 'KISS 92.5' }), '92.5 FM');
  assert.equal(D.bandFrom({ name: 'CFRB News/Talk 1010 (Toronto, ON)' }), '1010 AM');
});

test('bandFrom falls back to the tags when the name carries no frequency', () => {
  assert.equal(D.bandFrom({ name: 'CBC Radio 1 Toronto', tags: 'news,talk,99.1 fm' }), '99.1 FM');
  assert.equal(D.bandFrom({ name: 'Some Station', tags: 'oldies,680 am' }), '680 AM');
});

test('bandFrom will not invent a frequency out of a decade or a chart position', () => {
  // "90s" and "top 40" are not 90 FM and 40 FM.
  assert.equal(D.bandFrom({ name: 'Retro Gold', tags: '90s,80s,hits' }), '');
  assert.equal(D.bandFrom({ name: 'Chart Radio', tags: 'top 40,pop' }), '');
  assert.equal(D.bandFrom({ name: 'CBC Radio 1 Toronto', tags: 'news,talk' }), '');
});

test('bandFrom copes with missing fields', () => {
  assert.equal(D.bandFrom({}), '');
  assert.equal(D.bandFrom(null), '');
});

test('normalizeStation uses the tags when the name has no frequency', () => {
  const s = D.normalizeStation({ name: 'CBC Radio 1 Toronto', url: 'https://a/b', tags: 'news,99.1 fm' });
  assert.equal(s.band, '99.1 FM');
});
