/* Now playing: which station addresses get a song lookup, and under what
   name. The lookup knows a station by its mount, and a wrong mount is not
   an error anyone sees -- the tagline just never changes -- so the forms a
   StreamTheWorld address comes in are pinned here. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = js.indexOf('  function tritonMount(url) {');
const end = js.indexOf('\n  }\n', start) + 4;
// eslint-disable-next-line no-new-func
const tritonMount = new Function(js.slice(start, end) + '\nreturn tritonMount;')();

test('a StreamTheWorld address is looked up by its mount', () => {
  const cases = {
    'https://playerservices.streamtheworld.com/api/livestream-redirect/CKFMFM.mp3': 'CKFMFM',
    'https://playerservices.streamtheworld.com/api/livestream-redirect/CKFMFMAAC.aac': 'CKFMFMAAC',
    'https://16693.live.streamtheworld.com/CKFMFM_SC': 'CKFMFM',
    'https://16693.live.streamtheworld.com/CKFMFM.mp3?dist=web': 'CKFMFM',
    'https://playerservices.streamtheworld.com/api/livestream-redirect/cfrbam.mp3': 'CFRBAM'
  };
  Object.keys(cases).forEach((u) => assert.strictEqual(tritonMount(u), cases[u], u));
});

test('anything else is left alone, and keeps its tagline', () => {
  [
    'https://az1.mediacp.eu/listen/100coverslounge/radio.mp3',
    'https://cbcradiolive.akamaized.net/hls/live/2041036/ES_R1ETR/master.m3u8',
    'http://newcap.leanstream.co/CHBMFM',
    '',
    undefined
  ].forEach((u) => assert.strictEqual(tritonMount(u), null, String(u)));
});

test('the lookup runs only while a station is playing', () => {
  assert.ok(/if \(s === 'live' && was !== 'live'\) npPoll\(\);/.test(js),
    'starting to play no longer starts the lookup');
  assert.ok(/if \(!link \|\| status !== 'live'\) return;/.test(js),
    'the lookup no longer stops itself when nothing is playing');
  assert.ok(/if \(gen !== npGen \|\| status !== 'live'\) return;/.test(js),
    'an answer to an earlier station is shown on this one');
});

/* Which source each kind of address goes to. A wrong match is silent --
   the tagline just never changes -- so the shapes are pinned here. */
const fnSrc = (name) => {
  const a = js.indexOf('  function ' + name + '(');
  return js.slice(a, js.indexOf('\n  }\n', a) + 4);
};
// eslint-disable-next-line no-new-func
const corusMount = new Function(fnSrc('corusMount') + '\nreturn corusMount;')();
// eslint-disable-next-line no-new-func
const azuraApi = new Function(fnSrc('azuraApi') + '\nreturn azuraApi;')();
// eslint-disable-next-line no-new-func
const icecastStatus = new Function(fnSrc('helperCan').replace(/^  function helperCan[^\n]*\n?/, js.match(/  function helperCan[^\n]*/)[0] + '\n') + fnSrc('icecastStatus') + '\nreturn icecastStatus;')();

test('Corus streams are looked up by their leanstream name', () => {
  assert.strictEqual(corusMount('http://live.leanstream.co/CILQFM'), 'CILQFM');
  assert.strictEqual(corusMount('http://live.leanstream.co/CFNYFM-MP3'), 'CFNYFM');
  assert.strictEqual(corusMount('https://live.leanstream.co/CFOXFM-AAC?x=1'), 'CFOXFM');
  assert.strictEqual(corusMount('https://rogers-hls.leanstream.co/rogers/tor925.stream/playlist.m3u8'), null);
  assert.strictEqual(corusMount('https://playerservices.streamtheworld.com/api/livestream-redirect/CKFMFM.mp3'), null);
});

test('AzuraCast and Icecast stations are asked at their own server', () => {
  assert.strictEqual(azuraApi('https://az1.mediacp.eu/listen/100coverslounge/radio.mp3'),
    'https://az1.mediacp.eu/api/nowplaying/100coverslounge');
  assert.strictEqual(azuraApi('http://live.leanstream.co/CILQFM'), null);
  assert.strictEqual(icecastStatus('http://ice.example.org:8000/live.mp3'), 'http://ice.example.org:8000/status-json.xsl');
  assert.strictEqual(icecastStatus('https://x.example/hls/master.m3u8'), null);
});

test('sources are tried broadcaster feeds first, the helper last', () => {
  assert.ok(/var NP_SOURCES = \[ROGERS_SRC, TRITON_SRC, CORUS_SRC, AZURA_SRC, ICECAST_SRC, HELPER\];/.test(js),
    'the order of the sources has changed');
  assert.ok(/frame\.setAttribute\('sandbox', 'allow-scripts'\);/.test(js),
    'the Corus file, a script, is no longer run in a sealed frame');
});

test('a song on the tagline line stays one line in every face', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'app.css'), 'utf8');
  assert.ok(/\.display-tag\.is-song \{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis;/.test(css),
    'a long title can wrap, add a line to the readout and set the window refitting');
});

test('a Rogers stream is looked up by its call letters', () => {
  const a = js.indexOf('  var ROGERS = {');
  const b = js.indexOf('\n  }\n', js.indexOf('  function rogersCall(url) {')) + 4;
  // eslint-disable-next-line no-new-func
  const rogersCall = new Function(js.slice(a, b) + '\nreturn rogersCall;')();
  assert.strictEqual(rogersCall('https://rogers-hls.leanstream.co/rogers/tor925.stream/playlist.m3u8'), 'CKIS');
  assert.strictEqual(rogersCall('https://rogers-hls.leanstream.co/rogers/tor981.stream/playlist.m3u8?environment=web'), 'CHFI');
  assert.strictEqual(rogersCall('https://rogers-hls.leanstream.co/rogers/xyz123.stream/playlist.m3u8'), null);
  assert.strictEqual(rogersCall('http://newcap.leanstream.co/CHBMFM'), null);
});

/* Titles sent in capitals are shown in title case; anything with a small
   letter in it is the station's own spelling and is left alone. */
test('a title sent in capitals is put into title case', () => {
  const a = js.indexOf('  var SMALL_WORDS');
  const b = js.indexOf('  var shownSong');
  // eslint-disable-next-line no-new-func
  const tidy = new Function(js.slice(a, b) + '\nreturn tidyCase;')();
  const cases = {
    'CYNDI LAUPER — TIME AFTER TIME': 'Cyndi Lauper — Time After Time',
    'BILLY OCEAN — CARIBBEAN QUEEN (NO MORE LOVE ON THE RUN)': 'Billy Ocean — Caribbean Queen (No More Love on the Run)',
    'SURVIVOR — EYE OF THE TIGER': 'Survivor — Eye of the Tiger',
    'U2 — WITH OR WITHOUT YOU': 'U2 — With or Without You',
    'AC/DC — BACK IN BLACK': 'AC/DC — Back in Black',
    'R.E.M. — LOSING MY RELIGION': 'R.E.M. — Losing My Religion',
    'PAUL MCCARTNEY — LIVE AND LET DIE': 'Paul McCartney — Live and Let Die',
    "SINEAD O'CONNOR — NOTHING COMPARES 2 U": "Sinead O'Connor — Nothing Compares 2 U",
    'ABBA — DANCING QUEEN': 'ABBA — Dancing Queen',
    "DON'T STOP BELIEVIN'": "Don't Stop Believin'",
    'Kenn Colt / Adam Pickard — Dreams': 'Kenn Colt / Adam Pickard — Dreams',
    'Sabrina Carpenter — Bed Chem': 'Sabrina Carpenter — Bed Chem'
  };
  Object.keys(cases).forEach((t) => assert.strictEqual(tidy(t), cases[t], t));
});

/* On a chunked (HLS) stream the title can run well ahead of the audio,
   so a change is held back by how far behind live the player is. */
test('a song change on a chunked stream waits for the audio to catch up', () => {
  assert.ok(/var lag = npSong && next !== npSong \? streamLag\(\) : 0;/.test(js),
    'song changes are no longer held back on streams that play behind live');
  assert.ok(/if \(!npHeld \|\| npHeld\.song !== next\)/.test(js),
    'every ask restarts the wait, so on a stream further behind than the asking interval the song never changes');
  assert.ok(/if \(!a \|\| !\/\\.m3u8/.test(js), 'the hold applies to continuous streams as well');
});
