@echo off
setlocal
rem Deskside Radio - start it automatically when you sign in.
rem
rem This puts the same shortcut "Win - Create Desktop Shortcut (Chrome).cmd" makes into the
rem Startup folder, which Windows opens on sign-in. Nothing is written to the
rem registry and nothing runs as a service: it is one .lnk file in a folder
rem you can open yourself with Win+R, shell:startup.
rem
rem Double-click it and it looks first: if the entry is already there it says
rem where it points and offers to remove it or aim it at this folder, and if it
rem is not there it offers to put it in. Nothing happens without an answer.
rem
rem A word on the command line skips the question, which is how the installer
rem calls it and how a script of your own can:
rem
rem   "Win - Start with Windows (On-Off).cmd" on        turn it on, with the dial icon
rem   "Win - Start with Windows (On-Off).cmd" console   turn it on, with the console icon
rem   "Win - Start with Windows (On-Off).cmd" off       turn it off
rem
rem The browser detection below is deliberately a copy of the one in
rem "Win - Create Desktop Shortcut (Chrome).cmd" rather than shared with it. These are files
rem people double-click, sometimes one without ever running the other, so
rem each one has to work on its own.
rem
rem For the radio to be playing when you arrive, turn on "Play on launch" in
rem Settings and pick a station, or set up a schedule.

title Deskside Radio - start with Windows

rem The installer calls this one and prints its own account around it,
rem and a banner in the middle of somebody else's output is not a
rem banner. DESKSIDE_NOPAUSE already means "you are being called".
if not defined DESKSIDE_NOPAUSE (
  echo.
  echo   DESKSIDE RADIO - START WITH WINDOWS
  echo.
)

set "APPDIR=%~dp0"
set "TARGET=%APPDIR%index.html"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LINK=%STARTUP%\Deskside Radio.lnk"

if not exist "%TARGET%" (
  echo.
  echo   Could not find index.html next to this script.
  echo   Keep this file in the Deskside Radio folder and run it again.
  echo.
  pause
  exit /b 1
)

if not exist "%STARTUP%" (
  echo.
  echo   Could not find your Startup folder:
  echo   "%STARTUP%"
  echo.
  pause
  exit /b 1
)

rem ---- which way, and who is asking ---------------------------------------
set "MODE=%~1"
if /i "%MODE%"=="off" goto :remove
if /i "%MODE%"=="remove" goto :remove
if /i "%MODE%"=="/off" goto :remove

rem "on" is a word, not a theme. Cleared so it does not go looking for
rem assets\favicon-on.ico and then report the fallback as though it were
rem a choice somebody made.
if /i "%MODE%"=="on" set "MODE="

rem Any other word is a theme name, and means business. So does being called:
rem DESKSIDE_NOPAUSE is the installer, which runs this only to repoint an entry
rem that is already there. A question at that point would stop an install dead,
rem behind a window that says nothing about why it is waiting.
if defined MODE goto :install
if defined DESKSIDE_NOPAUSE goto :install

rem ---- nobody said which, and somebody is watching ------------------------
rem
rem The shortcut's working directory is read rather than its target. The target
rem is wscript.exe or a browser -- the same on every machine and worth nothing
rem here -- while the working directory is the folder that will be opened, and
rem that is the thing worth checking. If PowerShell cannot be reached the two
rem folder lines are skipped and the rest of the question still works.
:ask
if not exist "%LINK%" goto :askoff

set "HERE=%APPDIR%"
if "%HERE:~-1%"=="\" set "HERE=%HERE:~0,-1%"
set "LNKDIR="
for /f "usebackq delims=" %%A in (`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "(New-Object -ComObject WScript.Shell).CreateShortcut($env:LINK).WorkingDirectory"`) do set "LNKDIR=%%A"
if defined LNKDIR if "%LNKDIR:~-1%"=="\" set "LNKDIR=%LNKDIR:~0,-1%"

echo   It is ON. Deskside Radio opens when you sign in.
echo.
echo     Entry:  "%LINK%"
if defined LNKDIR echo     Opens:  "%LNKDIR%"
if defined LNKDIR if /i not "%LNKDIR%"=="%HERE%" (
  echo.
  echo   That is not this folder. At sign-in it opens the copy named above,
  echo   and if that copy has been moved or deleted you get an error page
  echo   instead of a radio. Press P to aim it here.
)
echo.
echo     R  remove it
echo     P  point it at this folder
echo.
set "ANS="
set /p "ANS=  Type R or P and press Enter, or just Enter to leave it alone: "
if /i "%ANS%"=="R" goto :remove
if /i "%ANS%"=="P" goto :install
echo.
echo   Left as it was.
echo.
pause
exit /b 0

:askoff
echo   It is OFF. Deskside Radio does not open when you sign in.
echo.
set "ANS="
set /p "ANS=  Turn it on? Press Enter for yes, or N and Enter for no: "
if /i "%ANS%"=="N" goto :leaveoff
if /i "%ANS%"=="no" goto :leaveoff
goto :install

:leaveoff
echo.
echo   Left off.
echo.
pause
exit /b 0

:remove
if exist "%LINK%" (
  del "%LINK%"
  echo.
  echo   Deskside Radio will no longer start when you sign in.
  echo   Removed: "%LINK%"
) else (
  echo.
  echo   It was not set to start with Windows, so there was nothing to remove.
)
echo.
call :writestate
rem The same guard the install path carries at the foot of the file. Without
rem it, anything calling this with "off" gets a window waiting on a keypress
rem that is never coming.
if not defined DESKSIDE_NOPAUSE pause
exit /b 0

rem ---- on -----------------------------------------------------------------
:install
set "THEME=%MODE%"
if not defined THEME set "THEME=dial"
set "ICON=%APPDIR%assets\favicon-%THEME%.ico"
if not exist "%ICON%" (
  set "THEME=dial"
  set "ICON=%APPDIR%assets\favicon-dial.ico"
)
if not exist "%ICON%" (
  set "THEME=default"
  set "ICON=%APPDIR%assets\favicon-dial.ico"
)

set "BROWSER="
set "BROWSERNAME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER for /f "skip=2 tokens=2,*" %%A in ('%SystemRoot%\System32\reg.exe query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" /ve 2^>nul') do if exist "%%B" set "BROWSER=%%B"
if defined BROWSER set "BROWSERNAME=Google Chrome"

if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER for /f "skip=2 tokens=2,*" %%A in ('%SystemRoot%\System32\reg.exe query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" /ve 2^>nul') do if exist "%%B" set "BROWSER=%%B"
if not defined BROWSERNAME if defined BROWSER set "BROWSERNAME=Microsoft Edge"

set "PROFILE=%LOCALAPPDATA%\DesksideRadio\profile-chrome"

rem The one profile of the three that was not named after its browser.
rem Moved rather than remade, so what is in it comes along.
if not exist "%PROFILE%\" if exist "%LOCALAPPDATA%\DesksideRadio\profile\" (
  move "%LOCALAPPDATA%\DesksideRadio\profile" "%PROFILE%" >nul 2>&1
)
rem If the move could not happen -- something is still sitting in the old
rem folder -- go on using the old one rather than starting an empty new
rem one. An empty profile is the alarming outcome here: the radio comes up
rem with none of your stations, and nothing on screen says why.
if not exist "%PROFILE%\" if exist "%LOCALAPPDATA%\DesksideRadio\profile\" set "PROFILE=%LOCALAPPDATA%\DesksideRadio\profile"

rem ---- the radio this person actually opens ---------------------------------
rem
rem Chosen from the Desktop, not from what is installed. Somebody who uses the
rem Edge shortcut keeps their stations in profile-edge, and an entry built for
rem Chrome's profile opened either a different set of stations or, on a
rem machine without Chrome, Edge with none at all. The updater repoints this
rem entry through this script, so every update used to make it again.
rem
rem The Edge shortcut alone means Edge and its profile. The Chrome one, both,
rem only Firefox or none is the old behaviour, unchanged. The Desktop is asked
rem for rather than assumed, because OneDrive and folder redirection move it.
rem
rem After the migration above, which moves an old unnamed profile into PROFILE
rem when PROFILE is missing: pointed at profile-edge first, it would carry a
rem Chrome user's stations into Edge's folder.
set "DESK="
set "EDGEONLY="
set "PROFARG="
for /f "usebackq delims=" %%D in (`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESK=%%D"
if defined DESK if not exist "%DESK%\Deskside Radio.lnk" if exist "%DESK%\Deskside Radio (Edge).lnk" set "EDGEONLY=1"
set "EB="
if defined EDGEONLY if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EB=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if defined EDGEONLY if not defined EB if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EB=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if defined EB set "BROWSER=%EB%"
if defined EB set "BROWSERNAME=Microsoft Edge"
if defined EB set "PROFILE=%LOCALAPPDATA%\DesksideRadio\profile-edge"
rem With a leading space, so it can be added to the opener's arguments as is.
if defined EB set "PROFARG= profile-edge"

rem The flags that keep the profile from filling with things a browser
rem showing one local file will never consult. Word for word the line in
rem "Win - Open Deskside Radio.cmd"; a test holds the copies together.
set "LEAN= --disable-background-networking --disable-component-update --disable-breakpad --disable-domain-reliability --disable-sync --no-pings --disable-features=OptimizationHints,OptimizationGuideModelDownloading,SegmentationPlatform,MediaRouter --disk-cache-size=16777216 --media-cache-size=16777216 --disable-extensions --force-dark-mode"

rem The shortcut aims at the opener rather than at the browser. The
rem opener starts the browser with the same flags and then takes the
rem resize grip off the window, which cannot be done from inside the
rem page -- there is no web API for it and no browser switch for it, so
rem something of ours has to be running when the window appears. It
rem exits as soon as that is done.
rem
rem Started through wscript.exe and a four-line .vbs rather than aimed at
rem the .cmd. A .cmd is run by cmd.exe, cmd.exe gets a console, and
rem WindowStyle 7 only minimises that console after Windows has drawn it
rem -- the black rectangle and the taskbar button that flash at sign-in.
rem Run with a window style of 0 from the .vbs, no console is created.
set "WSCRIPT=%SystemRoot%\System32\wscript.exe"
set "OPENER=%APPDIR%Win - Open Deskside Radio.vbs"
set "OPENERCMD=%APPDIR%Win - Open Deskside Radio.cmd"
rem Without either of them -- an older folder, or a copy taken apart by
rem hand -- the shortcut goes straight at the browser as it always did,
rem and the window is left resizable.
if not exist "%OPENER%" set "OPENER="
if not exist "%OPENERCMD%" set "OPENERCMD="
if not exist "%WSCRIPT%" set "OPENER="

rem Every value reaches PowerShell as an environment variable, and every
rem quote inside the argument string is built with [char]34. A literal " in
rem here would end the -Command line cmd is holding open.
rem
rem PowerShell and reg are named by their full paths. A double-clicked .cmd
rem runs with the app folder as the current directory, and on a default
rem Windows cmd looks there before it looks along PATH -- so a powershell.bat
rem dropped in beside this script would be what ran. %SystemRoot% cannot
rem contain a space, so it needs no quoting of its own.
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$path = Join-Path $env:STARTUP 'Deskside Radio.lnk';" ^
  "$link = (New-Object -ComObject WScript.Shell).CreateShortcut($path);" ^
  "$q = [char]34;" ^
  "if ($env:BROWSER -and $env:OPENER) {" ^
  "  $link.TargetPath = $env:WSCRIPT;" ^
  "  $link.Arguments = $q + $env:OPENER + $q + ' ' + $q + $env:BROWSER + $q + $env:PROFARG;" ^
  "} elseif ($env:BROWSER -and $env:OPENERCMD) {" ^
  "  $link.TargetPath = $env:OPENERCMD;" ^
  "  $link.Arguments = $q + $env:BROWSER + $q + $env:PROFARG;" ^
  "  $link.WindowStyle = 7;" ^
  "} elseif ($env:BROWSER) {" ^
  "  $url = ([Uri]$env:TARGET).AbsoluteUri;" ^
  "  $link.TargetPath = $env:BROWSER;" ^
  "  $link.Arguments = '--app=' + $q + $url + $q +" ^
  "    ' --autoplay-policy=no-user-gesture-required' +" ^
  "    ' --window-size=1133,741' +" ^
  "    ' --user-data-dir=' + $q + $env:PROFILE + $q +" ^
  "    ' --no-first-run --no-default-browser-check' + $env:LEAN;" ^
  "} else {" ^
  "  $link.TargetPath = $env:TARGET;" ^
  "}" ^
  "$link.IconLocation = $env:ICON + ',0';" ^
  "$link.WorkingDirectory = $env:APPDIR;" ^
  "$link.Description = 'Deskside Radio';" ^
  "$link.Save();" ^
  "if (-not $env:DESKSIDE_NOPAUSE) { Write-Host ''; Write-Host ('  Set to start with Windows: ' + $path) }"

if errorlevel 1 (
  echo.
  echo   Something went wrong writing to the Startup folder.
  echo.
  pause
  exit /b 1
)

echo   Icon: %THEME%
if defined BROWSER (
  echo   Opens with: %BROWSERNAME%
) else (
  echo   No Chrome or Edge found, so it will open in your default browser.
)
echo.
echo   It will open the next time you sign in. To have it playing by then,
echo   turn on "Play on launch" in Settings and choose a station.
echo.
echo   To stop it starting, run this script again and press R.
echo.
call :writestate

rem Only the success path. The pauses above sit on error paths and
rem stop whoever is calling, which is what an error is for.
if not defined DESKSIDE_NOPAUSE pause

rem ---- tell the page ------------------------------------------------------
rem
rem The switch in Settings shows this, and a page opened off a disk cannot
rem look in the Startup folder to find out. So whatever changes the entry
rem writes down what it changed it to, and the page reads that.
rem
rem Called from both paths, and from the handler as well as from a
rem double-click: run this by hand with the radio open and the switch catches
rem up the next time the window is focused.
rem
rem Its own file rather than a line added to shortcut.js. That one is written
rem by the launcher at start and describes the Desktop, which does not change
rem while the radio runs; this changes precisely because somebody asked it to.
:writestate
if not exist "%APPDIR%assets\" goto :eof
set "BOOT=false"
if exist "%LINK%" set "BOOT=true"
>"%APPDIR%assets\startup.js" echo /* Written whenever the start-up entry is changed,
>>"%APPDIR%assets\startup.js" echo    and at every launch. Whether this radio is set to
>>"%APPDIR%assets\startup.js" echo    open when you sign in. */
>>"%APPDIR%assets\startup.js" echo window.DESKSIDE_STARTS_WITH_WINDOWS = %BOOT%;
goto :eof

