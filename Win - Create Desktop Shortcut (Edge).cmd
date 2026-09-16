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
rem
rem The shortcut is called "Deskside Radio (Edge)" so it can sit beside the
rem Chrome one without either overwriting the other. Its profile is separate
rem too: stations and settings do not carry across between them.

title Deskside Radio - desktop shortcut (Edge)

echo.
echo   DESKSIDE RADIO - DESKTOP SHORTCUT (EDGE)
echo.

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
  "$url = ([Uri]$env:TARGET).AbsoluteUri;" ^
  "$link.TargetPath = $env:BROWSER;" ^
  "$link.Arguments = '--app=' + $q + $url + $q +" ^
  "  ' --autoplay-policy=no-user-gesture-required' +" ^
  "  ' --window-size=1133,741' +" ^
  "  ' --user-data-dir=' + $q + $env:PROFILE + $q +" ^
  "  ' --no-first-run --no-default-browser-check';" ^
  "$link.IconLocation = $env:ICON + ',0';" ^
  "$link.WorkingDirectory = $env:APPDIR;" ^
  "$link.Description = 'Deskside Radio (Edge)';" ^
  "$link.Save();" ^
  "Write-Host ''; Write-Host ('  Shortcut created: ' + $path)"

if errorlevel 1 (
  echo.
  echo   Something went wrong creating the shortcut.
  echo.
  pause
  exit /b 1
)

echo   Icon: %THEME%
echo   Opens with: Microsoft Edge
echo   Its own profile: "%PROFILE%"
echo.
echo   Turn on "Play on launch" in Settings and the radio starts by itself.
echo   That profile starts empty: to bring your stations across, export them
echo   from Settings - Service and leave deskside-radio-settings.js beside
echo   index.html. It is read once, the first time that profile opens.
echo.
pause
