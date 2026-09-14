@echo off
setlocal
rem Deskside Radio - start it automatically when you sign in.
rem
rem This puts the same shortcut "Create Desktop Shortcut.cmd" makes into the
rem Startup folder, which Windows opens on sign-in. Nothing is written to the
rem registry and nothing runs as a service: it is one .lnk file in a folder
rem you can open yourself with Win+R, shell:startup.
rem
rem Run it again to see whether it is on, or run it with "off" to remove it:
rem
rem   "Start With Windows.cmd"           turn it on, with the dial icon
rem   "Start With Windows.cmd" console   turn it on, with the console icon
rem   "Start With Windows.cmd" off       turn it off
rem
rem The browser detection below is deliberately a copy of the one in
rem "Create Desktop Shortcut.cmd" rather than shared with it. These are files
rem people double-click, sometimes one without ever running the other, so
rem each one has to work on its own.
rem
rem For the radio to be playing when you arrive, turn on "Play on launch" in
rem Settings and pick a station, or set up a schedule.

title Deskside Radio - start with Windows

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

rem ---- off ----------------------------------------------------------------
set "MODE=%~1"
if /i "%MODE%"=="off" goto :remove
if /i "%MODE%"=="remove" goto :remove
if /i "%MODE%"=="/off" goto :remove
goto :install

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
pause
exit /b 0

rem ---- on -----------------------------------------------------------------
:install
set "THEME=%MODE%"
if not defined THEME set "THEME=dial"
set "ICON=%APPDIR%favicon-%THEME%.ico"
if not exist "%ICON%" (
  set "THEME=dial"
  set "ICON=%APPDIR%favicon-dial.ico"
)
if not exist "%ICON%" (
  set "THEME=default"
  set "ICON=%APPDIR%favicon.ico"
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
  "$path = Join-Path $env:STARTUP 'Deskside Radio.lnk';" ^
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
  "Write-Host ''; Write-Host ('  Set to start with Windows: ' + $path)"

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
echo   To stop it starting: run this script again with off
echo     "Start With Windows.cmd" off
echo.
pause
