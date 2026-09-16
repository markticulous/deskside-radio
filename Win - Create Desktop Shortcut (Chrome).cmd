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

set "PROFILE=%LOCALAPPDATA%\DesksideRadio\profile"

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
  "if ($env:BROWSER) {" ^
  "  $url = ([Uri]$env:TARGET).AbsoluteUri;" ^
  "  $link.TargetPath = $env:BROWSER;" ^
  "  $link.Arguments = '--app=' + $q + $url + $q +" ^
  "    ' --autoplay-policy=no-user-gesture-required' +" ^
  "    ' --window-size=1133,741' +" ^
  "    ' --user-data-dir=' + $q + $env:PROFILE + $q +" ^
  "    ' --no-first-run --no-default-browser-check';" ^
  "} else {" ^
  "  $link.TargetPath = $env:TARGET;" ^
  "}" ^
  "$link.IconLocation = $env:ICON + ',0';" ^
  "$link.WorkingDirectory = $env:APPDIR;" ^
  "$link.Description = 'Deskside Radio';" ^
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
rem The installer calls this script and prints its own summary after it, so
rem it sets DESKSIDE_NOPAUSE to run straight through. Undefined when this is
rem double-clicked on its own, which is every other time. The two pauses on
rem the error paths above are left alone: those should always stop.
if not defined DESKSIDE_NOPAUSE pause
