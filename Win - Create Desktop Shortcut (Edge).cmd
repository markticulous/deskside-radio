@echo off
setlocal
rem Deskside Radio - desktop shortcut that opens in Microsoft Edge.
rem
rem The same shortcut "Win - Create Desktop Shortcut (Chrome).cmd" makes, but
rem pinned to Edge rather than to whichever of Chrome or Edge was found
rem first. Useful on a work machine where Edge is the browser allowed.
rem
rem   "Win - Create Desktop Shortcut (Edge).cmd"           dial icon
rem   "Win - Create Desktop Shortcut (Edge).cmd" console   console icon
rem   "Win - Create Desktop Shortcut (Edge).cmd" plain     dial icon, no Edge logo
rem
rem The shortcut is called "Deskside Radio (Edge)" so it can sit beside the
rem Chrome one without either overwriting the other. Its profile is separate
rem too: stations and settings do not carry across between them.

title Deskside Radio - desktop shortcut (Edge)

rem The installer calls this one and prints its own account around it,
rem and a banner in the middle of somebody else's output is not a
rem banner. DESKSIDE_NOPAUSE already means "you are being called".
if not defined DESKSIDE_NOPAUSE (
  echo.
  echo   DESKSIDE RADIO - DESKTOP SHORTCUT (EDGE)
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

rem "plain", before or after the theme, leaves the browser badge off: the
rem theme's own icon, as every shortcut had before 1.5.10.
set "THEME=%~1"
set "PLAIN="
if /i "%~1"=="plain" set "THEME=%~2"
if /i "%~1"=="plain" set "PLAIN=1"
if /i "%~2"=="plain" set "PLAIN=1"
set "THEMEARG=%THEME%"
if not defined THEME set "THEME=dial"
set "ICON=%APPDIR%assets\favicon-%THEME%.ico"
if not exist "%ICON%" (
  set "THEME=dial"
  set "ICON=%APPDIR%assets\favicon-dial.ico"
)

rem ---- find Edge ----------------------------------------------------------
set "BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER for /f "skip=2 tokens=2,*" %%A in ('%SystemRoot%\System32\reg.exe query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" /ve 2^>nul') do if exist "%%B" set "BROWSER=%%B"

if not defined BROWSER (
  echo.
  echo   Microsoft Edge was not found on this machine.
  echo   Use "Win - Create Desktop Shortcut (Chrome).cmd" instead - it takes
  echo   Chrome or Edge, whichever is there.
  echo.
  pause
  exit /b 1
)

rem A profile of its own, so this shortcut and the Chrome one do not fight
rem over one set of stored settings.
set "PROFILE=%LOCALAPPDATA%\DesksideRadio\profile-edge"
set "APPROOT=%APPDIR:~0,-1%"

rem The flags that keep the profile from filling with things a browser
rem showing one local file will never consult. Word for word the line in
rem "Win - Open Deskside Radio.cmd"; a test holds the copies together.
set "LEAN= --disable-background-networking --disable-component-update --disable-breakpad --disable-domain-reliability --disable-sync --no-pings --disable-features=OptimizationHints,OptimizationGuideModelDownloading,SegmentationPlatform,MediaRouter --disk-cache-size=16777216 --media-cache-size=16777216 --disable-extensions --force-dark-mode"

rem The shortcut aims at the opener rather than at the browser, the same as
rem the Chrome one. The opener starts Edge with these same flags and then does
rem the things a page cannot do for itself: takes the resize grip off the
rem window, starts the watcher that sizes the mini radio, leaves the page a
rem note about the Desktop shortcut, and checks for updates once a day.
rem
rem This script aimed straight at msedge.exe until 1.5.7, so on a machine
rem that used it none of that ever ran -- found on a work PC as a resizable
rem window, an unsized mini radio, and a shortcut button that would not hide.
rem
rem It passes "profile-edge" to the opener, which otherwise defaults to
rem profile-chrome: this shortcut's stations have always lived in the Edge
rem folder, and an opener that did not know would open the radio empty.
rem
rem Through wscript and the .vbs so no console flashes; the .cmd alone if an
rem older folder has no .vbs; straight at Edge, as before, with neither.
set "WSCRIPT=%SystemRoot%\System32\wscript.exe"
set "OPENER=%APPDIR%Win - Open Deskside Radio.vbs"
set "OPENERCMD=%APPDIR%Win - Open Deskside Radio.cmd"
if not exist "%OPENER%" set "OPENER="
if not exist "%OPENERCMD%" set "OPENERCMD="
if not exist "%WSCRIPT%" set "OPENER="

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

rem Every value reaches PowerShell as an environment variable, and every
rem quote inside the argument string is built with [char]34. A literal " in
rem here would end the -Command line cmd is holding open.
rem
rem PowerShell is named by its full path: a double-clicked .cmd runs with the
rem app folder as the current directory, and a default Windows looks there
rem before it looks along PATH.
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$desktop = [Environment]::GetFolderPath('Desktop');" ^
  "$path = Join-Path $desktop 'Deskside Radio (Edge).lnk';" ^
  "$link = (New-Object -ComObject WScript.Shell).CreateShortcut($path);" ^
  "$q = [char]34;" ^
  "if ($env:OPENER) {" ^
  "  $link.TargetPath = $env:WSCRIPT;" ^
  "  $link.Arguments = $q + $env:OPENER + $q + ' ' + $q + $env:BROWSER + $q + ' profile-edge';" ^
  "} elseif ($env:OPENERCMD) {" ^
  "  $link.TargetPath = $env:OPENERCMD;" ^
  "  $link.Arguments = $q + $env:BROWSER + $q + ' profile-edge';" ^
  "  $link.WindowStyle = 7;" ^
  "} else {" ^
  "  $url = ([Uri]$env:TARGET).AbsoluteUri;" ^
  "  $link.TargetPath = $env:BROWSER;" ^
  "  $link.Arguments = '--app=' + $q + $url + $q +" ^
  "    ' --autoplay-policy=no-user-gesture-required' +" ^
  "    ' --window-size=1133,741' +" ^
  "    ' --user-data-dir=' + $q + $env:PROFILE + $q +" ^
  "    ' --no-first-run --no-default-browser-check' + $env:LEAN;" ^
  "}" ^
  "$ic = $env:ICON + ',0'; $il = $env:THEME + ', plain';" ^
  "$si = Join-Path $env:APPDIR 'assets\shortcut-icon.ps1';" ^
  "if (Test-Path -LiteralPath $si) { try {" ^
  "  $r = & $si -Old $link.IconLocation -Browser $env:BROWSER -Theme $env:THEMEARG -Plain:($env:PLAIN -eq '1');" ^
  "  if ($r -and $r.Location) { $ic = $r.Location; $il = $r.Label } } catch { } };" ^
  "$link.IconLocation = $ic;" ^
  "$link.WorkingDirectory = $env:APPDIR;" ^
  "$link.Description = 'Deskside Radio (Edge)';" ^
  "$link.Save();" ^
  "Write-Host ''; Write-Host ('  Shortcut created: ' + $path); Write-Host ('  Icon: ' + $il)"

if errorlevel 1 (
  echo.
  echo   Something went wrong creating the shortcut.
  echo.
  pause
  exit /b 1
)

echo   Opens with: Microsoft Edge
echo   Its own profile: "%PROFILE%"
echo.
echo   Turn on "Play on launch" in Settings and the radio starts by itself.
echo   That profile starts empty: to bring your stations across, export them
echo   from Settings - Service and leave deskside-radio-settings.js beside
echo   index.html. It is read once, the first time that profile opens.
echo.
rem Only the success path. The pauses above sit on error paths and
rem stop whoever is calling, which is what an error is for.
if not defined DESKSIDE_NOPAUSE pause
