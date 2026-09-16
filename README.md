# Deskside Radio

A desktop internet radio that looks like a radio. Open `index.html` in a browser and it plays — no install, no build step, no account, no server. Stations, a day schedule, eight visual themes, and a watchdog that reconnects a dropped stream on its own.

The four themes are laid out side by side in [previews/preview.html](previews/preview.html) — open it in a browser.

## Running it

Download **Win-Install-or-Update-Deskside-Radio.cmd** from the [latest release](https://github.com/markticulous/deskside-radio/releases/latest) and double-click it.

That's all — it installs the radio, puts a shortcut on your Desktop and opens it.

If you are reading this inside a folder you unzipped yourself, double-click **Win - Create Desktop Shortcut (Chrome).cmd** instead and it works the same way from where it stands.

It unpacks into `%LOCALAPPDATA%\DesksideRadio\app`. Windows asks once whether to run a downloaded file; after that there are no prompts, on this run or on any update.

It needs no administrator, which is why it does not go in Program Files: that would cost a UAC prompt every time, including every update.

The old way still works and is unchanged — download `deskside-radio.zip`, unzip it anywhere, open `index.html`. The app itself installs nothing and runs from wherever it sits.

**Win - Create Desktop Shortcut (Chrome).cmd** writes a proper Windows shortcut carrying the icon of whichever theme you name:

```
"Win - Create Desktop Shortcut (Chrome).cmd" console
```

With no argument it uses the analogue dial icon. The app's own shortcut button shows the exact line to run, because a web page is not allowed to write a shortcut file itself — Chrome renames `.url` downloads to `.download`, on the grounds that such a file can point anywhere.

### Starting without a click

Browsers refuse to start audio until something on the page has been clicked, which is why opening `index.html` normally with **Play on launch** switched on gets you a *Tap to start* panel rather than a radio.

The shortcut that script writes gets around it. Rather than handing the page to your everyday browser, it launches Chrome — or Edge, on a machine without Chrome — as a window of its own with the autoplay policy lifted, so the radio is playing before you have touched anything:

```
chrome.exe --app="file:///.../index.html"
           --autoplay-policy=no-user-gesture-required
           --user-data-dir="%LOCALAPPDATA%\DesksideRadio\profile"
```

There used to be a fourth flag, `--allow-file-access-from-files`, so that the settings seed below could be read off disk. It is gone, and deliberately. That flag is not permission to read one file: it lifts the same-origin rule for every `file://` page in that profile, so any script running in the page — one that got there through a bug, or a local page opened in the same profile — could read and list anything the signed-in user can, and post it anywhere. It bought a convenience that runs once per profile. The seed is loaded as a script now, which a page has always been allowed to do, and the flag is gone from both launcher scripts. **If you made a shortcut before v1.2.5, run the script again to rewrite it without the flag.**

The separate `--user-data-dir` is not optional: a browser reads these flags once, at startup, so one that is already running would take the page and quietly drop them.

That separate profile is also why the radio opens with nothing in it the first time. To bring your stations, schedule and theme across, export them from **Settings → Service → Export settings** and leave the resulting `deskside-radio-settings.js` beside `index.html`. The first launch reads it once and then keeps its own settings from there. It doubles as a way to ship a machine a ready-made setup.

The export is a `.js` file rather than a `.json` one for the reason above: a page can load its own script without being granted the run of the disk. Inside it is the same JSON with `window.DESKSIDE_SEED =` in front, and **Import settings** still reads either shape, so older exports keep working.

Two things to know: opening the page the ordinary way still works and still shows the tap panel, and double-clicking the shortcut while the radio is already open gives you a second window playing over the first.

### Why the helper, and not the button in the top bar

The radio can hand you a shortcut file &mdash; the icon in the top bar does exactly that &mdash; but on Windows that route has two pieces of grit in it, and the helper script has neither.

A browser will not save a `.url` under its own name, because such a file can point anywhere, so it arrives as `Deskside Radio.download` and has to be renamed. And everything a browser downloads is tagged with a *Mark of the Web*: an alternate data stream recording where the file came from. A page opened from your own disk has no address that the tagger recognises, so the file is marked `ZoneId=4` &mdash; **restricted**, the most suspicious zone Windows has &mdash; and every attempt to open it raises *"Do you want to open this file?"*.

Neither is anything to do with the contents of the shortcut, which is four lines of plain text. To clear the mark: right-click the file, **Properties**, tick **Unblock**, **OK**. Or in PowerShell:

```powershell
Unblock-File "$env:USERPROFILE\Desktop\Deskside Radio.url"
```

`Win - Create Desktop Shortcut (Chrome).cmd` sidesteps both: it builds the `.lnk` on the spot rather than downloading it, so there is nothing to rename and no mark to clear.

### Picking the browser, and other platforms

`Win - Create Desktop Shortcut (Chrome).cmd` takes Chrome or Edge, whichever it finds first. Three more scripts exist for when that is not the one you want:

| Script | Makes | Notes |
|---|---|---|
| `Win - Create Desktop Shortcut (Edge).cmd` | *Deskside Radio (Edge)* | Pinned to Edge, with a profile of its own |
| `Win - Create Desktop Shortcut (Firefox).cmd` | *Deskside Radio (Firefox)* | See below |
| `Linux - Create Desktop Shortcut.sh` | a `.desktop` entry | `--autostart` also starts it at login, `--off` removes both |

Each has its own browser profile, so stations and settings do not carry between them; the settings export is how you move a setup across.

**Firefox is the odd one.** It has no `--app`, having dropped site-specific browsers, so the radio opens in an ordinary window with a tab strip above it — F11 for fullscreen if that bothers you. Autoplay is not a command-line flag there either, it is a preference, so the script writes a `user.js` into the profile it creates setting `media.autoplay.default` to 0. That is why the profile is made by the script rather than left to Firefox.

**Linux** has no equivalent of the Windows startup folder, but every desktop environment worth the name reads `~/.config/autostart`, which is the same file format as the launcher with two lines added. `--autostart` writes it, with an eight-second delay so the radio is not reconnecting before the network is up. The script writes two files in your home directory and nothing else: no root, no package, no service.

**macOS** gets a `.fileloc` rather than a `.webloc`. Both are property lists holding a URL and Finder opens both, but they are not interchangeable — `.webloc` is for a web address and `.fileloc` for something on this disk, which is what this is. Handed a `file://` URL inside a `.webloc`, Finder says *"the document content is not readable or is in the wrong format"*. If dragging the file still does not work, drag the address out of your browser's address bar onto the Desktop instead; Safari and Chrome both make a working shortcut that way.

### Starting when you sign in

`Win - Start With Windows.cmd` writes the same shortcut into the Startup folder, and `Win - Start With Windows.cmd off` removes it. Nothing touches the registry and nothing runs as a service; it is one `.lnk` in a folder the user can open with `shell:startup`. The browser detection in it is a deliberate copy of the one in `Win - Create Desktop Shortcut (Chrome).cmd` rather than shared with it — these are files people double-click, often one without ever having run the other, so each has to stand alone.

macOS has no equivalent script here. A `.fileloc` saved from the shortcut button can be added under **System Settings → General → Login Items**, but it opens in the default browser, so the autoplay-policy lift the Windows shortcut relies on is not available and the first play needs a click.

### Browsers

Chrome and Edge are the same engine and behave identically; the launcher falls back to Edge, and the HLS handling above was verified on both. Safari plays everything, including HLS natively, with two differences: it refuses `localStorage` for pages opened over `file://`, so nothing persists unless the folder is served over HTTP; and it never sizes or moves its own window, because `windowIsOurs()` now requires a Chromium user agent as well as a thin window frame. That guard was added deliberately — a Safari window with its toolbar hidden has a frame thin enough to pass the old test, and moving somebody's ordinary browser window about is a rude way to be wrong.

### Window size and position

Chrome does not remember where an `--app` window was: one moved to `420,260` at `760x520` and closed reopens at `10,10` at a size of Chrome's choosing, which was measured rather than assumed. So the app keeps its own box in `state.windowBox`, read off the heartbeat that is already running — dragging a window fires no event of any kind — and again on `pagehide`, and restores it on the next launch, clamped to the screen actually in front of the user.

A restored box is left alone: it is the size the user chose, possibly by hand. Only a theme change refits, because the height then belongs to the new theme rather than to the window the old one was closed in.

The fit itself used to resize the window three times while the user watched. Two causes: it measured with a scrollbar present, which narrows the tuner and so overstates its height, and it ran before the webfonts had landed, which understates it by about eighty pixels. It now measures with the scrollbar suppressed and does not run at all until `document.fonts.ready` has resolved and the preset measurement has settled, with a failsafe in case a font never arrives. First launch: one resize. Every launch after that: none, just the restore.

## What it does

- **Stations.** Any stream URL with a name, frequency, colour and tagline. A built-in finder looks up stations near a city through [radio-browser](https://www.radio-browser.info/), which is public and key-free.
- **Schedule.** Weekday and weekend time slots, each choosing a station and optionally forcing volume, bass, treble or theme when it starts. A slot hands over at its end time: `07:00` to `10:00` runs from `07:00:00` and stops at `10:00:00`, so an adjacent slot starting at `10:00` picks it up cleanly. Slots may run past midnight, and one whose two times are the same plays all day. A handover is announced and eased rather than sprung — see below.
- **Themes.** Analogue dial, broadcast console, Rams minimal, editorial, retro 8-bit, departures board, Marconi deco, Model One. Each has its own desktop icon.
- **Watchdog.** A frozen media clock plus a starved buffer means the stream died; it reconnects with exponential backoff rather than sitting silent.
- **Memory.** Theme, station, volume and per-station tone come back exactly as you left them — unless a schedule slot covering that moment says otherwise, in which case the schedule wins.
- **Play on launch.** Starts a station the moment the app opens, with no click at all when it is opened through the shortcut above.

### What a handover looks like

A slot change used to be a cut: the station simply became a different station. Now the last minute of a slot is visible and the last five seconds are audible.

Through the final minute a hairline runs out along the bottom edge of the schedule chip — a detail of the button rather than a thing in its own right, so it is there to be noticed and not to be watched. Over the last five seconds the outgoing station fades down, and the incoming one comes up over two seconds once it is actually playing rather than while it is still connecting. The volume control slides down and back up with the fade so you can see it happening — but the fade is a multiplier over the fader and never writes to it, so the number beside it does not move and where you left the volume is where it stays.

**When the last slot of the day ends** and nothing follows it, each day group decides for itself what happens — *keep playing*, or *turn the radio off*. The control sits under the slots in **Settings → Schedule**, and weekday and weekend are set separately, so the weekdays can end at bedtime while the weekend carries on.

**Slots cannot be made to collide.** What you have just set stays, and anything it runs into is cut back to make room; a slot with nothing left is removed. A line above the cards says what happened — *Shortened KISS 92.5 to start 11:00 to make room.* — with an Undo beside it that puts the whole change back. The same rule covers adding a slot (it is placed where there is room, and says so when the day is full), deleting a station the schedule uses (it asks whether those slots move to another station or go with it), and importing a settings file that could not be honoured as written. There is nothing left for Save to refuse about a schedule.

Save can still refuse a **station**, and when it does it says which field and why, marks every offending field in red rather than one at a time, and puts the cursor in the first of them.

One more thing about that tab: saving from it keeps the drawer open with the slots folded shut, because a schedule is usually built several slots at a time. Saving from any other tab closes the drawer as it always did.

Everything is kept in `localStorage` on the machine it runs on. Nothing is uploaded.

## Recording

Holding either Shift key reveals a REC button beside play; it stays up while recording whatever the key is doing, because a recording nobody can see is one nobody can stop. Files go to the browser's download folder as `DSRadio-<yymmddhhmmss>-<seconds>.m4a`, stamped with the moment recording began.

`MediaRecorder` is fed by a `MediaStreamAudioDestinationNode` hung off the **analyser**, which is before the tone shelves and the volume gain. So the file is a constant-level copy of the broadcast: moving the fader or dialling in bass changes what reaches the speakers and not what reaches the file.

AAC in MP4 at 96 kbps, by choice rather than by limitation. Chrome and Edge will both produce `audio/webm;codecs=opus`, which is about half the size, but Windows will not play it without help, and a recording that will not open on the machine that made it is not much of a recording. Neither browser can produce MP3 or WAV at all — `MediaRecorder.isTypeSupported` was asked rather than assumed.

The constraint worth knowing: recording taps the Web Audio graph, and that graph only exists for streams that permit cross-origin access. A station that shows *meter off · stream failed the analysed path* cannot be recorded, for exactly the same reason, and the button is shown disabled carrying that reason rather than being hidden. Nor can anything be recorded before the first click, since the graph waits for one.

Verified in a real window with a real audio device, which is the only place this can be verified: headless Chrome has no audio output, so the context never renders and the recorder emits zero-byte chunks. Seven seconds gave five chunks and 87,804 bytes.

## What the meter is reading

VU stands for Volume Unit, and a VU meter measures **programme level** — the level of the material itself. It is deliberately not a monitor-volume indicator: on a broadcast console the control-room knob does not move the meters, because the engineer needs to know what is going down the line regardless of how loudly they happen to be listening. A tape deck's meters ignore the output knob for the same reason.

So the needle here does not follow the volume fader, and that is the correct behaviour rather than an oversight. The analyser sits before both the tone shelves and the volume gain, so the meter shows the station as broadcast: turning the fader down, or dialling in bass for the room, changes what reaches the speakers and not what the meter reads. It is the same tap the recorder uses, for the same reason.

The instrument that *does* follow the volume knob is a power meter — the pair of watts meters on a 1970s receiver. That is a different instrument, and this is not it.

0 VU is referenced to -15 dBFS. That is a measured number, not a chosen one: twelve seconds each of two real stations gave medians of -18.2 and -17.9 dBFS, and with 0 VU printed at 20/23 of the way up the face, a reference of -18 parked the needle at 87% of its travel and looked pinned. At -15 the same material reads about -3 VU, with peaks touching 0 and the red left for transients that genuinely are loud.

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

Every six hours the app fetches [`version.json`](version.json) from this repo. When a newer version has been published it shows an **Update available** pill beside the wordmark and a dot on the Settings control, and names the version in **Settings → Service**. The pill carries a ⓧ: pressing it puts the pill away until the next completed check, which is a snooze rather than a mute. The dot on the Settings control is not affected by it and stays for as long as the update is outstanding. It sends no identifiers, downloads nothing, and installs nothing. The switch beside it turns the check off for good, and **Check now** beside that asks straight away rather than waiting for the interval — useful after a release, and the only way to find out without closing and reopening.

To take the update, run **Update Deskside Radio** from the Start menu — or double-click `Win-Install-or-Update-Deskside-Radio.cmd`, which the installer leaves in the app folder and every update replaces. It is the same file that installed it, and it works out that it is being run from inside an install and updates that folder in place.

**Nothing is downloaded or replaced until you ask for it.** There is no scheduled task, no background updater and no service; the radio only ever tells you a version exists. It cannot start the updater itself either — a `file://` page has no way to run a local script, which is a limit worth keeping.

Your stations, schedule and settings are not in the app folder. They live in the browser profile at `%LOCALAPPDATA%\DesksideRadio\profile`, so an update replaces every file in the install and loses nothing. Anything else you left beside `index.html` — a `deskside-radio-settings.js` seed, for instance — survives too: the update unpacks over the top rather than clearing the folder first.

## What the download looks like

The root of the unzipped folder holds only things meant to be double-clicked — `index.html`, `README.html`, and the `Win -` and `Linux -` scripts. Everything the radio needs but nobody opens is in `assets/`: one `favicon-*.ico` per theme, and `LICENSE.txt`.

The icons sit at that same path in this repository, so the launchers name them one way and it works whether they are run from a clone or from a download. The licence is the exception: `LICENSE` stays at the repo root, where GitHub and every licence scanner looks for it, and the build writes it to `assets/LICENSE.txt` on the way into the archive.

Updating an install made before this happened leaves the old icons in the root — unpacking writes over the top and removes nothing. The installer clears those by name once it has confirmed the new set arrived.

## Removing it

`Win - Uninstall Deskside Radio.cmd` ships inside the zip, so it is sitting in the app folder. Double-click it and it removes that folder and every shortcut the scripts wrote — on the Desktop, in the Startup folder and in the Start menu. Shortcuts are found both by name (`Deskside Radio*.lnk`) and by where they point, so one that was renamed or copied still goes.

Your stations, schedule and settings are in the browser profile, not the app folder, so they survive by default. It asks about them separately at the end, and the answer you get by pressing Enter is to keep them — that is the one part of this that reinstalling cannot undo.

It can also be pointed at an install somewhere else:

```
"Win - Uninstall Deskside Radio.cmd" D:\Somewhere\Radio
```

Run inside the source tree it refuses, on the same `app.css` test the installer uses.

One wrinkle worth knowing, because it looks odd from the outside: cmd holds a `.cmd` open for as long as it is running, so a script inside the app folder cannot delete the folder it is inside. The last step is therefore handed to a copy of itself in `%TEMP%`, which waits for the console window to close and then removes the tree. It is the final action, after everything has been reported, and that copy deletes itself afterwards.

## Building the single-file version

The source is split into a stylesheet and five modules because that is how it is worked on. What ships is one HTML file with all of it inlined:

```
node tools/build-dist.js
```

That writes `dist/` — `index.html` plus the theme icons, the shortcut helpers, the licence and `README.html`. The icons are separate files because Windows reads them off disk rather than out of a page.

`README.html` is the manual, and it sits beside `index.html` here as well as in the download — **Settings → Service → Open the read me** looks in the app's own folder, so a copy run straight from this repository has to find the same file. It is a page rather than plain text because nothing shipped with Windows, macOS or Linux renders Markdown — a browser hands you a local `.md` as raw text in a `<pre>` — while every one of those machines has a browser. The link opens it in a window of its own, sized and centred on the screen the radio is on.

This file, `README.md`, is the one for GitHub and for anyone reading the source.

**Cutting a release.** Attach three files: `deskside-radio-<version>.zip`, `deskside-radio.zip`, and **`Win-Install-or-Update-Deskside-Radio.cmd`**. The installer has to be a release asset rather than a link into the repository, because `raw.githubusercontent.com` serves a `.cmd` as `text/plain` and the browser renders it in a tab instead of downloading it. Release assets send `Content-Disposition: attachment`, so they arrive as files.

The installer always fetches `releases/latest/download/deskside-radio.zip` — the stable name, never a versioned one. Pinning it to a version would freeze every copy already sitting in an app folder, silently, because it would still appear to work.

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
