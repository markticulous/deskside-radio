@echo off
setlocal
rem Deskside Radio - desktop shortcut that opens in Firefox.
rem
rem   "Win - Create Desktop Shortcut (Firefox).cmd"           dial icon
rem   "Win - Create Desktop Shortcut (Firefox).cmd" console   console icon
rem
rem Firefox is the odd one out, and it is worth knowing why before you use
rem this one.
rem
rem   - There is no --app. Firefox removed site-specific browsers, so the
rem     radio opens in an ordinary window with a tab strip and an address
rem     bar above it. Chrome and Edge give it a window of its own; Firefox
rem     cannot. Press F11 for fullscreen if the furniture bothers you.
rem
rem   - Autoplay is not a command-line flag either. It is a preference, so
rem     this script writes a user.js into the profile it makes, setting
rem     media.autoplay.default to 0 (allow). That is why the profile is
rem     created here rather than left to Firefox.
rem
rem   - -profile takes a folder, and that folder is this shortcut's alone.
rem     Stations and settings do not carry across from Chrome or Edge.
rem
rem The shortcut is called "Deskside Radio (Firefox)" so it can sit beside
rem the others.

title Deskside Radio - desktop shortcut (Firefox)

echo.
echo   DESKSIDE RADIO - DESKTOP SHORTCUT (FIREFOX)
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

rem ---- find Firefox -------------------------------------------------------
set "BROWSER="
if exist "%ProgramFiles%\Mozilla Firefox\firefox.exe" set "BROWSER=%ProgramFiles%\Mozilla Firefox\firefox.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe" set "BROWSER=%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe"
if not defined BROWSER if exist "%LOCALAPPDATA%\Mozilla Firefox\firefox.exe" set "BROWSER=%LOCALAPPDATA%\Mozilla Firefox\firefox.exe"
if not defined BROWSER for /f "skip=2 tokens=2,*" %%A in ('%SystemRoot%\System32\reg.exe query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\firefox.exe" /ve 2^>nul') do if exist "%%B" set "BROWSER=%%B"

if not defined BROWSER (
  echo.
  echo   Firefox was not found on this machine.
  echo   Use "Win - Create Desktop Shortcut (Chrome).cmd" for Chrome or Edge instead.
  echo.
  pause
  exit /b 1
)

set "PROFILE=%LOCALAPPDATA%\DesksideRadio\profile-firefox"

rem ---- the profile, and the one preference that matters --------------------
rem user.js is applied at every startup, so this survives Firefox rewriting
rem prefs.js on the way out.
if not exist "%PROFILE%" mkdir "%PROFILE%"
> "%PROFILE%\user.js" echo // Written by "Win - Create Desktop Shortcut (Firefox).cmd".
>> "%PROFILE%\user.js" echo // 0 = allow audio and video to start on their own. Firefox has no
>> "%PROFILE%\user.js" echo // command-line equivalent of Chrome's --autoplay-policy, so the radio
>> "%PROFILE%\user.js" echo // would sit behind a Tap to start panel without this.
>> "%PROFILE%\user.js" echo user_pref("media.autoplay.default", 0);
>> "%PROFILE%\user.js" echo user_pref("media.autoplay.blocking_policy", 0);
>> "%PROFILE%\user.js" echo // Skip the import wizard and the what's-new tab on a fresh profile.
>> "%PROFILE%\user.js" echo user_pref("browser.shell.checkDefaultBrowser", false);
>> "%PROFILE%\user.js" echo user_pref("browser.startup.homepage_override.mstone", "ignore");

%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$desktop = [Environment]::GetFolderPath('Desktop');" ^
  "$path = Join-Path $desktop 'Deskside Radio (Firefox).lnk';" ^
  "$link = (New-Object -ComObject WScript.Shell).CreateShortcut($path);" ^
  "$q = [char]34;" ^
  "$url = ([Uri]$env:TARGET).AbsoluteUri;" ^
  "$link.TargetPath = $env:BROWSER;" ^
  "$link.Arguments = '-profile ' + $q + $env:PROFILE + $q +" ^
  "  ' -new-window ' + $q + $url + $q;" ^
  "$link.IconLocation = $env:ICON + ',0';" ^
  "$link.WorkingDirectory = $env:APPDIR;" ^
  "$link.Description = 'Deskside Radio (Firefox)';" ^
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
echo   Opens with: Mozilla Firefox
echo   Its own profile: "%PROFILE%"
echo.
echo   Firefox has no app-window mode, so this opens an ordinary window with
echo   a tab strip. F11 gives you fullscreen if you would rather not see it.
echo.
echo   Autoplay is switched on for this profile only, in user.js.
echo   To bring your stations across, export them from Settings - Service
echo   and leave deskside-radio-settings.js beside index.html.
echo.
pause
