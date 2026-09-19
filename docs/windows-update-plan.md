# A hands-off update for Windows

Research and plan. No code changed.

## The problem, counted

Updating today takes six actions, two of which are file-system navigation:

1. Notice the pill.
2. Click **download the updater**.
3. Find the file in Downloads.
4. Double-click it.
5. Clear the *"Open File – Security Warning"* prompt.
6. Watch a console, and wait while the radio closes and reopens.

The cheaper route — the copy already in the app folder, which carries no Mark
of the Web — is worse for anyone who is not comfortable with Windows: it lives
in `%LOCALAPPDATA%\DesksideRadio\app`, a path that is hidden by default and
cannot be typed from memory. The Start menu entry avoids that, but only exists
where the installer made one, and it still means leaving the radio to go and
find something.

None of this is a bug. It is the consequence of a rule: **the page cannot start
a process.** A `file://` page has no way to run a local script, and one that
could would be a hole worth more than the convenience. So the app can only ever
*tell* somebody an update exists.

The thing the app cannot do, the launcher already does.

## What cannot change

These are settled and this plan keeps all of them:

- **No administrator, ever.** Per-user install is why there is no UAC prompt on
  an update.
- **No service, no scheduled task, no `Run` key.** Both readmes promise this in
  those words, and a scheduled task is also the textbook shape of persistence
  malware — it gets blocked on managed machines and deserves to be.
- **Nothing running when the radio is not.**
- **No code signing**, so anything the browser downloads carries a Mark of the
  Web and prompts once.

## Options considered

| | verdict |
|---|---|
| **A. The launcher updates** — the opener script, which already runs at every launch, does the work | **recommended** |
| **B. A `deskside://` protocol handler** so the page can trigger the updater | possible, rejected below |
| **C. Scheduled task or background updater** | rejected: breaks a stated promise, blocked on managed machines |
| **D. winget / MSIX / Squirrel / Electron autoUpdater** | rejected: needs a publisher identity and a manifest PR per release; the app is not Electron |
| **E. Clearer instructions** | this is the status quo, and the status quo is the complaint |

**B** deserves a sentence, because it nearly works. Writing one key under
`HKCU\Software\Classes\deskside` would let the notice in the app be a real
button: click it, Windows starts the updater. It is per-user, needs no admin
and is reversible. It is rejected because it breaks the "nothing in the
registry" promise for a gain that **A** delivers with nothing written at all —
and because it still puts a "Do you want to open Deskside Radio?" prompt in
front of somebody who has already said what they want.

## Recommended: the launcher updates

The Desktop shortcut and the Startup entry do not point at the browser. They
point at `Win - Open Deskside Radio.vbs`, which runs `Win - Open Deskside
Radio.cmd`, which starts the browser and then takes the resize grip off the
window. **That script is ours, it runs at every single launch, and it exits.**
It is the one piece of the system that already has permission to act and no
promise to break.

### The flow

1. Shortcut → `.vbs` → opener `.cmd`, as today. No console window.
2. The opener starts the browser and locks the window, as today.
3. **Then**, in the same process, it looks at a stamp file. If the last check
   was under N hours ago, it exits. Nothing else happens.
4. Otherwise it fetches `version.json` — about 1 KB — and compares.
5. If a newer version exists, it downloads the zip to `%TEMP%`, validates it
   with `tar -tf` before writing anything, hands over to a copy of itself in
   `%TEMP%`, extracts over the app folder, refreshes the shortcuts, and stamps
   the check.
6. It exits. The radio is still playing, untouched.
7. **The next launch runs the new version**, and the readout announces
   `UPDATED TO V1.4.13` — the flash that already exists.

### Why after the window, not before

Launch stays instant. An update that ran first would put two to five seconds of
downloading between a double-click and the radio, on the one day it happens,
with nothing on screen to explain the wait. Running it afterwards means a
failure cannot stop the radio opening, and the worst case is that the update
lands tomorrow instead.

The cost: the new version takes effect one launch later. For a radio that gets
opened daily this is not a real delay, and it is what makes the announcement
land on a launch rather than mid-listen.

### Details that have to be right

- **Never overwrite the script that is executing.** Measured: Windows *permits*
  overwriting a running `.cmd`, but `cmd.exe` re-reads the file as it goes, so
  the write succeeding is not the same as it being safe. The updater hands over
  to a copy in `%TEMP%` first — the same pattern the uninstaller already uses
  for the same reason.
- **One updater at a time.** Two open radios mean two openers. A lock file,
  taken by whoever gets there first; the other exits.
- **Validate before writing.** `tar -tf` the archive first, as the installer
  already does. A truncated download becomes nothing having happened.
- **Fail silently.** Offline, blocked by a proxy, read-only folder, anything
  else: exit and try again tomorrow. The radio is already open and playing; an
  update is never worth interrupting that.
- **Keep the manual installer.** It stays the route for first installs, for
  repair, and for anybody who would rather do it themselves.

### What the listener sees

Nothing while it happens. On the next launch, the readout says which version it
is now running. **Settings → Service** keeps a switch, and the notice changes
from an instruction to a statement: *"Updates install themselves. Nothing to
do."*

That is fewer moving parts than today, not more: no download, no Downloads
folder, no security prompt, no console, no closing and reopening the radio.

## The promise this breaks

Both readmes say, in bold:

> **Nothing is downloaded or replaced until you ask for it.**

Auto-update contradicts that, and it should not be done quietly. Three honest
positions:

1. **Default on, with a switch and an announcement.** The readout says what
   happened on the next launch, Settings can turn it off, and the readmes are
   reworded to say what the app now does. Fully hands-off, which is what was
   asked for.
2. **Default off, opt in once.** Honest, but the people this is meant to help
   are exactly the people who will never find the switch.
3. **Download automatically, install on the next launch after a confirmation.**
   The confirmation would have to live in the app, and the app cannot run the
   installer — so this collapses back into today's problem.

**Recommendation: 1.** The switch and the announcement together are the
disclosure, and the readmes stop describing a procedure nobody should have to
follow.

## Risks

| risk | handling |
|---|---|
| Files change without being asked | Switch, plus the announcement on next launch. Per-user folder only. |
| Partial or corrupt download | `tar -tf` before the first write; failure leaves the folder untouched. |
| Two radios open at once | Lock file; the second opener exits. |
| Managed machine blocks the fetch | Fails silently; the manual route still works. |
| The update breaks something | The zip is unchanged from what the manual installer uses, so the blast radius is the same as today — but it reaches people faster, which cuts both ways. |
| Somebody moved the app folder | The opener knows where it is (`%~dp0`) and updates that folder, wherever it sits. |

## What would change

- `Win - Open Deskside Radio.cmd` — the whole feature lives here.
- `Win-Install-or-Update-Deskside-Radio.cmd` — unchanged in behaviour; it stays
  the first-install and repair route.
- `app.js` / `index.html` — a switch in Settings → Service, and the notice
  reworded from an instruction to a statement.
- `README.md`, `README.html` — the update section shrinks to a paragraph.
- `tests/release.test.js` — guards for the lock, the validate-before-write, the
  hand-over, and the fail-silent paths.

## Open questions

1. **Default on or off?** Recommending on, with the switch and the
   announcement as disclosure.
2. **How often to check?** Recommending once per 24 hours, on launch. The app's
   own six-hour notice check is separate and can stay as it is.
3. **Should a sign-in launch update too?** The Startup entry runs the same
   opener, so it would by default. Recommending yes.
