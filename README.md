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

## What it does

- **Stations.** Any stream URL with a name, frequency, colour and tagline. A built-in finder looks up stations near a city through [radio-browser](https://www.radio-browser.info/), which is public and key-free.
- **Schedule.** Weekday and weekend time slots, each choosing a station and optionally forcing volume, bass, treble or theme when it starts. End times are exclusive: `07:00` to `10:00` stops at `10:00:00`.
- **Themes.** Analogue dial, broadcast console, Rams minimal, editorial. Each has its own desktop icon.
- **Watchdog.** A frozen media clock plus a starved buffer means the stream died; it reconnects with exponential backoff rather than sitting silent.
- **Memory.** Theme, station, volume and per-station tone come back exactly as you left them — unless a schedule slot covering that moment says otherwise, in which case the schedule wins.

Everything is kept in `localStorage` on the machine it runs on. Nothing is uploaded.

## Updates

Once a day the app fetches [`version.json`](version.json) from this repo and says so in **Settings → Data** if a newer version has been published. It sends no identifiers, downloads nothing, and installs nothing. The switch beside it turns the check off for good.

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

It ships with two Toronto stations as a starting point — **NewsTalk 1010 (CFRB)** and **KISS 92.5** — using the same public stream endpoints those stations' own web players use. Those streams, their content and their trademarks belong to their broadcasters, who are not affiliated with this project and have not endorsed it. Any station you add yourself is likewise the property of whoever runs it.

If you operate one of these streams and would rather it were not listed as a default, open an issue and it will be removed.

Station search comes from [radio-browser.info](https://www.radio-browser.info/), a community database, and city lookup from [Open-Meteo](https://open-meteo.com/). Both are public and key-free; neither is sent anything about you beyond the query itself.
