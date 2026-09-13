# Deskside Radio

A desktop internet radio that looks like a radio. Open `index.html` in a browser and it plays — no install, no build step, no account, no server. Stations, a day schedule, four visual themes, and a watchdog that reconnects a dropped stream on its own.

The four themes are laid out side by side in [previews/preview.html](previews/preview.html) — open it in a browser.

## Running it

Download the latest release, unzip it anywhere, and open `index.html`. That is the whole installation.

To put it on the Desktop, double-click **Create Desktop Shortcut.cmd** in the same folder. It writes a proper Windows shortcut carrying the icon of whichever theme you name:

```
"Create Desktop Shortcut.cmd" console
```

With no argument it uses the analogue dial icon. The app's own shortcut button shows the exact line to run, because a web page is not allowed to write a shortcut file itself — Chrome renames `.url` downloads to `.download`, on the grounds that such a file can point anywhere.

### Starting without a click

Browsers refuse to start audio until something on the page has been clicked, which is why opening `index.html` normally with **Play on launch** switched on gets you a *Tap to start* panel rather than a radio.

The shortcut that script writes gets around it. Rather than handing the page to your everyday browser, it launches Chrome — or Edge, on a machine without Chrome — as a window of its own with the autoplay policy lifted, so the radio is playing before you have touched anything:

```
chrome.exe --app="file:///.../index.html"
           --autoplay-policy=no-user-gesture-required
           --user-data-dir="%LOCALAPPDATA%\DesksideRadio\profile"
           --allow-file-access-from-files
```

The separate `--user-data-dir` is not optional: a browser reads these flags once, at startup, so one that is already running would take the page and quietly drop them.

That separate profile is also why the radio opens with nothing in it the first time. To bring your stations, schedule and theme across, export them from **Settings → Service → Export settings** and leave the resulting `deskside-radio-settings.json` beside `index.html`. The first launch reads it once and then keeps its own settings from there. It doubles as a way to ship a machine a ready-made setup.

Two things to know: opening the page the ordinary way still works and still shows the tap panel, and double-clicking the shortcut while the radio is already open gives you a second window playing over the first.

### Starting when you sign in

`Start With Windows.cmd` writes the same shortcut into the Startup folder, and `Start With Windows.cmd off` removes it. Nothing touches the registry and nothing runs as a service; it is one `.lnk` in a folder the user can open with `shell:startup`. The browser detection in it is a deliberate copy of the one in `Create Desktop Shortcut.cmd` rather than shared with it — these are files people double-click, often one without ever having run the other, so each has to stand alone.

macOS has no equivalent script here. A `.webloc` saved from the shortcut button can be added under **System Settings → General → Login Items**, but it opens in the default browser, so the autoplay-policy lift the Windows shortcut relies on is not available and the first play needs a click.

### Browsers

Chrome and Edge are the same engine and behave identically; the launcher falls back to Edge, and the HLS handling above was verified on both. Safari plays everything, including HLS natively, with two differences: it refuses `localStorage` for pages opened over `file://`, so nothing persists unless the folder is served over HTTP; and it never sizes or moves its own window, because `windowIsOurs()` now requires a Chromium user agent as well as a thin window frame. That guard was added deliberately — a Safari window with its toolbar hidden has a frame thin enough to pass the old test, and moving somebody's ordinary browser window about is a rude way to be wrong.

### Window size and position

Chrome does not remember where an `--app` window was: one moved to `420,260` at `760x520` and closed reopens at `10,10` at a size of Chrome's choosing, which was measured rather than assumed. So the app keeps its own box in `state.windowBox`, read off the heartbeat that is already running — dragging a window fires no event of any kind — and again on `pagehide`, and restores it on the next launch, clamped to the screen actually in front of the user.

A restored box is left alone: it is the size the user chose, possibly by hand. Only a theme change refits, because the height then belongs to the new theme rather than to the window the old one was closed in.

The fit itself used to resize the window three times while the user watched. Two causes: it measured with a scrollbar present, which narrows the tuner and so overstates its height, and it ran before the webfonts had landed, which understates it by about eighty pixels. It now measures with the scrollbar suppressed and does not run at all until `document.fonts.ready` has resolved and the preset measurement has settled, with a failsafe in case a font never arrives. First launch: one resize. Every launch after that: none, just the restore.

## What it does

- **Stations.** Any stream URL with a name, frequency, colour and tagline. A built-in finder looks up stations near a city through [radio-browser](https://www.radio-browser.info/), which is public and key-free.
- **Schedule.** Weekday and weekend time slots, each choosing a station and optionally forcing volume, bass, treble or theme when it starts. A slot hands over at its end time: `07:00` to `10:00` runs from `07:00:00` and stops at `10:00:00`, so an adjacent slot starting at `10:00` picks it up cleanly. Overlapping slots are refused on save.
- **Themes.** Analogue dial, broadcast console, Rams minimal, editorial, retro 8-bit, departures board, Marconi deco, Model One. Each has its own desktop icon.
- **Watchdog.** A frozen media clock plus a starved buffer means the stream died; it reconnects with exponential backoff rather than sitting silent.
- **Memory.** Theme, station, volume and per-station tone come back exactly as you left them — unless a schedule slot covering that moment says otherwise, in which case the schedule wins.
- **Play on launch.** Starts a station the moment the app opens, with no click at all when it is opened through the shortcut above.

Everything is kept in `localStorage` on the machine it runs on. Nothing is uploaded.

## Recording

Holding either Shift key reveals a REC button beside play; it stays up while recording whatever the key is doing, because a recording nobody can see is one nobody can stop. Files go to the browser's download folder as `DSRadio-<yymmddhhmmss>-<seconds>.m4a`, stamped with the moment recording began.

`MediaRecorder` is fed by a `MediaStreamAudioDestinationNode` hung off the **analyser**, which is before the tone shelves and the volume gain. So the file is a constant-level copy of the broadcast: moving the fader or dialling in bass changes what reaches the speakers and not what reaches the file.

AAC in MP4 at 96 kbps, by choice rather than by limitation. Chrome and Edge will both produce `audio/webm;codecs=opus`, which is about half the size, but Windows will not play it without help, and a recording that will not open on the machine that made it is not much of a recording. Neither browser can produce MP3 or WAV at all — `MediaRecorder.isTypeSupported` was asked rather than assumed.

The constraint worth knowing: recording taps the Web Audio graph, and that graph only exists for streams that permit cross-origin access. A station that shows *meter off · stream failed the analysed path* cannot be recorded, for exactly the same reason, and the button is shown disabled carrying that reason rather than being hidden. Nor can anything be recorded before the first click, since the graph waits for one.

Verified in a real window with a real audio device, which is the only place this can be verified: headless Chrome has no audio output, so the context never renders and the recorder emits zero-byte chunks. Seven seconds gave five chunks and 87,804 bytes.

## Stream types

A station's URL goes straight onto an `<audio>` element, so what the browser can play, the app can play. `Directory.streamKind()` in `radio-directory.js` classifies a URL and the rest follows from that.

| Kind | Detected by | What happens |
|---|---|---|
| MP3, AAC (Icecast, Shoutcast) | anything not matched below | Plays. Meter and tone controls work when the host sends permissive CORS headers. |
| `.pls`, `.m3u` | extension | Fetched once, parsed by `Directory.parsePlaylist()`, and the stream address inside it replaces `station.url` and is saved. Later plays go straight to the stream. |
| `.m3u8` (HLS) | extension | Master playlists are read once and one rendition is handed to the element (see below). Higher latency than a plain stream, and `seekable` is empty, so the live-edge seek below cannot help it. |
| `.asx`, `.xspf` | not handled | XML playlists. They reach the audio element unchanged and fail there, as they always did. |

`parsePlaylist` reads both formats with one pass: it takes the lowest-numbered `FileN=` entry in a `.pls` (which is not obliged to list them in order) and otherwise the first non-comment line that is an absolute `http(s)` URL. Relative entries are rejected — there is no base to resolve them against that is worth trusting. Reading the file at all needs the host to allow the request; when it refuses, the station is tuned unchanged rather than being left unplayable in a new way.

### Joining at the live edge

A station hands over a second or so of already-broadcast audio the moment you connect, so the element has something to decode. Without help that is what you hear on every restart, and on speech it is unmistakable — stop and start `NewsTalk 1010` and the last sentence begins again.

`tune()` therefore seeks forward on the first `playing` event of each tune, to `buffered.end - LIVE_MARGIN` (1.5s). It retries every 60ms for up to eight tries, because `seekable` and `buffered` are not both populated at the instant `playing` fires. The first attempt is deferred by `setTimeout(..., 0)` so it runs after `setStatus('live')`, not before it.

This is generic: it applies to every station, with no per-station configuration, and it is a no-op for anything that cannot honour it. HLS reports an empty `seekable`, so it declines and keeps its 10–20s rewind. There is no fix for that without an HLS library, which would mean a dependency and a build step.

### One rendition, not the master

A master playlist lists the same programme at several bitrates. Chrome plays HLS itself, and given the master it starts on the lowest and steps up once it has measured the connection.

CBC's master lists four bitrates on each of two CDN paths, `2041036` and `2041036-b`, and those are packaged independently: no `EXT-X-PROGRAM-DATE-TIME`, different segment numbering, and live windows about six seconds apart. Chrome's step-up crosses from one path to the other, and at that splice the listener hears the last several seconds again. Measured, not inferred: with the master handed over, a run requests `adaptive_48`, then `adaptive_192`, then `2041036-b`; the repeat lands where the `-b` segment is appended.

`Directory.listHlsVariants()` therefore reads the master once per session and returns one rung per distinct bandwidth, best first, keeping the **first** entry for each. A master that lists the same ladder twice is listing two packagers, so first-occurrence keeps every rung on the path the master leads with. `tune()` hands the element the top rung as a single media playlist, and with nothing to switch to there is no splice. The same run afterwards requests only `2041036/adaptive_192`, never `adaptive_48` and never `-b`, which also means full bitrate from the first second rather than the tenth.

Handing over one playlist gives up the browser's own bitrate adaptation, so the stepping is done here instead: one rung down per failed attempt, whatever the cause, because a connection too slow for the top rung stalls on it rather than erroring on it. Ten unbroken seconds winds the ladder back to the top, so a blip tonight does not inherit a downgrade from this morning. When the ladder runs out the choice is forgotten and the master is read again, which also covers a rendition withdrawn or a CDN path taken out of service while the master still lists others.

Rewriting the master and serving it to the element as a `blob:` or `data:` URL would have kept the browser's own adaptation, and was tried first: from `file://` a blob master produces no network requests at all, over `http://` it fetches one chunklist and stalls at `readyState` 0, and a `data:` master fails outright with `MEDIA_ERR_SRC_NOT_SUPPORTED`. The app ships as a local file, so that route is closed.

The choice is held in memory, never saved: the master is the address the station publishes, and a rendition that has stopped working should not outlive the session that chose it. A load failure forgets it, so the next attempt reads the master again rather than retrying a dead address until the page is reloaded.

There is no drift correction. It was written and then removed: playing at 0.5x for nine seconds did not widen `buffered.end - currentTime` by a hundredth of a second. The browser holds about 2.3s and throttles the download to maintain it, so there is never enough buffer ahead to correct into.

## Updates

Once a day the app fetches [`version.json`](version.json) from this repo and says so in **Settings → Service** if a newer version has been published. It sends no identifiers, downloads nothing, and installs nothing. The switch beside it turns the check off for good.

## Building the single-file version

The source is split into a stylesheet and five modules because that is how it is worked on. What ships is one HTML file with all of it inlined:

```
node tools/build-dist.js
```

That writes `dist/` — `index.html` plus the four theme icons and the shortcut helper. Six files, because Windows reads icons off disk rather than out of a page.

## Layout

| Path | What it is |
|---|---|
| `index.html` | Markup and the settings drawer |
| `app.css` | Base layout and all four themes |
| `app.js` | State, audio graph, watchdog, metering, scheduler tick, UI |
| `signal.js` | Volume curve and level metering maths |
| `scheduler.js` | Slot resolution — pure functions, no DOM |
| `radio-directory.js` | City lookup and station search |
| `tuner-ui.js` | Dial needle, name fitting |
| `tests/` | Unit tests: `node --test tests/*.test.js` |
| `tools/` | Icon, favicon and distribution builds |
| `previews/` | Static design pages for themes and byline options |

## Tests

```
node --test tests/*.test.js
```

No dependencies, no test runner to install — Node's own.

## Licence

[MIT](LICENSE). The code is yours to use, change and ship. The licence covers this project only — not the streams it plays, which belong to the broadcasters below.

## Streams and attribution

Deskside Radio is a player, not a broadcaster. It hosts, caches, rebroadcasts and re-encodes nothing: it points an `<audio>` element at a URL you give it, exactly as a browser tab would.

It ships with three Toronto stations as a starting point — **NewsTalk 1010 (CFRB)**, **CBC Radio 1 Toronto (CBLA-FM)** and **KISS 92.5** — using the same public stream endpoints those stations' own web players use. CBC's is an HLS playlist, which current desktop browsers play straight off the audio element. Those streams, their content and their trademarks belong to their broadcasters, who are not affiliated with this project and have not endorsed it. Any station you add yourself is likewise the property of whoever runs it.

If you operate one of these streams and would rather it were not listed as a default, open an issue and it will be removed.

Type is set in faces from [Google Fonts](https://fonts.google.com/), fetched from Google at run time and falling back to the stacks named beside each one when there is no connection. The exception is **[VFD Nova](https://www.fontspace.com/vfd-nova-font-f99475)** by Nihar Mazumdar, which is not on Google Fonts and so lives in `fonts/`: a 14-segment alphanumeric used for the station name on the broadcast console theme. The designer published it as **public domain**, which is what its package records too, so it is redistributed here with the rest of the app; `fonts/VFD-Nova-LICENCE.txt` sets out that provenance. Public domain asks for no attribution — this credit is here because the font's own metadata carries a copyright line and no licence string, and a reader deserves the rest of the story. The build folds the file into the single-file version as a data URI, which is most of the difference between a 306 KB `index.html` and a 398 KB one.

Station search comes from [radio-browser.info](https://www.radio-browser.info/), a community database, and city lookup from [Open-Meteo](https://open-meteo.com/). Both are public and key-free; neither is sent anything about you beyond the query itself.
