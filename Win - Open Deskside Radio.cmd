@echo off
setlocal
rem ---------------------------------------------------------------------
rem  Deskside Radio - open it, and take the resize grip off the window
rem
rem  The Desktop shortcut and the Startup entry point here rather than
rem  straight at the browser, for one reason: a window cannot be made
rem  non-resizable from inside the page. There is no web API for it, and
rem  there is no Chrome switch for it either. The only way is to change the
rem  window's style after Windows has created it, which needs something of
rem  ours running at launch -- and a shortcut aimed at chrome.exe leaves
rem  nothing of ours running at all.
rem
rem  So this starts the browser, waits for the window to appear, and clears
rem  WS_THICKFRAME and WS_MAXIMIZEBOX. That stops the edges being dragged,
rem  the window being maximised, and Win+Arrow snapping it about. The radio
rem  can still size its own window -- SetWindowPos is not affected by the
rem  style, which was measured before any of this was written -- and it
rem  needs to, because the themes are not the same height.
rem
rem  Nothing is installed and nothing is left running. This exits as soon
rem  as the style is set, or after a minute if no window ever turns up.
rem
rem  A minute, and not the ten seconds this first had. At sign-in nothing is
rem  warm -- not the disk, not the browser, not the .NET that compiles the
rem  helper below -- and the radio has been measured taking over a minute to
rem  appear after a reboot on a machine where it opens at once by hand. A
rem  window that turns up after the wait has run out is left resizable and
rem  nothing says so, which is the worst outcome available here; the cost of
rem  waiting longer is a minimised console sitting idle in the cases where
rem  the radio never opens at all.
rem
rem  Argument 1 is the browser to use, baked into the shortcut by
rem  "Win - Create Desktop Shortcut (Chrome).cmd" so that the browser
rem  detection stays in one place. With no argument the page is opened with
rem  whatever the default browser is, unwindowed and unlocked, which is the
rem  same fallback that script has always had.
rem ---------------------------------------------------------------------

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "APPDIR=%~dp0"
set "APPROOT=%APPDIR:~0,-1%"
set "TARGET=%APPDIR%index.html"
set "PROFILE=%LOCALAPPDATA%\DesksideRadio\profile-chrome"
set "BROWSER=%~1"

rem The profile used to be called plainly "profile", while the Edge and
rem Firefox ones carried their browser's name -- so the one folder that
rem did not say which browser it was for was the one there are three of.
rem The installer renames it; this is the same rename for a folder the
rem installer has not reached. It moves the folder rather than starting a
rem new one, so the stations and the schedule inside it come along.
if not exist "%PROFILE%\" if exist "%LOCALAPPDATA%\DesksideRadio\profile\" (
  move "%LOCALAPPDATA%\DesksideRadio\profile" "%PROFILE%" >nul 2>&1
)
rem If the move could not happen -- something is still sitting in the old
rem folder -- go on using the old one rather than starting an empty new
rem one. An empty profile is the alarming outcome here: the radio comes up
rem with none of your stations, and nothing on screen says why.
if not exist "%PROFILE%\" if exist "%LOCALAPPDATA%\DesksideRadio\profile\" set "PROFILE=%LOCALAPPDATA%\DesksideRadio\profile"

rem Which browser's profile, when the shortcut says. Argument 2, and only
rem "profile-edge" is accepted: the Edge shortcut passes it, because that
rem shortcut's stations have always lived there, and anything else -- no
rem argument, or one that is not on this list -- keeps profile-chrome exactly
rem as before. So a Chrome shortcut driving Edge on a machine without Chrome,
rem which has been using profile-chrome all along, is not moved.
rem
rem Here and not above, deliberately. The block above moves an old unnamed
rem profile into PROFILE when PROFILE does not exist yet; pointed at
rem profile-edge, it would carry a Chrome user's stations into Edge's folder.
if /i "%~2"=="profile-edge" set "PROFILE=%LOCALAPPDATA%\DesksideRadio\profile-edge"

rem ---------------------------------------------------------------------
rem  The flags that keep the profile small.
rem
rem  A stock Chrome profile fills with some thirty folders of things it
rem  fetched in the background and this radio will never consult: safe
rem  browsing lists, hyphenation dictionaries, captcha providers,
rem  on-device suggestion models, optimisation hints for pages it is
rem  never going to load. It is a browser showing one local file, with no
rem  address bar to type anywhere else into. None of it applies.
rem
rem  The same flags shorten the first launch, which is where they were
rem  first noticed: a brand new profile spends that time fetching them,
rem  and that is the white window somebody sees after a clean install.
rem
rem  The shader caches are deliberately NOT disabled. They are small, and
rem  they are the reason every launch is not recompiling the same shaders.
rem
rem  This exact line also appears in the two shortcut scripts, which build
rem  their own command lines. A test holds the three to the same wording.
rem ---------------------------------------------------------------------
set "LEAN= --disable-background-networking --disable-component-update --disable-breakpad --disable-domain-reliability --disable-sync --no-pings --disable-features=OptimizationHints,OptimizationGuideModelDownloading,SegmentationPlatform,MediaRouter --disk-cache-size=16777216 --media-cache-size=16777216"

if not exist "%TARGET%" (
  echo.
  echo   Could not find index.html next to this script.
  echo   Keep this file in the Deskside Radio folder.
  echo.
  pause
  exit /b 1
)

rem No browser named: open it the ordinary way and leave the window alone.
if not defined BROWSER (
  start "" "%TARGET%"
  exit /b 0
)

rem ---- is there a shortcut on the Desktop -------------------------------
rem The page has a button offering to make one, and no way on earth to find
rem out whether it is needed. A page opened from a disk cannot look at the
rem disk. It can load a script, though -- the same door the settings seed
rem and the version probe come through -- so the answer is left where it
rem can read it.
rem
rem Written after the browser has been told to start, not before: this is
rem a directory listing and a PowerShell launch, and neither belongs
rem between a double-click and the radio. The page usually takes longer to
rem load than this takes to run, and on the occasion it does not, the file
rem still holds what was true at the last launch. A cosmetic button being
rem one launch behind is not worth a slower start.
rem
rem Absent or unreadable means show the button. Never hide on not knowing:
rem a listener whose shortcut is gone needs that button more than anyone,
rem and the same rule is what leaves macOS and Linux exactly as they were,
rem since nothing of ours runs at launch there to write this at all.
rem
rem Asked for by name, and only by the full name. "Deskside Radio*.lnk"
rem covers the Edge and Firefox ones, which carry the browser in brackets.
rem
rem The Startup entry is checked in the same breath -- the same kind of fact,
rem and a second PowerShell launch to learn it would cost more than the answer
rem is worth -- but written into a file of its own. This one describes the
rem Desktop and cannot change while the radio runs; that one changes precisely
rem because somebody asked it to, from the switch in Settings, and the on-off
rem script rewrites it when they do.
rem
rem Unlike the Desktop shortcut it is asked for by its exact name: the Startup
rem entry is written by one script and always called "Deskside Radio.lnk", so a
rem wildcard here would only let somebody else's shortcut answer for ours.
rem
rem Before the browser rather than after it, which is a change from how this
rem was first written. The old comment argued for putting it after, so that no
rem PowerShell launch sat between a double-click and the radio. Right instinct,
rem wrong trade: the page reads this file while it loads, and below the block
rem that starts Chrome and waits on its window it is written afterwards -- and
rem where no new window ever appears, that wait runs its full sixty seconds
rem before letting go. A switch in Settings reads this now, so it has to be
rem true when the page asks, not true a minute later.
rem
rem Measured: written 0.6s after the double-click from here, and the browser
rem start it now sits in front of costs a couple of hundred milliseconds.
rem
rem Detaching it with start would have cost nothing at all, and does not work:
rem start re-parses a -Command assembled from thirty caret-joined quoted
rem fragments, and nothing ran. Called directly, as it always was.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command ^
  "try {" ^
  "  $d = [Environment]::GetFolderPath('Desktop');" ^
  "  $has = $false;" ^
  "  if ($d -and (Test-Path -LiteralPath $d)) {" ^
  "    $found = @(Get-ChildItem -LiteralPath $d -Filter 'Deskside Radio*.lnk' -ErrorAction SilentlyContinue);" ^
  "    $has = ($found.Count -gt 0) };" ^
  "  $sf = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup';" ^
  "  $boot = $false;" ^
  "  if (Test-Path -LiteralPath $sf) {" ^
  "    $boot = (Test-Path -LiteralPath (Join-Path $sf 'Deskside Radio.lnk')) };" ^
  "  $out = Join-Path $env:APPROOT 'assets';" ^
  "  if (Test-Path -LiteralPath $out) {" ^
  "    $line = '/* Written by the launcher at each start. Whether a shortcut for' + [Environment]::NewLine" ^
  "      + '   this radio is on the Desktop right now. */' + [Environment]::NewLine" ^
  "      + 'window.DESKSIDE_HAS_SHORTCUT = ' + $has.ToString().ToLower() + ';' + [Environment]::NewLine;" ^
  "    Set-Content -LiteralPath (Join-Path $out 'shortcut.js') -Value $line -Encoding ASCII -NoNewline;" ^
  "    $line2 = '/* Written whenever the start-up entry is changed,' + [Environment]::NewLine" ^
  "      + '   and at every launch. Whether this radio is set to' + [Environment]::NewLine" ^
  "      + '   open when you sign in. */' + [Environment]::NewLine" ^
  "      + 'window.DESKSIDE_STARTS_WITH_WINDOWS = ' + $boot.ToString().ToLower() + ';' + [Environment]::NewLine;" ^
  "    Set-Content -LiteralPath (Join-Path $out 'startup.js') -Value $line2 -Encoding ASCII -NoNewline }" ^
  "} catch { }"

rem One PowerShell call does the lot, because it is the only thing here
rem that can build a file:// URL, wait on a window and call into user32.
rem Every quote is [char]34: a literal one would close the -Command string
rem cmd is holding open.
rem
rem It also starts the strip fitter. The radio can float a compact strip
rem above every other window and cannot decide how big that window is:
rem Chrome ignores the size asked for, and the page may only resize it
rem while a user gesture is live -- and the gesture that opened it has
rem already been spent opening it. From outside the browser there is no
rem such rule. strip-fit.ps1 sizes that window once and stops itself when
rem the radio goes; it is guarded on the file being present, so a copy
rem installed before it existed still launches.
"%PS%" -NoProfile -ExecutionPolicy Bypass -Command ^
  "$q = [char]34;" ^
  "$u = $q + 'user32.dll' + $q;" ^
  "$url = ([Uri]$env:TARGET).AbsoluteUri;" ^
  "$flags = '--app=' + $q + $url + $q +" ^
  "  ' --autoplay-policy=no-user-gesture-required' +" ^
  "  ' --window-size=1133,741' +" ^
  "  ' --user-data-dir=' + $q + $env:PROFILE + $q +" ^
  "  ' --no-first-run --no-default-browser-check' + $env:LEAN;" ^
  "Start-Process -FilePath $env:BROWSER -ArgumentList $flags;" ^
  "$fit = $env:APPROOT + '\strip-fit.ps1';" ^
  "if (Test-Path -LiteralPath $fit) {" ^
  "  Start-Process -FilePath $env:PS -WindowStyle Hidden" ^
  "    -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File ' + $q + $fit + $q);" ^
  "}" ^
  "$cs = @(" ^
  "  'using System; using System.Text; using System.Collections.Generic;'," ^
  "  'using System.Runtime.InteropServices;'," ^
  "  'public class DsWin {'," ^
  "  '  public delegate bool Cb(IntPtr h, IntPtr l);'," ^
  "  '  [DllImport(' + $u + ')] static extern bool EnumWindows(Cb cb, IntPtr l);'," ^
  "  '  [DllImport(' + $u + ')] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);'," ^
  "  '  [DllImport(' + $u + ')] static extern bool IsWindowVisible(IntPtr h);'," ^
  "  '  [DllImport(' + $u + ')] static extern int GetWindowLong(IntPtr h, int i);'," ^
  "  '  [DllImport(' + $u + ')] static extern int SetWindowLong(IntPtr h, int i, int v);'," ^
  "  '  [DllImport(' + $u + ')] static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);'," ^
  "  '  public static int Lock(string tail) {'," ^
  "  '    int n = 0;'," ^
  "  '    EnumWindows(delegate (IntPtr h, IntPtr l) {'," ^
  "  '      if (!IsWindowVisible(h)) return true;'," ^
  "  '      StringBuilder sb = new StringBuilder(512);'," ^
  "  '      GetWindowText(h, sb, 512);'," ^
  "  '      if (!sb.ToString().EndsWith(tail)) return true;'," ^
  "  '      int s = GetWindowLong(h, -16);'," ^
  "  '      if ((s & 0x40000) == 0) return true;'," ^
  "  '      SetWindowLong(h, -16, s & ~0x40000 & ~0x10000);'," ^
  "  '      SetWindowPos(h, IntPtr.Zero, 0, 0, 0, 0, 0x0002 | 0x0001 | 0x0004 | 0x0020);'," ^
  "  '      n++;'," ^
  "  '      return true;'," ^
  "  '    }, IntPtr.Zero);'," ^
  "  '    return n;'," ^
  "  '  }'," ^
  "  '}'" ^
  ") -join [Environment]::NewLine;" ^
  "Add-Type -TypeDefinition $cs;" ^
  "foreach ($try in 1..120) {" ^
  "  Start-Sleep -Milliseconds 500;" ^
  "  if ([DsWin]::Lock('Deskside Radio') -gt 0) { break }" ^
  "}"


rem ---------------------------------------------------------------------
rem  Keeping the radio up to date, without anybody having to do anything
rem
rem  Updating used to take six actions and two trips through the file
rem  system: see the notice, download a .cmd, find it in Downloads,
rem  double-click it, clear a security prompt, watch a console. The app
rem  itself cannot shorten that by one step -- a file:// page has no way to
rem  run a local script, and one that could would be a hole worth more than
rem  the convenience.
rem
rem  This script can. It already runs at every launch and at every sign-in,
rem  it is ours, and it exits. So it does the work the page cannot ask for.
rem
rem  After the window, never before it. An update that ran first would put
rem  a few seconds of downloading between a double-click and the radio, on
rem  the one day it happens, with nothing on screen to explain the wait.
rem  Running it here means a failure cannot keep the radio from opening,
rem  and the worst case is that the update lands tomorrow instead.
rem
rem  The new version is on disk but not in the window: the page was loaded
rem  before any of this ran. It takes effect at the next launch, where the
rem  readout says which version it is now running.
rem
rem  Nothing is installed to make this happen. No service, no scheduled
rem  task, no registry key, nothing left running. This process exits a
rem  moment after the download, as it always did.
rem ---------------------------------------------------------------------
call :autoupdate
exit /b 0

:autoupdate
rem Off is a file, because a batch script cannot read the app's settings --
rem those live in the browser's storage, which is not ours to open. So
rem "Win - Automatic Updates.cmd off" leaves a marker here and this looks
rem for it, the same shape as the Startup entry being a file in a folder.
if exist "%APPDIR%assets\auto-update-off.txt" exit /b 0

rem At every launch, and there used to be a stamp here that made it once a
rem day. It went because of what it did on the day it mattered: the app
rem notices a release at noon, the listener closes the radio and opens it
rem again to take it, and nothing happens -- the launcher looked this
rem morning and considers the day done. The notice now offers to close the
rem radio for exactly that purpose, so a check that might quietly decline
rem would make the offer a lie.
rem
rem It costs about a kilobyte. And it is self-limiting: once the update is
rem in, version.txt matches the feed and there is nothing to fetch, so
rem asking again costs the question and never the answer.
rem
rem The date is still worked out, because the lock below is dated.
set "TODAY="
for /f %%A in ('%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -Command "(Get-Date).ToString('yyyy-MM-dd')"') do set "TODAY=%%A"
if not defined TODAY exit /b 0

rem One updater at a time. Two open radios mean two of these; whoever gets
rem the lock does the work and the other goes away. The lock carries the
rem date so a crash cannot wedge it shut for ever.
set "LOCK=%TEMP%\deskside-radio-update.lock"
rem Read on its own line, not inside a parenthesised block. cmd expands a
rem %variable% when it parses the block, which is before any line in the
rem block has run -- so the read filled LOCKDAY and the comparison was still
rem looking at the empty string it held a moment earlier. Measured: two
rem radios open, the second one updated anyway. The stamp check above never
rem had the bug because it was never wrapped in a block.
set "LOCKDAY="
if exist "%LOCK%" set /p LOCKDAY=<"%LOCK%"
if "%LOCKDAY%"=="%TODAY%" exit /b 0
> "%LOCK%" echo %TODAY%

rem What is here, and what is published. version.txt is one line written by
rem the build; the feed is the same file the radio itself reads.
set "HAVE="
if exist "%APPDIR%assets\version.txt" set /p HAVE=<"%APPDIR%assets\version.txt"
if not defined HAVE goto :nothingtodo

set "FEED=%TEMP%\deskside-radio-feed.json"
if exist "%FEED%" del /q "%FEED%" >nul 2>&1
"%SystemRoot%\System32\curl.exe" -fsL --max-time 8 -o "%FEED%" "https://raw.githubusercontent.com/markticulous/deskside-radio/main/version.json"
if errorlevel 1 goto :nothingtodo
if not exist "%FEED%" goto :nothingtodo

rem Newer, not merely different. Compared component by component, so 1.4.10
rem is newer than 1.4.9 -- which a string comparison gets backwards.
set "NEWER="
set "ANSWER=%TEMP%\deskside-radio-answer.txt"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "try { $f = (Get-Content -Raw -LiteralPath $env:FEED | ConvertFrom-Json).version; $a = [version]$f; $b = [version]$env:HAVE; if ($a -gt $b) { $f } } catch { }" > "%ANSWER%" 2>nul
if exist "%ANSWER%" set /p NEWER=<"%ANSWER%"
del /q "%ANSWER%" "%FEED%" >nul 2>&1
if not defined NEWER goto :nothingtodo

rem Run from a copy -- and that goes for this file too.
rem
rem A batch file being executed can be overwritten on Windows. That was
rem measured; the write succeeds. What does not survive it is the script,
rem because cmd does not read a batch file once. It reads the next line
rem each time it needs one, by byte offset, out of whatever is on disk at
rem that moment. Replace the file underneath it and it carries on at the
rem same offset in a different file -- past the end of a shorter one, or
rem into the middle of a line of a longer one.
rem
rem The zip carries the installer AND this launcher, so the extract
rem replaces both. The installer is handled by running the copy below. The
rem launcher is handled by not being here any more: see the hand-over.
rem
rem Measured, before it was: the launcher went quiet the instant the
rem install finished and never wrote its stamp, so every launch checked
rem again. That is the mild version. The same offset landing mid-line in a
rem longer file runs whatever the rest of that line happens to say.
set "SRC=%APPDIR%Win-Install-or-Update-Deskside-Radio.cmd"
if not exist "%SRC%" goto :nothingtodo
set "RUNNER=%TEMP%\deskside-radio-autoupdate.cmd"
copy /y "%SRC%" "%RUNNER%" >nul 2>&1
if not exist "%RUNNER%" goto :nothingtodo

rem Four lines in %TEMP%, because nothing of ours can still be running in
rem the app folder once the extract starts. This does the install, then
rem clears the lock and tidies up after itself. Both files it touches are
rem in %TEMP%, which the extract does not reach.
set "STEP=%TEMP%\deskside-radio-update-step.cmd"
> "%STEP%" echo @echo off
>>"%STEP%" echo call "%RUNNER%" "%APPROOT%"
>>"%STEP%" echo del /q "%LOCK%" ^>nul 2^>^&1
>>"%STEP%" echo del /q "%RUNNER%" ^>nul 2^>^&1
if not exist "%STEP%" goto :nothingtodo

rem Quiet: asks nothing, says nothing, opens nothing, and leaves the
rem playing radio alone. It still checks the archive before it writes a
rem single file. Inherited through start, which passes this environment on.
set "DESKSIDE_QUIET=1"

rem /b so it takes no window of its own -- this console is hidden, having
rem been started by the .vbs, and a second one would be the taskbar blip
rem all over again.
rem
rem Then exit, not exit /b. exit /b returns to the line after the call, and
rem reading that line means reading this file, which is the thing being
rem replaced. exit ends cmd where it stands: there is no next line to go
rem looking for. The radio is already open and playing; this process had
rem nothing left to do anyway.
start "" /b "%SystemRoot%\System32\cmd.exe" /c "%STEP%"
exit

:nothingtodo
rem Offline, blocked, nothing published, a version that will not parse: all
rem the same answer. Drop the lock so the next launch may try, and go.
del /q "%LOCK%" >nul 2>&1
exit /b 0
