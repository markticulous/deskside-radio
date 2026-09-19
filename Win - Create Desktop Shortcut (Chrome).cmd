@echo off
setlocal
rem Deskside Radio - put a shortcut on the Desktop.
rem
rem This is the one to use unless you have a reason not to. "(Chrome)" is
rem what it prefers, not all it will take: it uses Chrome if Chrome is
rem installed and Edge if it is not, because both accept the same flags.
rem The Edge and Firefox scripts beside it are for pinning to one browser
rem on purpose. The shortcut this makes is called plainly "Deskside Radio";
rem the others add their browser's name so they can sit beside it.
rem
rem A web page cannot do this itself: Chrome will not save a .url file under
rem its own name and renames it to .download, because such a file can point
rem anywhere. So the shortcut is made here instead, as a real .lnk.
rem
rem The shortcut does more than open the page. It starts Chrome, or Edge if
rem Chrome is not installed, as a window of its own with the autoplay policy
rem lifted, so "Play on launch" actually plays on launch instead of asking
rem for a click. That needs a browser profile of its own: command-line flags
rem are read once at startup, so a browser that is already running would
rem otherwise hand over the page and drop the flags.
rem
rem Because the profile is its own, it starts with no settings. Export yours
rem from Settings - Service, leave deskside-radio-settings.js beside
rem index.html, and the first launch reads it.
rem
rem Run it with a theme name to get that theme's icon:
rem
rem   "Win - Create Desktop Shortcut (Chrome).cmd" console
rem
rem The app's shortcut panel shows the line to use. With no argument, or one
rem whose icon is missing, it falls back to the analogue dial icon.

title Deskside Radio - Desktop shortcut

rem The installer calls this one and prints its own commentary around
rem it, and a banner in the middle of somebody else's output is not a
rem banner. DESKSIDE_NOPAUSE already means "you are being called".
if not defined DESKSIDE_NOPAUSE (
  echo.
  echo   DESKSIDE RADIO - DESKTOP SHORTCUT
  echo.
)

set "APPDIR=%~dp0"
set "TARGET=%APPDIR%index.html"

if not exist "%TARGET%" (
  echo.
  echo   Could not find index.html next to this script.
  echo   Keep this file in the Deskside Radio folder and run it again.
  echo.
  pause
  exit /b 1
)

set "THEME=%~1"
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

rem Chrome first, then Edge, which every Windows 11 machine has. App Paths is
rem the registry's own answer to "where is this browser", so it catches the
rem installs that are not in either Program Files.
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
set "APPROOT=%APPDIR:~0,-1%"

rem The Chrome profile used to be the only one of the three not named
rem after its browser. Moved rather than remade, so what is in it -- the
rem stations, the schedule, the theme -- comes along.
if not exist "%PROFILE%\" if exist "%LOCALAPPDATA%\DesksideRadio\profile\" (
  move "%LOCALAPPDATA%\DesksideRadio\profile" "%PROFILE%" >nul 2>&1
)

rem The flags that keep the profile from filling with things a browser
rem showing one local file will never consult. Word for word the line in
rem "Win - Open Deskside Radio.cmd"; a test holds the copies together.
set "LEAN= --disable-background-networking --disable-component-update --disable-breakpad --disable-domain-reliability --disable-sync --no-pings --disable-features=OptimizationHints,OptimizationGuideModelDownloading,SegmentationPlatform,MediaRouter --disk-cache-size=16777216 --media-cache-size=16777216"

rem Where this profile saves a download: the app folder, not Downloads.
rem
rem Export settings writes deskside-radio-settings.js, and that file is
rem the only thing the three browser profiles can all see -- each keeps
rem its own storage, and none of them can read another's. Left in the
rem Downloads folder it seeds nothing; sitting beside index.html it is
rem picked up by every shortcut at its next launch. Chrome has no flag
rem for the download folder, so it is written into the profile before
rem Chrome has one of its own. Only when absent: a profile already in
rem use has a Preferences file full of its own state, and the installer
rem is the thing that edits one of those.
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$d = Join-Path $env:PROFILE 'Default';" ^
  "$f = Join-Path $d 'Preferences';" ^
  "if (-not (Test-Path -LiteralPath $f)) {" ^
  "  New-Item -ItemType Directory -Path $d -Force | Out-Null;" ^
  "  $j = @{ download = @{ default_directory = $env:APPROOT; prompt_for_download = $false };" ^
  "         savefile = @{ default_directory = $env:APPROOT } } | ConvertTo-Json -Depth 4;" ^
  "  Set-Content -LiteralPath $f -Value $j -Encoding ASCII;" ^
  "}"
rem The shortcut aims at the opener rather than at the browser. The
rem opener starts the browser with the same flags and then takes the
rem resize grip off the window, which cannot be done from inside the
rem page -- there is no web API for it and no browser switch for it, so
rem something of ours has to be running when the window appears. It
rem exits as soon as that is done.
rem Started through wscript.exe and a four-line .vbs rather than by
rem aiming the shortcut at the .cmd. A .cmd is run by cmd.exe, cmd.exe
rem gets a console, and WindowStyle 7 only minimises that console after
rem Windows has already drawn it -- which is the black rectangle and the
rem taskbar button that flash at launch. Run with a window style of 0
rem from the .vbs, the console is never created.
set "WSCRIPT=%SystemRoot%\System32\wscript.exe"
set "OPENER=%APPDIR%Win - Open Deskside Radio.vbs"
set "OPENERCMD=%APPDIR%Win - Open Deskside Radio.cmd"
rem An app folder from before the .vbs still has the .cmd, and that is
rem better than nothing: the flash comes back, the locked window does
rem not go away. With neither of them -- an older folder still, or a
rem copy taken apart by hand -- the shortcut goes straight at the
rem browser as it always did, and the window is left resizable.
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
  "$desktop = [Environment]::GetFolderPath('Desktop');" ^
  "$path = Join-Path $desktop 'Deskside Radio.lnk';" ^
  "$link = (New-Object -ComObject WScript.Shell).CreateShortcut($path);" ^
  "$q = [char]34;" ^
  "if ($env:BROWSER -and $env:OPENER) {" ^
  "  $link.TargetPath = $env:WSCRIPT;" ^
  "  $link.Arguments = $q + $env:OPENER + $q + ' ' + $q + $env:BROWSER + $q;" ^
  "} elseif ($env:BROWSER -and $env:OPENERCMD) {" ^
  "  $link.TargetPath = $env:OPENERCMD;" ^
  "  $link.Arguments = $q + $env:BROWSER + $q;" ^
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
  "if (-not $env:DESKSIDE_NOPAUSE) { Write-Host ''; Write-Host ('  Shortcut created: ' + $path) }"

if errorlevel 1 (
  echo.
  echo   Something went wrong creating the shortcut.
  echo.
  pause
  exit /b 1
)

rem Everything below is this script introducing itself, which is right when
rem it has been double-clicked and wrong when the installer called it: there
rem it lands in the middle of the installer's own account of what it is
rem doing, and says a good deal of it twice. The installer prints one line
rem for this step instead. Errors are never suppressed -- those are above,
rem and they stop either way.
if defined DESKSIDE_NOPAUSE goto :quietend

echo   Icon: %THEME%
if defined BROWSER (
  echo   Opens with: %BROWSERNAME%
  echo   Its own profile: "%PROFILE%"
  echo.
  echo   Turn on "Play on launch" in Settings and the radio starts by itself.
  echo   That profile starts empty: to bring your stations across, export them
  echo   from Settings - Service and leave deskside-radio-settings.js beside
  echo   index.html. It is read once, the first time that profile opens.
) else (
  echo   No Chrome or Edge found, so the shortcut opens index.html in your
  echo   default browser. It will still ask for one click before playing.
)

echo.
pause

rem Where the installer's call rejoins. The two pauses on the error paths
rem above are left alone: those should always stop, whoever is calling.
:quietend
