# Deskside Radio

A desktop internet radio that looks like a radio. Stations, a day schedule, eight visual themes, and a watchdog that reconnects a dropped stream on its own.

Deskside Radio is a webpage-based application. There is nothing to install, no account and no server. Nothing about you is sent anywhere; the two things that do leave your machine are the stations you play and, on each launch, a request to Google Fonts for the typefaces.

The eight themes are laid out side by side in [previews/preview.html](previews/preview.html) — open it in a browser.

## Running it

Download **Win-Install-or-Update-Deskside-Radio.cmd** from the [latest release](https://github.com/markticulous/deskside-radio/releases/latest) and double-click it.

That's all — it installs the radio, puts a shortcut on your Desktop and opens it.

If there is no Deskside Radio shortcut on the Desktop yet it asks which browser to open in, offering only the ones installed — **C** for Chrome, **E** for Edge, **F** for Firefox — and pressing Enter takes the first offered. With one browser it asks nothing and uses that one; with none of the three, the shortcut opens the radio in the default browser, which needs a click before it plays. If there are already shortcuts it asks nothing and rewrites the ones that are there, which matters more than it sounds: a `.lnk` holds the full path to the app folder, so an install that moved leaves every shortcut, and the Startup entry, aimed at where the folder used to be.

It also says which version it is putting in, and which one that replaces, read out of the archive it just downloaded rather than off the release page.

If you are reading this inside a folder you unzipped yourself, double-click **Win - Create Desktop Shortcut (Chrome).cmd** instead and it works the same way from where it stands.

It unpacks into `%LOCALAPPDATA%\DesksideRadio\app`. Windows asks once whether to run a downloaded file; after that there are no prompts, on this run or on any update.

It needs no administrator, which is why it does not go in Program Files: that would cost a UAC prompt every time, including every update.

### It runs the published installer, not itself

The installer ships inside the zip, so after the first install a copy sits in the app folder and every update replaces it — and that copy is always one release behind the thing it is about to install. A fix to the way installing works could therefore never reach the run that needed it: whoever has the bug has the old script, and the old script is what executes.

So the first thing it does is fetch the published one and compare it with itself, byte for byte. If they differ it hands the whole job over — passing the folder it had worked out, because the fresh copy runs from `%TEMP%` where the "am I inside an install" rule would answer differently — and sets `DESKSIDE_FRESH` so there is exactly one hand-over and no way to loop. It is 20 KB and one request, before anything has been written, and it trusts nothing that was not already being trusted: the file comes from the same release, over the same https, as the zip full of code it is about to unpack and run. Offline, the check fails quietly and the download that follows reports the network rather than the installer.

The old way still works and is unchanged — download `deskside-radio.zip`, unzip it anywhere, open `index.html`. The app itself installs nothing and runs from wherever it sits.

**Win - Create Desktop Shortcut (Chrome).cmd** writes a proper Windows shortcut carrying the icon of whichever theme you name:

```
"Win - Create Desktop Shortcut (Chrome).cmd" console
```

With no argument it uses the analogue dial icon. The icon carries the browser's logo in its top-left corner, on a thin dark disc, so the Chrome, Edge and Firefox shortcuts can be told apart on one Desktop; add `plain` (`"Win - Create Desktop Shortcut (Chrome).cmd" console plain`) for the icon without it. The logo is never shipped: `assets/shortcut-icon.ps1` takes it from the browser installed on that PC and draws it onto the theme's icon there, into `assets/badged/`, which is gitignored. Every update rewrites the shortcuts, and keeps what each one had — the theme, a plain icon, or an icon chosen in Properties that is not ours at all — except that a plain icon from before badges existed gets the badge once.

The app's own shortcut button shows the exact line to run, because a web page is not allowed to write a shortcut file itself — Chrome renames `.url` downloads to `.download`, on the grounds that such a file can point anywhere.

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

It goes through the same launcher as Chrome and Edge, which sizes the window: Firefox has no `--window-size` and will not let a page resize a window with tabs, but it keeps window geometry in the profile's `xulstore.json`, so the launcher writes 1133×742 there before every start — every start, because Firefox writes its last size back on exit — and keeps the position you left it at, unless that is off every screen. The profile's `userChrome.css` hides the tab strip, toolbar and maximise button, and `browser.tabs.inTitlebar = 0` gives it Windows' own title bar, so it looks like the Chrome app window; measured, its frame is then 14×38 against Chrome's 15×38, which is where 1133×742 comes from. `ui.systemUsesDarkTheme` darkens Firefox's own chrome, and the cache is capped at 16 MB with the DRM plugin and telemetry off.

What a Firefox page cannot do — move or size its own window — the watcher does from outside: `strip-fit.ps1 -Firefox` locks both windows' size and, when the mini radio is pinned, moves the radio window past the edge of the screen and puts it back on unpin. Firefox keeps drawing it there, so the mini radio's visualiser does not stop. Each browser family has its own watcher, told apart by Firefox's title suffix: with one shared, a Firefox watcher took Chrome's windows for Firefox's and broke Chrome's pin.

Firefox also has no native HLS — measured in 155 and 156, `canPlayType` answers `''` for it where Chrome and Edge answer `maybe` — so HLS stations there play through [hls.js](https://github.com/video-dev/hls.js), loaded from `assets/` only in a browser that needs it. Chrome and Edge never load it.

**Linux** has no equivalent of the Windows startup folder, but every desktop environment worth the name reads `~/.config/autostart`, which is the same file format as the launcher with two lines added. `--autostart` writes it, with an eight-second delay so the radio is not reconnecting before the network is up. The script writes two files in your home directory and nothing else: no root, no package, no service.

**macOS** gets a `.fileloc` rather than a `.webloc`. Both are property lists holding a URL and Finder opens both, but they are not interchangeable — `.webloc` is for a web address and `.fileloc` for something on this disk, which is what this is. Handed a `file://` URL inside a `.webloc`, Finder says *"the document content is not readable or is in the wrong format"*. If dragging the file still does not work, drag the address out of your browser's address bar onto the Desktop instead; Safari and Chrome both make a working shortcut that way.

### Starting when you sign in

`Win - Start with Windows (On-Off).cmd` writes the same shortcut into the Startup folder. Double-clicked, it looks before it acts: it reports whether the entry is there and which folder that entry opens, then offers `R` to remove it or `P` to repoint it at the folder it was run from, with Enter leaving it alone. A word on the command line — `on`, `off`, or a theme name — skips the question, which is how the installer calls it. Settings has a switch for the same thing, and it reaches this script the long way round: `Win - Deskside Radio Protocol.vbs` is registered as the handler for a `desksideradio:` URL, the page navigates to `desksideradio:startup-on`, and Windows starts the handler, which runs this with `on`. The handler accepts those two words and no others — a registered protocol can be reached by any site in any browser, so nothing from the URL is ever passed on, and the worst a hostile page can do is toggle this radio's own start-up entry.

What the listener sees the first time is a browser permission dialog, and it does not name the radio: Chrome resolves the registered command's executable and shows *its* file description, so what comes up is **Open Microsoft ® Windows Based Script Host?** — `wscript.exe`'s own description, not the `URL:Deskside Radio` value on the key. Only shipping a signed `.exe` of our own would change that wording, which is not worth a new binary. The dialog is Chrome's external-protocol confirmation and cannot be suppressed by anything the app writes; the `AutoLaunchProtocolsFromOrigins` enterprise policy would do it and is deliberately not used, because it needs administrator rights, belongs to whoever manages the machine rather than to an app, and would need doing again per browser. The route that does work is the dialog's own **Always allow** box, ticked *before* pressing Open — pressing Open closes the dialog, so a tick made afterwards never lands. It is remembered per browser profile, and the radio has one of its own, so a single tick covers the radio for good and touches nothing else. The installer rewrites that entry too whenever one exists, because nothing else ever did: an entry made from a copy unzipped into Downloads went on opening `file:///C:/Users/.../Downloads/deskside-radio/index.html` at every sign-in long after that folder was gone, and what the listener saw at sign-in was Chrome's *Your file couldn't be accessed*. Nothing touches the registry and nothing runs as a service; it is one `.lnk` in a folder the user can open with `shell:startup`. The browser detection in it is a deliberate copy of the one in `Win - Create Desktop Shortcut (Chrome).cmd` rather than shared with it — these are files people double-click, often one without ever having run the other, so each has to stand alone.

macOS has no equivalent script here. A `.fileloc` saved from the shortcut button can be added under **System Settings → General → Login Items**, but it opens in the default browser, so the autoplay-policy lift the Windows shortcut relies on is not available and the first play needs a click. On Linux, `Linux - Create Desktop Shortcut.sh` writes a launcher, which goes in whatever the desktop calls its startup applications — GNOME and KDE both have one, and both read `~/.config/autostart`. Settings shows the sign-in pane on all three platforms and the control on Windows only, because it works by asking Windows to do something and there is nothing equivalent to ask elsewhere. That control is a button until it has succeeded once, and a switch afterwards: the first use goes through a browser permission dialog, and a switch moves on click — before anything has happened, while the dialog is still open — so it would show a state nothing had confirmed and then flip back behind the dialog when the first re-read found the entry still absent. A button has no state to be wrong about. `state.startupUsed` records that it worked; the on/off value itself is never remembered, only read.

### Browsers

Chrome and Edge are the same engine and behave identically; the launcher falls back to Edge, and the HLS handling above was verified on both. Safari plays everything, including HLS natively, with two differences: it refuses `localStorage` for pages opened over `file://`, so nothing persists unless the folder is served over HTTP; and it never sizes or moves its own window, because `windowIsOurs()` now requires a Chromium user agent as well as a thin window frame. That guard was added deliberately — a Safari window with its toolbar hidden has a frame thin enough to pass the old test, and moving somebody's ordinary browser window about is a rude way to be wrong.

### Window size and position

Chrome does not remember where an `--app` window was: one moved to `420,260` at `760x520` and closed reopens at `10,10` at a size of Chrome's choosing, which was measured rather than assumed. So the app keeps its own box in `state.windowBox`, read off the heartbeat that is already running — dragging a window fires no event of any kind — and again on `pagehide`, and restores it on the next launch, clamped to the screen actually in front of the user.

A restored box is left alone: it is the size the user chose, possibly by hand. Only a theme change refits, because the height then belongs to the new theme rather than to the window the old one was closed in.

The fit itself used to resize the window three times while the user watched. Two causes: it measured with a scrollbar present, which narrows the tuner and so overstates its height, and it ran before the webfonts had landed, which understates it by about eighty pixels. It now measures with the scrollbar suppressed and does not run at all until `document.fonts.ready` has resolved and the preset measurement has settled, with a failsafe in case a font never arrives. First launch: one resize. Every launch after that: none, just the restore.

## What it does

- **Stations.** Any stream URL with a name, frequency, colour and tagline. A built-in finder looks up stations near a city through [radio-browser](https://www.radio-browser.info/), which is public and key-free.
- **Schedule.** Weekday and weekend time slots, each choosing a station and optionally forcing volume, bass, treble or theme when it starts. A slot hands over at its end time: `07:00` to `10:00` runs from `07:00:00` and stops at `10:00:00`, so an adjacent slot starting at `10:00` picks it up cleanly. Slots may run past midnight, and one whose two times are the same plays all day. A handover is announced and eased rather than sprung — see below.
- **Themes.** Analogue dial, broadcast console, Rams minimal, editorial, retro 8-bit, departures board, Marconi deco, Model One. Each has its own desktop icon. The departures board turns its panels when the station changes, and again when you first arrive on it from another theme — once the Settings drawer has finished closing, so the turn is not spent behind it.
- **Watchdog.** A frozen media clock plus a starved buffer means the stream died; it reconnects with exponential backoff rather than sitting silent.
- **Silence watch.** The harder case: the connection is fine, the clock is advancing, and there is no sound. Nothing in the transport can see that, so the meter is asked instead — below −60 dBFS for five unbroken seconds while the transport says Live, and the lamp starts alternating amber and green and the line reads *Stream detected · no audio*. It then re-tunes after 10 seconds of silence, and again after 30, 90 and 120 seconds if it is still quiet, before giving up and leaving the lamp saying so. Four attempts, because a station that is simply off the air overnight should not be hammered all night. Only works where the meter does: a stream that refuses CORS has no analyser on it, so silence cannot be told from sound and nothing is claimed.
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

### The peak lamp

The broadcast console theme holds one segment lit at the loudest thing the meter has seen. It rises the instant the level does, sits there for a second and a half, and then falls at a rate you can follow with your eye. Without it a transient that clips is a single frame nobody sees, and the bar has already moved on by the time you look up.

It lands on the cell grid rather than between two cells, which is why the bar is snapped to whole segments too — a lamp sitting on one segment above a bar ending half way through another would be two meters disagreeing in the same fourteen pixels. It goes out with the rest of the meter when the radio stops, rather than holding the last loud moment of a station that is no longer playing.

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

### The shortcut button, and why it disappears

The small icon in the top bar offers to put a shortcut on the Desktop, and on Windows it now hides itself once there is one. The page cannot see your Desktop — a `file://` page cannot see any of your disk — so it is told: the launcher lists the Desktop at every start and writes the answer into `assets/shortcut.js`, one line of JavaScript, which the page loads the same way it loads a settings seed.

**Anything other than a clear yes leaves the button showing.** No file, an unreadable file, an error, or a machine where no launcher runs at all — which is macOS and Linux, where that file is never written and the top bar stays exactly as it always was. Hiding on ignorance would be the one failure worth avoiding: somebody whose shortcut has just gone is the person who needs the button most.

The same action also lives permanently in **Settings → Service**, and that one never hides. The icon is the convenience; the drawer is the guarantee.

## Updates

The app fetches [`version.json`](version.json) from this repo a few seconds after it opens, and every six hours it is left running. A launch that asked within the last ten minutes does not ask again, so reopening the window repeatedly costs one request rather than five. When a newer version has been published it shows an **Update available** pill beside the wordmark and a dot on the Settings control, and names the version in **Settings → Service**. The dot at the head of the pill blinks — lit for three quarters of every two seconds, snapping on and fading off in sixty milliseconds. It is the only thing on the face that moves of its own accord, which is what lets a small, quiet notice still be caught out of the corner of the eye; a machine set to reduced motion gets it held lit instead. Both marks are the same alert orange on every theme — deliberately not the cabinet's own colour, because a piece of news should not be wearing it. The pill carries a ⓧ: pressing it puts the pill away until the next completed check, which is a snooze rather than a mute. The dot on the Settings control is not affected by it and stays for as long as the update is outstanding. It sends no identifiers and downloads nothing; the page cannot install anything and never could. The switch beside it turns the check off for good, and **Check now** beside that asks straight away rather than waiting for the interval — useful after a release, and the only way to find out without closing and reopening.

What the notice offers depends on what you are running it on, because the installer is a Windows batch file and naming it anywhere else is an instruction that cannot be followed.

**On Windows the notice is news, not an instruction.** There is nothing to do with it. The Desktop shortcut and the Startup entry do not point at a browser; they point at `Win - Open Deskside Radio.cmd`, which opens the radio and then, once a day, asks the same question the app does. If a newer version has been published it fetches and unpacks it in the background while you listen. The radio is running it the next time you open it, and the readout says which version that is.

Clicking the notice opens a small dialog rather than a releases page, and what it says depends on something only this machine knows: whether the new version has already been fetched. If it has, it offers to close the radio, because reopening is then the whole of the update. If it has not, it says so and shows the two launches — the next one collects it, the one after runs it — and offers nothing to press but **Got it**. The page works that out by reading a line the build leaves in the app folder; it is the one thing a page opened from a disk can find out about the disk it was opened from.

That means the notice you see today is acted on at the next launch and visible at the one after — so a radio opened daily is current within a day or two without anybody doing anything, which is the whole point. To take one the moment you hear about it instead, run `Win-Install-or-Update-Deskside-Radio.cmd` in the app folder: it carries no Mark of the Web, so it costs none of the security prompts a fresh download does, and holding Shift on **Settings → Service** gives you a button that opens the folder. **Deskside Radio - Update** in the Start menu runs the same file, where the installer made one.

`Win - Automatic Updates.cmd` controls whether the radio updates itself. Nothing is installed or removed either way: it writes, or deletes, one small file in the app folder that the launcher looks for before it checks for a newer version. Run it with `off` to stop the updating; run it with no argument to start it again.

It is a script and not a switch in Settings for one reason: the app's settings live in the browser's storage, which a batch file cannot read, so the answer is kept where the launcher can see it — one small file in the app folder, the same shape as starting with Windows being one file in the Startup folder. Turning it off does not turn off the notice, which has its own switch.

**On macOS and Linux** the notice reads **get it from GitHub** and links to the releases page. Take `deskside-radio.zip`, unpack it over your app folder, and reopen the radio. There is no installer to run and nothing to uninstall.

Either way your stations, schedule and settings are untouched — see below for why.

**Nothing is installed to make that happen.** There is no service, no scheduled task, nothing written to the registry for it and nothing running when the radio is not — the same promise `Win - Start with Windows (On-Off).cmd` makes, and it is still kept. The updating is the opener doing one more thing on its way past and then exiting, which is what a scheduled task would have been for, without being one. A scheduled task is also the textbook shape of persistence malware, gets blocked on managed machines, and deserves to be.

The page itself still installs nothing and still cannot: a `file://` page has no way to run a local script, and one that could would be a hole worth more than the convenience. Everything above is the launcher, which is ours, already runs at every launch, and is the one piece with permission to act.

Three things it will not do. It never touches anything outside the app folder it was opened from, so a copy in Downloads updates that copy. It checks the archive with `tar -tf` before it writes a single file, so a truncated download is nothing having happened rather than half an app. And it fails silently — offline, behind a proxy, read-only folder — and tries again tomorrow, because the radio is already open and playing and an update is never worth interrupting that.

None of this applies to macOS or Linux, where there is no installer and the launcher is a shell script that opens the browser and stops.

Your stations, schedule and settings are not in the app folder. They live in the browser profile at `%LOCALAPPDATA%\DesksideRadio\profile-chrome`, so an update replaces every file in the install and loses nothing. Anything else you left beside `index.html` — a `deskside-radio-settings.js` seed, for instance — survives too: the update unpacks over the top rather than clearing the folder first.

### The registry

This app writes exactly one registry key, and it has done since 1.5.3: `HKCU\Software\Classes\desksideradio`, the handler behind the **Start when you sign in** control in Settings. Nothing else writes one — every `reg.exe` in the repository is a *query*, asking Windows where a browser was installed.

It is a file association, not a start-up entry. Nothing runs because it is there; it only tells Windows which program to hand a `desksideradio:` URL to, and the only thing that ever sends one is this app's own Settings switch. What actually starts the radio at sign-in is still one `.lnk` in the Startup folder, which you can see and delete yourself.

The name is the full one on purpose. `deskside` alone is not distinctive — Dell has sold Deskside workstations for twenty years — and a key at that name could never be swept up again without risking somebody else's. Uninstalling removes the key, and sweeps for the rest anyway, because an uninstall is the one moment the app can promise to leave nothing behind and "we are fairly sure we never wrote one" is not that promise.

What it removes has to name **this** app — the whole name, or this install's own folder path. Never a fragment: `Deskside` on its own is somebody else's software as often as not. A protocol key is checked rather than trusted even so: what its command says has to name the radio or sit in this install's folder, because the two shorter names — `deskside` and `deskside-radio` — were never ours, and whatever is at them was put there by something else. Per-user keys only; the machine-wide hive is one this app could never have reached without an administrator, and it has never asked for one.

The installer does a narrower pass: a dead protocol key, and a start-up entry pointing at a Deskside Radio folder that is no longer there — the same fault as the stale Startup shortcut, in the place nobody thinks to look. An entry pointing at a folder that still exists is left alone, whoever made it.

## Settings, and the three browsers

Each shortcut opens a browser profile of its own, and no profile can read another's storage. So the settings file beside `index.html` is the only thing all of them can see, and moving a setup between browsers means putting one there.

Two things make that work rather than nearly work.

**Export lands in the app folder.** It used to land in Downloads, where nothing ever read it — which is why settings exported from Chrome never turned up in Edge. Chrome has no command-line flag for the download folder, so the launchers write it into the profile's `Preferences` before Chrome has one of its own, and the installer amends an existing profile in place, keeping the old file beside it. Firefox gets the same through `user.js`.

**The file is read at every launch, not only on a fresh profile.** It is imported whenever its contents differ from the last version that profile took — a fingerprint of the file is kept in `seedStamp`. That is what stops it fighting the drawer: settings changed in one browser and not exported leave the file alone, so nothing is read back over them. Exporting is the deliberate act that says this file is now the word. **Whoever exported last wins**, which is the only rule that can be stated in one sentence.

A reset keeps the stamp deliberately. Otherwise the next launch would see the same file as new and import it straight back over the defaults.

### What an export carries

Everything, now. The schedule switch was written into the file and thrown away on the way back in, so a schedule exported switched on came back switched off — silently, with the drawer looking as though it had forgotten. The level and the tone travelled the same way. Every field the file holds is read back.

Each export also carries `app`, `appVersion`, `seedV` and `exportedAt` — the last in local time to the second, because it is read by a person deciding which of two files on their desktop is the one they meant. Importing says which version wrote the file, or that it is older than 1.4.8 if it carries no stamp. Older formats are all brought forward without asking; `app` is also the only honest way to refuse somebody else's JSON, since an array called `stations` is not a rare thing to find in a file.

## The browser profile

A stock Chrome profile collects some thirty folders of things fetched in the background — safe browsing lists, hyphenation dictionaries, captcha providers, on-device suggestion models, optimisation hints for pages that will never be loaded. This is a browser showing one local file with no address bar. None of it applies.

The launchers now start it with `--disable-background-networking --disable-component-update --disable-breakpad --disable-domain-reliability --disable-sync --no-pings`, a `--disable-features` list covering the optimisation-guide and segmentation downloads, and modest cache sizes. One line, in four scripts, held to the same wording by a test: a profile started with one set of flags and reopened with another fetches the lot again. The shader caches are deliberately left alone — they are small, and they are what stops every launch recompiling the same shaders.

The installer removes the ones already there, from a list written out by hand. Every name in it is something the browser downloaded and can download again; `Local Storage`, where the settings actually are, is not in the list and is never touched. That is the whole safety argument, and it is why the list is a list rather than a wildcard.

The Chrome profile is also now called `profile-chrome` rather than `profile`, so that the one folder of the three that did not say which browser it was for no longer exists. It is moved, never remade.

## What the download looks like

The root of the unzipped folder holds only things meant to be double-clicked — `index.html`, `User Reference Guide.html`, and the `Win -` and `Linux -` scripts. Everything the radio needs but nobody opens is in `assets/`: one `favicon-*.ico` per theme, and `LICENSE.txt`.

The icons sit at that same path in this repository, so the launchers name them one way and it works whether they are run from a clone or from a download. The licence is the exception: `LICENSE` stays at the repo root, where GitHub and every licence scanner looks for it, and the build writes it to `assets/LICENSE.txt` on the way into the archive.

Updating an install made before this happened leaves the old icons in the root — unpacking writes over the top and removes nothing. The installer clears those by name once it has confirmed the new set arrived.

## Frequencies, and stations that have none

A station's frequency is usually sitting in its own name — NewsTalk 1010, KISS 92.5, 98.1 CHFI — so on save that is where it is read from, using the same parser that gives a station added from the finder its dial position. The codec and bitrate come off first: a name the finder wrote reads `BBC World Service AAC+ · 101 kbps`, and 101 is squarely in the FM band, so left in it would be read as a frequency invented out of a bitrate.

What is left over is an internet-only station, which genuinely has no dial position. Those are filled in as **Web stream** and the save goes through. Saving no longer stops to ask: the old dialog interrupted to put a question whose answer was almost always "it hasn't got one", and for the rest the answer was in the name all along. When something is filled in as a web stream it says so afterwards, with a button that scrolls to the station and puts the cursor in the field.

## When a stream has been retired

A station can answer perfectly and have nothing behind it. BBC World Service serves a valid HLS playlist, with CORS, listing one variant that has returned `410 Gone` since the stream was retired — so the app dutifully handed a dead playlist to the audio element and reconnected forever.

Each rung of an HLS ladder is now asked whether it is there before any of it is played. If none of them are, the radio says **Stream is gone · check the station**, lights the lamp a steady amber — not the blinking amber of connecting, because it has finished and found nothing — and stops retrying. Only `400`, `403`, `404` and `410` count. A network error with no status at all stays temporary, so being offline is never mistaken for a station closing down. Pressing play clears what it learned and looks again.

## Reduced motion

Windows' **Accessibility → Visual effects → Animation effects**, off by default on a lot of managed machines, makes Chrome report `prefers-reduced-motion: reduce`. The app honours it: every animation stops, scrolling included.

Scrolling a name that does not fit is the one animation here that carries information rather than decorating — without it the end of the name is not slow, it is missing. So **Settings → Theme** grows a **Scroll long names anyway** switch, shown only when the system is actually asking for reduced motion. It re-enables the readout and preset marquees and nothing else; the split-flap reveal, the VFD flicker and the rest stay off.

It has to be `!important` to work, which is unusual enough to explain: the reduced-motion block carries `.tuner *, .tuner *::before, .tuner *::after { animation: none !important }`, and nothing beats an `!important` on a universal selector by being more specific.

## The window

The radio sizes its own window to the theme, and themes are not the same height — Marconi is nearly 200px taller than Editorial — so the window changes shape when you change theme. Where it sits on screen is remembered and put back before the page is drawn.

**On Windows the window cannot be resized by hand.** The Desktop shortcut and the Startup entry point at `Win - Open Deskside Radio.cmd` rather than at the browser: it starts the browser with the usual flags and then clears the window's resize grip and maximise box. That stops the edges being dragged, the title bar being double-clicked, and Win+Arrow snapping it about, while leaving the radio free to size the window itself. Once the window is locked it looks, at most once a day, for a newer version — see **Updates** above — and then exits, its console minimised. Nothing is installed and nothing is left running either way. It waits up to a minute for the window to appear — at sign-in nothing is warm, and the radio has been seen taking over a minute to come up after a reboot on a machine where it opens at once by hand. A folder without that file falls back to a shortcut aimed straight at the browser, and the window stays resizable.

There is no way to do this from the page. No web API makes a window non-resizable and no browser switch does either, which is the whole reason a launcher script exists at all.

**Everywhere else the window can still be resized, and a size set by hand is not remembered.** The radio opens where you left it, at whatever size the theme in front of it wants.

A window dragged hard into the top-left corner is the one position that cannot be reproduced. Windows gives a window an invisible resize border outside its visible frame, so the corner is a negative coordinate, and a page is not allowed to place a window partly off-screen. It comes back inset by that border, which is a few pixels.

## The mini radio

The pushpin in the top bar opens a small strip that floats above every other window — station, what it is doing, play, volume, a meter and a clock — and tucks the radio's own window out of sight behind it. The expand button on the strip puts the radio back, and so does **Escape**. The strip's close button closes the radio altogether, which is why there is only one of them: Chrome's own back-to-tab button is turned off, so one browser control means one thing.

During a slot change the strip says what is about to happen and counts the last thirty seconds down — *Schedule change in 30s*, or *Schedule play ends in 30s*, or *Schedule play ends, then freeplay in 30s* — and its fader rides the handover fade exactly as the radio's own does. Double-clicking the fader slides it back to 50.

It is a picture-in-picture window, which is the only kind a browser will float above the others. So: **Chrome, Edge, and Firefox 151 or newer.** Safari has no such window and neither does any mobile browser, and there the pushpin is not shown at all rather than offered and broken.

### The window nothing can size, and the one process this project leaves running

A page cannot decide how big one of these windows is. Chrome ignores the size it is given — 440×150, 440×240 and 600×400 were each measured opening at 1119×700, which is simply its default for the display — and although the window can be resized afterwards, that needs a live user gesture, and the gesture that opened it was spent opening it.

So on Windows the opener starts `strip-fit.ps1` beside the radio. It is the only thing this project leaves running and the only file in the folder nobody is meant to double-click. It waits for the floating window, sets it to the right size, takes its resize grip off so it cannot be dragged to some other shape, and does nothing else. It stops when the radio's window goes, with a twelve-hour backstop in case it never sees that happen, and only one ever runs at a time.

It picks the right window by asking Windows which one floats. Both windows answer to the same name — Windows captions a picture-in-picture window with the title of the page that opened it, not the title of the page inside it — and only the floating one carries the always-on-top flag.

**Everywhere else — macOS and Linux — nothing is started and nothing runs.** The strip opens at whatever size the browser chose and says so in its top-left corner, the part still on screen when an oversized window hangs off the bottom right: *Click here to show Deskside Radio Mini*. One click sizes it. That prompt is keyed to the window actually being too big rather than to the platform, so it never appears on Windows, and it will stop appearing anywhere a browser begins honouring the size it is asked for.

### Getting the radio's own window out of the way

A page cannot minimise its own window — there is no API for it — and a browser will not let one be pushed off the edge of the screen either. So the radio's window is shrunk to a placard and parked inside the floating strip's own rectangle, where an always-on-top window covers it completely. That is as close to hidden as the web gets.

It follows the strip if the strip is moved, and it does that on the strip's clock rather than its own: a browser throttles the timers of a window it believes nobody can see, which is precisely what this window is. Run from its own window, the placard lagged far enough behind a drag to show at the edges.

If the two ever do come apart, what shows is a small placard reading **Floating**, and clicking it brings the radio back.

## Tooltips

The hints are the app's own rather than the browser's. A native `title` is a grey rectangle in a system font, after a delay nothing can change, and it says nothing at all to somebody who reached the control with the keyboard — these appear on focus as well as on hover, after about four hundred milliseconds, and immediately after that while you are moving along a row. Escape dismisses one; so does pressing the thing it belongs to.

They wear the same neutral plate as the Settings drawer and the confirm dialogs rather than each of the eight faces. That is the policy already written into the sheet for everything that is chrome rather than cabinet: a face is for looking at, and a tooltip is for reading.

One thing is genuinely worse than what it replaces, and it is worth knowing why. **A tooltip drawn by the page cannot leave the window.** The native one could — it is drawn by the operating system, outside the browser entirely. This one is a popover, which escapes the cabinet's clipping and the stacking order but not the window frame. So it opens above the control if there is room, below if there is not, and beside it if there is room for neither — which in the mini radio, whose whole window is eighty-eight pixels tall, is the ordinary case.

## The app folder

Hold **Shift** on **Settings → Service** and an **Open app folder** button appears beside Reset. It copies the folder's path to the clipboard and opens the folder.

It cannot open File Explorer: a web page cannot start a program, and the one route to the real file manager would be a protocol handler that takes a path. There is a handler now, for the Start with Windows switch, and it is deliberately not that: it accepts two fixed words and nothing from a URL is ever used as a path, which is the whole reason it is safe to have registered. What it opens is the browser's own directory listing, which is the most a `file://` page is allowed — hence the path on the clipboard as well, in the backslash form Explorer's address bar and a command prompt both take.

It is behind Shift for the same reason the record button is: it sits next to Reset, and two ordinary-looking buttons where one of them wipes everything is a row asking for the wrong press.

### How the installer knows which folder is the install

`assets/installed-here.txt` is written into every folder the installer installs into, and it is never in the zip. That one file is the whole of the difference between an install and an archive somebody has just unzipped — the two hold the same files otherwise, because the installer ships inside the zip.

Without it the installer read "there is an `index.html` beside me" as "I am inside an install", which is true of an unzipped download too. Unpack `deskside-radio.zip` into Downloads, run the script in it, and the radio was installed into Downloads, with the Desktop shortcut and the Start menu entry pointing there. Now that folder is recognised as an unzipped archive, the radio goes to `%LOCALAPPDATA%\DesksideRadio\app`, and the script says so before it starts.

Deleting the file costs nothing except that the next run in that folder installs elsewhere instead of updating in place.

## Removing it

`Win - Uninstall Deskside Radio.cmd` ships inside the zip, so it is sitting in the app folder. Double-click it and it removes that folder and every shortcut the scripts wrote — on the Desktop, in the Startup folder and in the Start menu. Shortcuts are found three ways: by name (`Deskside Radio*.lnk`), by where they point, and by whether their target, working directory or arguments name a Deskside Radio folder at all. That third test was added for the stale Startup entry above — its target was `chrome.exe`, which very much exists, and the folder it pointed into was not this one, so neither of the first two reached it and it survived every uninstall.

Your stations, schedule and settings are in the browser profile, not the app folder, so they survive by default. All four profile names are checked — `profile`, `profile-chrome`, `profile-edge`, `profile-firefox` — named rather than wildcarded, because this is the line that deletes somebody's stations and it should be possible to read it and know exactly what it can reach. It asks about them separately at the end, and the answer you get by pressing Enter is to keep them — that is the one part of this that reinstalling cannot undo.

When the install was in its default place it also removes `%LOCALAPPDATA%\DesksideRadio` itself, the folder the app and the profile sit side by side in. That is the whole point of putting them there: everything the radio ever writes is under one folder, and an uninstall that leaves that folder standing has not finished. It is removed with `rd` and no `/s`, which only works on an empty directory — so keeping your settings simply makes the call fail quietly and the folder stays, holding the profile. It is only ever attempted at the default path: an install at `D:\Radio` has `D:\` above it, and that is emphatically not ours to remove.

It can also be pointed at an install somewhere else:

```
"Win - Uninstall Deskside Radio.cmd" D:\Somewhere\Radio
```

Run inside the source tree it refuses, on the same `app.css` test the installer uses.

One wrinkle worth knowing, because it looks odd from the outside: cmd holds a `.cmd` open for as long as it is running, so a script inside the app folder cannot delete the folder it is inside. It therefore copies itself to `%TEMP%` and hands the whole job over to that copy **before doing anything else** — a new window opens, the original closes, and everything from the confirmation onwards happens in the new one. That copy deletes itself when it finishes.

The handover used to be the *last* step rather than the first, which worked and could not report: by the time anything was deleted the window that would have said so was gone. If the folder could not be removed — which happens whenever the radio is still open, because the shortcut makes that folder the browser's working directory and Windows will not delete a folder something is running in — nobody was told anything at all. Now it is deleted in a window that is still there to say what happened, and says that in those words rather than leaving you with "access denied".

## Cutting a release

The release body is composed, not pasted:

```
node tools/release-notes.js > notes.md
gh release create vX.Y.Z --title "Deskside Radio X.Y.Z" --notes-file notes.md \
  deskside-radio.zip deskside-radio-X.Y.Z.zip Win-Install-or-Update-Deskside-Radio.cmd
```

The notes themselves are two lists and only two: **New features & enhancements**, then **Bug fixes**. A release that is all fixes has no features list. Every release page back to 1.0.0 is built that way, and a test holds the headings to those two words for word.

`docs/release-header.md` is the block every release page opens with — download this one file, double-click it, and what to take instead on a Mac or Linux. Below the divider comes `version.json`'s own `notes`, which is the same text the radio shows in Settings when it finds an update, so the page and the app cannot describe a release differently.

The standalone `.cmd` **must** be attached as a release asset. `raw.githubusercontent.com` serves it as `text/plain` with `nosniff`, so linking it there renders it in a browser tab instead of downloading it.

## Building the single-file version

The source is split into a stylesheet and five modules because that is how it is worked on. What ships is one HTML file with all of it inlined:

```
node tools/build-dist.js
```

That writes `dist/` — `index.html` plus the theme icons, the shortcut helpers, the licence and `User Reference Guide.html`. The icons are separate files because Windows reads them off disk rather than out of a page.

`User Reference Guide.html` is the manual: a user guide style description of the app, its features and functions. It sits beside `index.html` here as well as in the download, because **Settings → Service → Open the guide** looks in the app's own folder, so a copy run straight from this repository has to find the same file. It is a page rather than plain text because nothing shipped with Windows, macOS or Linux renders Markdown — a browser hands you a local `.md` as raw text in a `<pre>` — while every one of those machines has a browser. The link opens it in a window of its own, sized and centred on the screen the radio is on — 1000×1240 where there is room, and clamped to the screen less 80px where there is not, so a 1366×768 laptop gets a window that fits it rather than one that hangs off it. The guide has its own search in the bar across the top: four characters or more, matched against the whole text rather than the headings, listing each section it appears in with a count and marking every hit on the page.

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

One library ships with it and keeps its own licence: [hls.js](https://github.com/video-dev/hls.js) 1.7.3, the light build, under Apache-2.0, in `assets/hls.light.min.js` with the licence beside it as `assets/hls.js-LICENSE.txt`. It was taken from the npm registry's tarball and checked against the registry's published sha512, not from a CDN.

## Streams and attribution

Deskside Radio is a player, not a broadcaster. It hosts, caches, rebroadcasts and re-encodes nothing: it points an `<audio>` element at a URL you give it, exactly as a browser tab would.

It ships with three Toronto stations as a starting point — **NewsTalk 1010 (CFRB)**, **CBC Radio 1 Toronto (CBLA-FM)** and **KISS 92.5** — using the same public stream endpoints those stations' own web players use. CBC's is an HLS playlist, which current desktop browsers play straight off the audio element. Those streams, their content and their trademarks belong to their broadcasters, who are not affiliated with this project and have not endorsed it. Any station you add yourself is likewise the property of whoever runs it.

If you operate one of these streams and would rather it were not listed as a default, open an issue and it will be removed.

Type is set in faces from [Google Fonts](https://fonts.google.com/), fetched from Google at run time and falling back to the stacks named beside each one when there is no connection. The exception is **[VFD Nova](https://www.fontspace.com/vfd-nova-font-f99475)** by Nihar Mazumdar, which is not on Google Fonts and so lives in `fonts/`: a 14-segment alphanumeric used for the station name on the broadcast console theme. The designer published it as **public domain**, which is what its package records too, so it is redistributed here with the rest of the app; `fonts/VFD-Nova-LICENCE.txt` sets out that provenance. Public domain asks for no attribution — this credit is here because the font's own metadata carries a copyright line and no licence string, and a reader deserves the rest of the story. The build folds the file into the single-file version as a data URI, which is most of the difference between a 306 KB `index.html` and a 398 KB one.

Station search comes from [radio-browser.info](https://www.radio-browser.info/), a community database, and city lookup from [Open-Meteo](https://open-meteo.com/). Both are public and key-free; neither is sent anything about you beyond the query itself.
