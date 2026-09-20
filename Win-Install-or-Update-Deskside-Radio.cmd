@echo off
setlocal
rem Deskside Radio - install it, or update it. Both, from one file.
rem
rem This script ships twice: as a download on its own from the releases
rem page, and inside the zip. So once it has run, a copy of it is always
rem sitting in the app folder, replaced by every update along with
rem everything else. Run whichever copy you have.
rem
rem It needs no settings file, no registry key and no remembered path,
rem because one rule decides everything:
rem
rem   If index.html is beside this script, this folder is the install and
rem   we are updating it. Otherwise install into argument 1, or the
rem   default below.
rem
rem The default is %LOCALAPPDATA%\DesksideRadio\app, a sibling of the
rem browser profile the shortcut already makes, so everything the radio
rem ever writes is under one folder and uninstalling is deleting it. It
rem needs no administrator, so there is no UAC prompt, on this run or on
rem any update. Program Files would cost one every single time.
rem
rem Your stations and settings are NOT in this folder. They live in the
rem browser profile at %LOCALAPPDATA%\DesksideRadio\profile, so replacing
rem everything here loses nothing, and moving the folder loses nothing
rem either.
rem
rem   "Win-Install-or-Update-Deskside-Radio.cmd"            the usual way
rem   "Win-Install-or-Update-Deskside-Radio.cmd" D:\Radio   somewhere else

title Deskside Radio - install or update

rem ---- quiet mode -------------------------------------------------------
rem DESKSIDE_QUIET is set by the launcher, which updates the radio in the
rem background at most once a day while it is playing. In that mode this
rem script asks nothing, says nothing, pauses at nothing, and leaves the
rem running radio alone -- no closing it, no reopening it, no opening a
rem window of any kind. It still downloads, still checks the archive before
rem it writes, and still refreshes the shortcuts.
rem
rem Every difference is in this one variable, so the thing that runs
rem unattended is the same script that has been run by hand for months.
if defined DESKSIDE_QUIET set "DESKSIDE_NOPAUSE=1"

if not defined DESKSIDE_QUIET (
  echo.
  echo   DESKSIDE RADIO - INSTALL OR UPDATE
  echo.
)

set "ZIPURL=https://github.com/markticulous/deskside-radio/releases/latest/download/deskside-radio.zip"
set "CMDURL=https://github.com/markticulous/deskside-radio/releases/latest/download/Win-Install-or-Update-Deskside-Radio.cmd"
set "DEFAULT=%LOCALAPPDATA%\DesksideRadio\app"

rem curl and tar have both shipped with Windows since 10 version 1803.
rem Named by their full paths: a double-clicked .cmd runs with its own
rem folder as the current directory, cmd looks there before it looks along
rem PATH, and for this script that folder is usually Downloads -- which is
rem the one place on the machine full of files nobody vetted.
set "CURL=%SystemRoot%\System32\curl.exe"
set "TAR=%SystemRoot%\System32\tar.exe"
set "FINDSTR=%SystemRoot%\System32\findstr.exe"
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if not exist "%CURL%" goto :tooold
if not exist "%TAR%" goto :tooold

rem Running the repository's own copy would extract the built single-file
rem index.html over the source one. app.css is in the source tree and is
rem inlined away by the build, so it tells the two apart exactly.
if exist "%~dp0app.css" goto :repo

rem ---- where does it go -------------------------------------------------
rem APPDIR keeps its trailing backslash, for joining names onto. APPROOT
rem has it removed, for handing to an .exe: tar -C "C:\path\" is broken,
rem because the backslash escapes the closing quote and tar is given a
rem path with a quote on the end of it. The other scripts never hit this
rem only because they pass paths to PowerShell as environment variables.
rem Any trailing backslashes come off the argument before one is put back,
rem or "D:\Radio\" arrives as "D:\Radio\\", the strip below leaves one of
rem them, and tar is handed a path with a quote on the end after all.
set "ARG=%~1"
:trimslash
if not defined ARG goto :trimmed
if not "%ARG:~-1%"=="\" goto :trimmed
set "ARG=%ARG:~0,-1%"
goto :trimslash
:trimmed

rem Where this goes. "index.html sits beside me, so I am inside an install"
rem was the rule, and it was wrong: an archive unzipped into Downloads has
rem exactly that shape, because the installer ships inside the zip. Somebody
rem who downloaded deskside-radio-1.4.5.zip, unpacked it and ran the script
rem in it had the radio installed into their Downloads folder, with the
rem Desktop shortcut and the Start menu entry both pointing there.
rem
rem So an install is now marked as one. assets\installed-here.txt is written
rem at the end of every run, and it is not in the zip -- nothing but this
rem script ever creates it, which is what makes it mean something. A folder
rem holding it was installed into; a folder without it was unpacked into.
set "MARKER=assets\installed-here.txt"

set "UPDATING="
if exist "%~dp0index.html" if exist "%~dp0%MARKER%" (
  set "APPDIR=%~dp0"
  set "UPDATING=1"
)
set "UNPACKED="
if not defined UPDATING if exist "%~dp0index.html" set "UNPACKED=1"
if not defined UPDATING if not defined ARG set "APPDIR=%DEFAULT%\"
if not defined UPDATING if defined ARG set "APPDIR=%ARG%\"
call set "APPROOT=%%APPDIR:~0,-1%%"

rem An install already at the target is an update, wherever the script was
rem run from. This is the ordinary case for the route the app recommends:
rem download the installer, double-click it in Downloads, and the folder it
rem installed to last time is the folder it writes to now.
rem
rem It also has to come before the guard below, which used to fire on it.
rem That guard tested only whether the target had anything in it, while its
rem message said "none of them is index.html" -- so downloading the
rem installer and running it with a perfectly good install in place was
rem refused, and refused with an explanation of a check that was never made.
if not defined UPDATING if exist "%APPDIR%index.html" set "UPDATING=1"

rem A mistyped argument should not scatter seventeen files through
rem someone's Documents. An existing folder is only written into if it is
rem empty or is an install, and by here an install has set UPDATING.
if not defined UPDATING if exist "%APPROOT%\" (
  dir /b "%APPROOT%" 2>nul | "%FINDSTR%" /r "." >nul && goto :occupied
)

rem ---- run the published installer, not this one ------------------------
rem
rem This script is shipped inside the zip, so after the first install a
rem copy sits in the app folder and every update replaces it. That copy is
rem always one release behind the thing it is about to install -- and it
rem is the copy that runs. A change made here to fix something about
rem installing can therefore never reach the run that needs it: whoever
rem has the bug has the old script, and the old script is what executes.
rem
rem So the newest one is fetched first and, if it differs from this file
rem by a single byte, handed the job. It is 20 KB and one request, before
rem anything has been written. The child is told where to install, because
rem it runs from %TEMP% and the "am I in an install folder" rule above
rem would otherwise give it a different answer from the one worked out
rem here; and it is told not to do this again, so there is exactly one
rem hand-over and no way to loop.
rem
rem Nothing is trusted that was not already being trusted: the file comes
rem from the same release, over the same https, as the zip full of code
rem this is about to unpack and run.
rem
rem Offline, the check fails and this copy carries on -- and then fails at
rem the download a moment later, with a message about the network rather
rem than about itself.
if defined DESKSIDE_QUIET goto :newest
if defined DESKSIDE_FRESH goto :newest
set "NEWCMD=%TEMP%\deskside-radio-installer.cmd"
"%CURL%" -fsL --retry 2 -o "%NEWCMD%" "%CMDURL%"
if errorlevel 1 goto :newest
if not exist "%NEWCMD%" goto :newest
"%SystemRoot%\System32\fc.exe" /b "%NEWCMD%" "%~f0" >nul 2>&1
if not errorlevel 1 goto :newest
echo   A newer installer has been published. Running that one instead.
echo.
set "DESKSIDE_FRESH=1"
call "%NEWCMD%" "%APPROOT%"
exit /b %errorlevel%
:newest

echo.
if defined UPDATING (
  echo   Updating the copy in
) else (
  rem Somebody who has just double-clicked a downloaded file and been shown
  rem a black window full of moving numbers has every reason to wonder what
  rem it is doing. So it says so, in advance, in plain words.
  echo   This downloads Deskside Radio from GitHub and sets it up for your
  echo   account only. It needs no administrator, writes nothing to the
  echo   registry, and leaves the rest of your computer alone.
  echo.
  rem An unzipped archive looks exactly like an install from the inside, so
  rem say which one this was taken for. Otherwise somebody who unpacked a
  rem zip and ran the script in it watches a folder they did not name go by
  rem in one line and has no idea the radio went somewhere else.
  if defined UNPACKED (
    echo   This folder looks like an unzipped download rather than an
    echo   installed copy, so it is not being installed into. You can
    echo   delete it once this has finished.
    echo.
  )
  echo   Installing into
)
echo      "%APPROOT%"
echo.

rem ---- fetch ------------------------------------------------------------
set "ZIP=%TEMP%\deskside-radio-download.zip"
if exist "%ZIP%" del /q "%ZIP%" >nul 2>&1

rem --progress-bar in place of curl's default table. The table is seven
rem columns of transfer statistics, mostly zeroes, and it is the single
rem most alarming thing on the screen for anyone who does not already know
rem what curl is. One bar says the same thing.
echo   Downloading...
"%CURL%" -fL --retry 2 --progress-bar -o "%ZIP%" "%ZIPURL%"
if errorlevel 1 goto :nofetch

rem Read the archive through before writing a single file out of it. One
rem line, and it turns a truncated download from a half-replaced app
rem folder into nothing having happened at all.
"%TAR%" -tf "%ZIP%" >nul 2>&1
if errorlevel 1 goto :corrupt

for %%A in ("%ZIP%") do set /a ZIPKB=%%~zA/1024
set "MSG=Downloaded and checked  (%ZIPKB% KB)"
call :ok

rem ---- which version -----------------------------------------------
rem The number was never said out loud, and after a run of releases cut
rem on one version number there was no way to tell from this window
rem whether what had just landed was the build you wanted.
rem
rem Read out of the zip rather than off the network: the archive is
rem already on this disk, so it costs no request, and it is the version of
rem the files actually about to be written rather than of whatever the
rem release page says. The installed one is read here, before the unpack,
rem because the unpack overwrites it.
rem
rem assets\version.txt is one line holding one number, written by the
rem build for this. Not version.json, which is not in the download at all,
rem and not index.html, where the number the app shows lives inlined in a
rem single 240 KB line. One line and no punctuation means set /p reads it:
rem no JSON parser, no PowerShell, nothing to quote.
rem
rem A folder installed before this existed has no such file, so OLDVER
rem stays empty and the line simply does not name what it replaced.
set "NEWVER="
set "OLDVER="
set "VTXT=%TEMP%\deskside-radio-version.txt"
if exist "%VTXT%" del /q "%VTXT%" >nul 2>&1
"%TAR%" -xOf "%ZIP%" assets/version.txt > "%VTXT%" 2>nul
if exist "%VTXT%" set /p NEWVER=<"%VTXT%"
del /q "%VTXT%" >nul 2>&1
if exist "%APPDIR%assets\version.txt" set /p OLDVER=<"%APPDIR%assets\version.txt"

rem A folder installed before assets\version.txt shipped has no such file,
rem and until every install has been through one update that is most of
rem them -- so this said "Version 1.4.13" with nothing to compare it to,
rem which is half the sentence. The number is still there: the build
rem inlines it into index.html, as one line of some 350 KB. A regex over
rem that costs one PowerShell and turns a blank into the version being
rem replaced. Only when the file is missing, so the ordinary case stays a
rem set /p over one short line.
set "ANSWER=%TEMP%\deskside-radio-answer.txt"
if not defined OLDVER if exist "%APPDIR%index.html" (
  "%PS%" -NoProfile -ExecutionPolicy Bypass -Command "try { $m = [regex]::Match((Get-Content -Raw -LiteralPath (Join-Path $env:APPROOT 'index.html')), 'APP_VERSION\s*=\s*''([0-9.]+)'''); if ($m.Success) { $m.Groups[1].Value } } catch { }" > "%ANSWER%" 2>nul
  if exist "%ANSWER%" set /p OLDVER=<"%ANSWER%"
)
del /q "%ANSWER%" >nul 2>&1

if defined NEWVER (
  if defined OLDVER (
    set "MSG=Version %NEWVER%, replacing %OLDVER%"
  ) else (
    set "MSG=Version %NEWVER%"
  )
  call :ok
)

rem ---- close the radio first --------------------------------------------
rem
rem Unpacking over a running radio usually works -- Chrome reads
rem index.html at load and does not hold it open -- but two things after
rem it do not. Windows will not move a folder a running browser is
rem sitting in, so the profile rename below fails silently and the next
rem launch points at a folder that is not there and starts an empty one:
rem the radio comes up with none of your stations, which looks exactly
rem like losing them. And the trim skips whatever is locked.
rem
rem So the radio is closed here, by this script, with nothing asked.
rem
rem What is closed is the narrow thing: a process named chrome.exe,
rem msedge.exe or firefox.exe **whose own command line names this app's
rem profile folder**. An ordinary browser window has no such argument and
rem is not touched -- somebody's tabs are not ours to close, and a script
rem that shut down Chrome to update a radio would deserve everything said
rem about it. Nothing else on the machine matches, including this script,
rem which is a .cmd and not in that list of three.
rem
rem After the download, so a failed download never costs you the window
rem you were listening to, and before the first write.
rem
rem The pipes below are bare | and not ^|. Inside a quoted -Command line
rem cmd does not process the caret, so ^| reaches PowerShell as a literal
rem caret and the whole block dies with "Unexpected token '^'" -- which
rem is the fault that had the 1.4.2 uninstaller reporting success while
rem removing nothing. A literal pipe in the output is built with
rem [char]124 for the same reason.
rem Not in quiet mode. The whole point of updating from the launcher is
rem that the radio goes on playing; closing it to replace files under it
rem would be worse than the download it saves. The profile rename and the
rem trim are what needed a closed radio, and both are one-time work that
rem has already happened by the time this route is in use.
set "CLOSED="
set "CLOSEDN=0"
set "CLOSEDB=C"
if defined DESKSIDE_QUIET goto :radioleftalone
set "ANSWER=%TEMP%\deskside-radio-answer.txt"
"%PS%" -NoProfile -ExecutionPolicy Bypass -Command ^
  "$names = 'chrome.exe', 'msedge.exe', 'firefox.exe';" ^
  "$mine = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {" ^
  "  $names -contains $_.Name -and $_.CommandLine -and" ^
  "  $_.CommandLine -like '*DesksideRadio\profile*' };" ^
  "$key = 'C';" ^
  "if ($mine | Where-Object { $_.Name -eq 'firefox.exe' }) { $key = 'F' }" ^
  "elseif ($mine | Where-Object { $_.Name -eq 'msedge.exe' }) { $key = 'E' }" ^
  "$n = 0;" ^
  "foreach ($p in $mine) {" ^
  "  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue;" ^
  "  $n++;" ^
  "}" ^
  "if ($n -gt 0) { Start-Sleep -Milliseconds 900 }" ^
  "$n.ToString() + [char]124 + $key" > "%ANSWER%" 2>nul
if exist "%ANSWER%" set /p CLOSED=<"%ANSWER%"
del /q "%ANSWER%" >nul 2>&1
rem How many, and which browser it was, so the same one can be opened
rem again at the end.
set "CLOSEDN=0"
set "CLOSEDB=C"
for /f "tokens=1,2 delims=|" %%A in ("%CLOSED%") do set "CLOSEDN=%%A" & set "CLOSEDB=%%B"
if not "%CLOSEDN%"=="0" (
  set "MSG=Closed the radio, so its files and profile are free"
  call :ok
)
:radioleftalone

rem ---- put it in place --------------------------------------------------
rem Extracted over the top, never wiped first. tar replaces the files it
rem carries and leaves everything else alone, so a settings seed sitting
rem beside index.html survives without being saved and put back, and a
rem failed extraction leaves a folder that re-running repairs.
rem
rem tar also marks nothing. Unzipping in Explorer puts a Mark of the Web
rem on every script it extracts, which is what makes Windows ask before
rem running them; files that arrive this way are clean.
if not exist "%APPROOT%\" mkdir "%APPROOT%" 2>nul
if not exist "%APPROOT%\" goto :nofolder

echo   Unpacking...
"%TAR%" -xf "%ZIP%" -C "%APPROOT%"
if errorlevel 1 goto :locked
del /q "%ZIP%" >nul 2>&1
set "MSG=Unpacked"
call :ok

if not exist "%APPDIR%index.html" goto :corrupt

rem The mark that says this folder was installed into rather than unpacked
rem into. Written on every run, so a folder installed by an older version
rem gains one the first time it is updated. It goes in assets\ because the
rem root is meant to hold only things worth double-clicking, and it is
rem written after the unpack because the unpack is what creates assets\.
rem
rem Plain text and readable on purpose: anybody who opens it should be able
rem to work out what it is for and that deleting it costs them nothing more
rem than one confused install.
> "%APPDIR%%MARKER%" echo This folder is a Deskside Radio installation.
>>"%APPDIR%%MARKER%" echo.
>>"%APPDIR%%MARKER%" echo Win-Install-or-Update-Deskside-Radio.cmd looks for this file to tell an
>>"%APPDIR%%MARKER%" echo installed copy from an archive somebody has just unzipped -- the two
>>"%APPDIR%%MARKER%" echo hold the same files otherwise. With it here, running that script in
>>"%APPDIR%%MARKER%" echo this folder updates this folder. Without it, the script installs to
>>"%APPDIR%%MARKER%" echo %%LOCALAPPDATA%%\DesksideRadio\app instead and leaves this one alone.
>>"%APPDIR%%MARKER%" echo.
>>"%APPDIR%%MARKER%" echo Installed at: %APPROOT%
>>"%APPDIR%%MARKER%" echo Nothing reads it but that script. It is not a setting and holds nothing
>>"%APPDIR%%MARKER%" echo about you; your stations live with the browser profile, not here.
set "MSG=Marked as an installed copy"
call :ok

rem The icons used to sit in the root beside the scripts and now live in
rem assets\. Unpacking over the top writes the new ones and cannot remove
rem the old ones, so a folder installed before this would keep both sets --
rem the stale copies inert, unreferenced, and sitting in the one list this
rem release is trying to shorten. Cleared by name, in the root only, and
rem only once the new set is confirmed to be there.
if exist "%APPDIR%assets\favicon-dial.ico" if exist "%APPDIR%favicon-dial.ico" (
  del /q "%APPDIR%favicon-*.ico" >nul 2>&1
)

rem And the manual's old name. It was README.html until 1.5.2 and is now
rem User Reference Guide.html, which says what it is to somebody reading
rem the folder rather than assuming they know the convention. tar writes
rem the new one beside the old rather than over it, so a folder installed
rem before the rename would keep both -- and the stale one would go on
rem describing a version nobody is running.
rem
rem Only once the new one is confirmed to be there, so an unpack that went
rem wrong leaves the old manual rather than no manual at all. The app reads
rem whichever it finds, new name first, so either way the button works.
if exist "%APPDIR%User Reference Guide.html" if exist "%APPDIR%README.html" (
  del /q "%APPDIR%README.html" >nul 2>&1
)

rem And the start-up script's old name, for the same reason and in the same
rem shape. It was Win - Start With Windows.cmd until 1.5.2. Leaving it behind
rem would leave two scripts in the folder that write the same .lnk, one of
rem which cannot turn it off again because the old one never offered to.
if exist "%APPDIR%Win - Start with Windows (On-Off).cmd" if exist "%APPDIR%Win - Start With Windows.cmd" (
  del /q "%APPDIR%Win - Start With Windows.cmd" >nul 2>&1
)

rem And this file's own older name. It used to have spaces in it, which
rem GitHub turns into dots on the release page -- it was published as
rem Win.-.Install.or.Update.Deskside.Radio.cmd, which is not a name anyone
rem can read or type. An update unpacks the hyphenated one beside the old
rem one rather than over it, so the old one is removed here, once the new
rem one is confirmed to have arrived.
rem
rem Not while it is the file running: a folder updated by double-clicking
rem the old copy still has that copy open, and cmd is reading the next line
rem out of it. It goes on the run after, which is the one that comes from
rem the Start menu shortcut -- rewritten below to point at the new name.
if exist "%APPDIR%Win-Install-or-Update-Deskside-Radio.cmd" (
  if /i not "%~nx0"=="Win - Install or Update Deskside Radio.cmd" (
    del /q "%APPDIR%Win - Install or Update Deskside Radio.cmd" >nul 2>&1
  )
)

rem ---- the browser profile ---------------------------------------------
rem
rem Three things, all of them to the profile rather than to the app.
rem
rem The rename: the Chrome profile was the only one of the three not
rem named after its browser, which made it the one nobody could identify.
rem Moved, never remade, so the stations and schedule inside it come
rem along -- they live in that folder and nowhere else.
rem
rem The trim: a stock profile collects some thirty folders of background
rem downloads -- safe browsing lists, hyphenation dictionaries, captcha
rem providers, on-device suggestion models. A browser showing one local
rem file consults none of them. The launchers now start the browser with
rem the flags that stop them arriving; this removes the ones that already
rem did. Every name in the list is something the browser fetched and can
rem fetch again. Local Storage, where the settings are, is not among them
rem and is never touched.
rem
rem The download folder: export writes deskside-radio-settings.js, and
rem that file beside index.html is the only thing all three profiles can
rem see. Landing in Downloads it seeds nothing, which is why settings
rem exported from Chrome never appeared in Edge. Chrome has no flag for
rem it, so it is written into the profile's Preferences, with the old
rem file kept beside it in case the rewrite is not to the browser's
rem liking.
set "PROFROOT=%LOCALAPPDATA%\DesksideRadio"
if not exist "%PROFROOT%\profile-chrome\" if exist "%PROFROOT%\profile\" (
  move "%PROFROOT%\profile" "%PROFROOT%\profile-chrome" >nul 2>&1
  set "MSG=Profile renamed to profile-chrome"
  call :ok
)

set "FREED="
set "ANSWER=%TEMP%\deskside-radio-answer.txt"
if exist "%APPDIR%assets\trim-profile.ps1" (
  "%PS%" -NoProfile -ExecutionPolicy Bypass -File "%APPDIR%assets\trim-profile.ps1" > "%ANSWER%" 2>nul
  if exist "%ANSWER%" set /p FREED=<"%ANSWER%"
)
del /q "%ANSWER%" >nul 2>&1
if defined FREED (
  set "MSG=Browser profile trimmed  (%FREED%)"
  call :ok
)

rem ---- the shortcut -----------------------------------------------------
rem Made by the script that has always made it, which is now guaranteed to
rem be sitting right there. One copy of the WScript.Shell block, the
rem [char]34 quoting and the browser detection, and it runs on every
rem install and every update -- so the path baked into the shortcut is
rem right again even if the folder moved.
rem DESKSIDE_NOPAUSE is how it is asked to run straight through. The piped
rem echo is there for one release only: the script being called came out of
rem the zip that was just downloaded, so until a release ships that carries
rem the guard, the copy on disk is an older one that pauses regardless. The
rem pipe answers that keypress. Harmless once it is no longer needed.
rem Which browser, and which shortcuts to rewrite.
rem
rem Rewriting matters as much as creating: a .lnk holds the full path to
rem the app folder, so an install that moved leaves every shortcut aimed
rem at where the folder used to be. That is not hypothetical -- a Startup
rem entry made from an unzipped copy in Downloads went on opening
rem file:///C:/Users/.../Downloads/deskside-radio/index.html at every
rem sign-in long after that folder was gone, and what the listener saw at
rem sign-in was Chrome's "Your file couldn't be accessed".
rem
rem So: every shortcut that exists is rewritten, whichever browser it is
rem for. Only when there are none at all is there a question to ask, and
rem then it is asked rather than answered on the listener's behalf.
rem Asked for rather than guessed at: the Desktop is not always under
rem %USERPROFILE%. OneDrive moves it, and so does any machine with folder
rem redirection, which is most managed ones.
set "DESK="
set "ANSWER=%TEMP%\deskside-radio-answer.txt"
"%PS%" -NoProfile -ExecutionPolicy Bypass -Command "[Environment]::GetFolderPath('Desktop')" > "%ANSWER%" 2>nul
if exist "%ANSWER%" set /p DESK=<"%ANSWER%"
del /q "%ANSWER%" >nul 2>&1

rem One flag each rather than letters in a string. The string version
rem tested for a letter with %%WANT:C=%%, which cmd leaves untouched when
rem the variable is not set -- so the comparison became two pieces of
rem literal text and the line after it was read as a command.
set "WANT="
set "DOC="
set "DOE="
set "DOF="
if defined DESK if exist "%DESK%\Deskside Radio.lnk" set "DOC=1"
if defined DESK if exist "%DESK%\Deskside Radio (Edge).lnk" set "DOE=1"
if defined DESK if exist "%DESK%\Deskside Radio (Firefox).lnk" set "DOF=1"
if defined DOC set "WANT=1"
if defined DOE set "WANT=1"
if defined DOF set "WANT=1"
if defined WANT goto :haveshortcut
rem Nobody is there to answer. A launcher-driven update is by definition
rem running for somebody who already has a shortcut, so there is nothing
rem to work out and nothing to ask.
if defined DESKSIDE_QUIET goto :haveshortcut

echo.
echo   There is no Deskside Radio shortcut on your Desktop yet.
echo   Which browser should it open in?
echo.
echo      C   Chrome, or Edge if Chrome is not installed
echo      E   Edge
echo      F   Firefox   ^(no app window: a tab strip and an address bar^)
echo.
set "PICK="
set /p "PICK=  Type C, E or F and press Enter, or just Enter for C: "
if /i "%PICK%"=="E" set "DOE=1"
if /i "%PICK%"=="F" set "DOF=1"
if not defined DOE if not defined DOF set "DOC=1"
echo.

:haveshortcut
set "DESKSIDE_NOPAUSE=1"
if defined DOC call :shortcut "Win - Create Desktop Shortcut (Chrome).cmd" "Chrome or Edge"
if defined DOE call :shortcut "Win - Create Desktop Shortcut (Edge).cmd" "Edge"
if defined DOF call :shortcut "Win - Create Desktop Shortcut (Firefox).cmd" "Firefox"

rem The Startup entry, if there is one, for the same reason: it holds the
rem same stale path and nothing else ever rewrites it.
set "STARTLNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Deskside Radio.lnk"
if exist "%STARTLNK%" (
  call "%APPDIR%Win - Start with Windows (On-Off).cmd" >nul 2>&1
  set "MSG=Start-up entry repointed at this folder"
  call :ok
)
set "DESKSIDE_NOPAUSE="

rem ---- stale registry keys ----------------------------------------------
rem This block only takes things out. One key does go in, further down --
rem the desksideradio: handler, which is what lets the switch in Settings
rem act at all -- and the readmes now say so. Nothing else here writes: every
rem reg.exe in this repository is a query against HKLM App Paths, asking
rem where a browser was installed.
rem
rem Narrower than the uninstaller's sweep on purpose. That one runs when
rem the app is going away and can take everything of ours; this one runs
rem while it is being installed, so it removes only what is provably dead:
rem
rem   two old handler names  HKCU\Software\Classes\deskside and
rem                          ...\deskside-radio. Neither was ever shipped.
rem                          The one this app does register, from 1.5.2, is
rem                          desksideradio -- the full name, because a key
rem                          called deskside alone cannot be proved to be
rem                          ours and so could never be swept up again.
rem                          Anything at the two short names was put there
rem                          by hand, and nothing here will use it.
rem   a dead Run value       one naming a Deskside Radio folder that is not
rem                          there any more. Starting with Windows is a
rem                          .lnk in the Startup folder and always has
rem                          been, so a Run value is either from an
rem                          experiment or from somebody's own hand -- and
rem                          when the folder it points at is gone, it is a
rem                          sign-in that fails with a file-not-found and
rem                          no explanation. That is the same fault the
rem                          stale Startup .lnk caused, in the place nobody
rem                          thought to look.
rem
rem A Run value pointing at a folder that IS there is left alone, whoever
rem made it: it works, and an installer is not the place to overrule
rem somebody's own arrangement.
"%PS%" -NoProfile -ExecutionPolicy Bypass -Command ^
  "$name = 'Deskside Radio'; $hit = 0;" ^
  "foreach ($p in @('HKCU:\Software\Classes\deskside', 'HKCU:\Software\Classes\deskside-radio')) {" ^
  "  if (-not (Test-Path -LiteralPath $p)) { continue };" ^
  "  $cmdKey = ($p + '\shell\open\command'); $says = '';" ^
  "  if (Test-Path -LiteralPath $cmdKey) { $says = [string](Get-Item -LiteralPath $cmdKey).GetValue('') };" ^
  "  if (-not ($says -and $says.Contains($name))) { continue };" ^
  "  Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue; $hit++ };" ^
  "foreach ($r in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'," ^
  "                 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce')) {" ^
  "  if (Test-Path -LiteralPath $r) { $k = Get-Item -LiteralPath $r;" ^
  "    foreach ($v in $k.GetValueNames()) {" ^
  "      $d = [string]$k.GetValue($v);" ^
  "      if ($d -and $d.Contains($name)) {" ^
  "        $path = $d.Trim();" ^
  "        if ($path.StartsWith([string][char]34)) { $path = $path.Substring(1).Split([char]34)[0] };" ^
  "        if (-not (Test-Path -LiteralPath $path)) {" ^
  "          Remove-ItemProperty -LiteralPath $r -Name $v -Force -ErrorAction SilentlyContinue;" ^
  "          $hit++ } } } } };" ^
  "if ($hit -gt 0 -and -not $env:DESKSIDE_QUIET) {" ^
  "  Write-Host ('     cleared ' + $hit + ' stale registry entr' + $(if ($hit -eq 1) { 'y' } else { 'ies' })) }"

rem ---- the door the Settings switch knocks on ----------------------------
rem
rem The radio is a page opened off a disk. It can be told things -- the
rem launcher writes down whether there is a Desktop shortcut and whether the
rem Startup entry exists, and the page reads that -- but it cannot DO
rem anything outside itself. No browser will ever let a file:// page write a
rem shortcut into the Startup folder, and it should not.
rem
rem So one door, and a narrow one. desksideradio: is registered here, and
rem Windows hands whatever follows the colon to a four-line script of ours,
rem which accepts exactly two words and ignores everything else. The switch
rem in Settings navigates to desksideradio:startup-on or ...-off and the
rem shortcut appears or goes.
rem
rem This is the one thing this app puts in the registry, and both readmes
rem and the Settings pane now say so in those words. It is a file
rem association, not a start-up entry: nothing runs because it is there.
rem The thing that actually starts the radio at sign-in is still one .lnk in
rem the Startup folder, which you can see and delete yourself.
rem
rem Rewritten on every run rather than only when missing, because the path
rem inside it is this folder's -- and the whole reason the Startup entry gets
rem repointed a few lines above is that a moved app folder leaves paths
rem behind that nothing else ever corrects.
rem
rem The %1 that Windows replaces with the URL is built as a character code.
rem Written literally it would be eaten twice over: once by cmd reading this
rem file, and once more by the for-loop parsing that is not even here. A
rem [char]37 cannot be misread by either.
set "WSX=%SystemRoot%\System32\wscript.exe"
set "PROTOVBS=%APPDIR%Win - Deskside Radio Protocol.vbs"
if exist "%PROTOVBS%" if exist "%WSX%" (
  "%PS%" -NoProfile -ExecutionPolicy Bypass -Command ^
    "try {" ^
    "  $k = 'HKCU:\Software\Classes\desksideradio';" ^
    "  $q = [char]34; $pct = [char]37;" ^
    "  New-Item -Path ($k + '\shell\open\command') -Force | Out-Null;" ^
    "  Set-ItemProperty -LiteralPath $k -Name '(Default)' -Value 'URL:Deskside Radio';" ^
    "  Set-ItemProperty -LiteralPath $k -Name 'URL Protocol' -Value '';" ^
    "  Set-ItemProperty -LiteralPath ($k + '\shell\open\command') -Name '(Default)'" ^
    "    -Value ($q + $env:WSX + $q + ' ' + $q + $env:PROTOVBS + $q + ' ' + $q + $pct + '1' + $q);" ^
    "} catch { }"
  set "MSG=Settings switch for starting with Windows is wired up"
  call :ok
)

rem And one in the Start menu for the updater itself, because
rem %LOCALAPPDATA% is not a folder anyone goes looking in.
rem
rem It is called "Deskside Radio - Update" and not "Update Deskside Radio"
rem for one reason: the All apps list is alphabetical, and the second name
rem files it under U. Somebody looking for their radio's updater looks
rem under D, finds nothing there, and concludes there is nothing to find --
rem which is exactly what happened. Named this way it sits next to the
rem radio itself. Searching "deskside" or "update" still reaches it.
rem
rem The old name is removed after the new one is written, and only then, so
rem a failure leaves the working shortcut rather than none. Deleting it is
rem safe on the very run it launched: a .lnk is read once, at launch, and
rem nothing holds it open afterwards.
set "SELF=%APPDIR%Win-Install-or-Update-Deskside-Radio.cmd"
set "UPDATER="
if exist "%SELF%" (
  set "UPDATER=1"
  "%PS%" -NoProfile -ExecutionPolicy Bypass -Command ^
    "$dir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs';" ^
    "if (Test-Path -LiteralPath $dir) {" ^
    "  $link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $dir 'Deskside Radio - Update.lnk'));" ^
    "  $link.TargetPath = $env:SELF;" ^
    "  $link.IconLocation = $env:APPDIR + 'assets\favicon-dial.ico,0';" ^
    "  $link.WorkingDirectory = $env:APPROOT;" ^
    "  $link.Description = 'Check for and install a newer Deskside Radio';" ^
    "  $link.Save();" ^
    "  $old = Join-Path $dir 'Update Deskside Radio.lnk';" ^
    "  if ((Test-Path -LiteralPath (Join-Path $dir 'Deskside Radio - Update.lnk')) -and (Test-Path -LiteralPath $old)) {" ^
    "    Remove-Item -LiteralPath $old -Force -ErrorAction SilentlyContinue;" ^
    "  }" ^
    "}"
  set "MSG=Start menu entry added"
  call :ok
)

rem ---- done -------------------------------------------------------------
if defined DESKSIDE_QUIET exit /b 0
echo.
if defined UPDATING (
  set "MSG=Updated"
  call :ok
  echo.
  rem Closed by this script a moment ago, so this script puts it back.
  rem Shutting somebody's radio to update it and leaving it shut is
  rem worse than not having closed it at all.
  if not "%CLOSEDN%"=="0" (
    call :reopen
  ) else (
    echo   Close the radio and open it again to see the new version.
  )
  echo.
  echo   Your stations and settings were not touched. They live with the
  echo   browser profile rather than in the app folder, which is why an
  echo   update can replace every file here and lose nothing.
) else (
  set "MSG=All done"
  call :ok
  echo.
  echo   There is now a Deskside Radio shortcut on your Desktop, and the
  echo   radio is opening.
  echo.
  echo   Anything you set up - stations, the schedule, the theme - is kept
  echo   with the browser profile rather than in the app folder, so
  echo   updating later never touches it.
  if defined UPDATER echo   To update later, type "update desk" at the Start button.
  "%PS%" -NoProfile -ExecutionPolicy Bypass -Command ^
    "$p = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Deskside Radio.lnk';" ^
    "if (Test-Path -LiteralPath $p) { Invoke-Item -LiteralPath $p }"
)
echo.
if not defined DESKSIDE_QUIET pause
exit /b 0

rem ---- open it again ----------------------------------------------------
rem Through the Desktop shortcut rather than by starting a browser, so it
rem comes back the way it always opens: its own window, its own profile,
rem autoplay lifted, and the window lock applied by the opener.
rem
rem The one that was closed, where that can be told: a Firefox radio
rem should not come back in Chrome. Falling back to the plain shortcut,
rem which is the one nearly everybody has.
:reopen
set "RELNK=Deskside Radio.lnk"
if /i "%CLOSEDB%"=="E" set "RELNK=Deskside Radio (Edge).lnk"
if /i "%CLOSEDB%"=="F" set "RELNK=Deskside Radio (Firefox).lnk"
"%PS%" -NoProfile -ExecutionPolicy Bypass -Command ^
  "$d = [Environment]::GetFolderPath('Desktop');" ^
  "$p = Join-Path $d $env:RELNK;" ^
  "if (-not (Test-Path -LiteralPath $p)) { $p = Join-Path $d 'Deskside Radio.lnk' }" ^
  "if (Test-Path -LiteralPath $p) { Invoke-Item -LiteralPath $p }"
echo   The radio was closed for the update, and is opening again.
exit /b 0

rem ---- one desktop shortcut ---------------------------------------------
rem The piped echo answers the pause in a copy of the called script old
rem enough not to know about DESKSIDE_NOPAUSE. Harmless once every copy
rem in the field is newer than that.
:shortcut
if not exist "%APPDIR%%~1" exit /b 0
echo.| call "%APPDIR%%~1"
set "MSG=Desktop shortcut: %~2"
call :ok
exit /b 0

rem ---- saying a thing went right ----------------------------------------
rem Colour through PowerShell's Write-Host rather than ANSI escapes. The
rem escapes are shorter and need no second process, but a console without
rem virtual-terminal processing prints them as visible gibberish -- which
rem is precisely the "what is this thing doing to my computer" reaction
rem this whole section exists to avoid. Write-Host goes through the console
rem API and is the same on every Windows that can run this file.
rem
rem The message travels in an environment variable so it can be read with
rem $env:MSG, which needs no quoting of its own. One process per tick, and
rem there are five of them.
:ok
"%PS%" -NoProfile -ExecutionPolicy Bypass -Command ^
  "Write-Host '  ' -NoNewline;" ^
  "Write-Host '[OK]' -ForegroundColor Green -NoNewline;" ^
  "Write-Host ('  ' + $env:MSG)"
exit /b 0

rem ---- the ways it can go wrong -----------------------------------------

:tooold
echo.
echo   This needs curl and tar, which Windows has included since Windows 10
echo   version 1803. This machine does not have them.
echo.
echo   Download deskside-radio.zip from the releases page instead, unzip it
echo   wherever you want it, and double-click
echo   "Win - Create Desktop Shortcut (Chrome).cmd" inside it.
echo.
pause
exit /b 1

:repo
echo.
echo   This is the Deskside Radio source folder, not an install.
echo.
echo   Running here would write the built single-file index.html over the
echo   source one. Run "node tools\build-dist.js" to build instead, or run
echo   this script from your Downloads folder to install.
echo.
pause
exit /b 1

:occupied
echo.
echo   "%APPROOT%" already has files in it and no index.html among them,
echo   so it is not a Deskside Radio folder and not an empty one either.
echo.
echo   Check the path and try again. Nothing has been changed.
echo.
pause
exit /b 1

:nofetch
echo.
echo   Could not reach GitHub just now, so nothing has been changed.
echo.
echo   Check the connection and run this again.
echo.
pause
exit /b 1

:corrupt
echo.
echo   That download did not arrive intact, so nothing has been changed.
echo.
echo   Run this again.
echo.
del /q "%ZIP%" >nul 2>&1
pause
exit /b 1

:nofolder
echo.
echo   Could not create "%APPROOT%".
echo.
echo   Check the path and try again. Nothing has been changed.
echo.
pause
exit /b 1

:locked
echo.
echo   Unpacking stopped part way into "%APPROOT%".
echo.
echo   Usually this means the radio is open and one of its files is in use.
echo   Close the radio window and run this again - it will finish the job,
echo   because unpacking over the top can be repeated safely.
echo.
pause
exit /b 1
