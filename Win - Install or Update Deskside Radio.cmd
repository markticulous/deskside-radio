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
rem   "Win - Install or Update Deskside Radio.cmd"            the usual way
rem   "Win - Install or Update Deskside Radio.cmd" D:\Radio   somewhere else

title Deskside Radio - install or update

set "ZIPURL=https://github.com/markticulous/deskside-radio/releases/latest/download/deskside-radio.zip"
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

set "UPDATING="
if exist "%~dp0index.html" (
  set "APPDIR=%~dp0"
  set "UPDATING=1"
) else (
  if not defined ARG (set "APPDIR=%DEFAULT%\") else (set "APPDIR=%ARG%\")
)
call set "APPROOT=%%APPDIR:~0,-1%%"

rem A mistyped argument should not scatter seventeen files through
rem someone's Documents. An existing folder is only written into if it
rem already looks like an install.
if not defined UPDATING if exist "%APPROOT%\" (
  dir /b "%APPROOT%" 2>nul | "%FINDSTR%" /r "." >nul && goto :occupied
)

echo.
if defined UPDATING (echo   Updating "%APPROOT%") else (echo   Installing to "%APPROOT%")
echo.

rem ---- fetch ------------------------------------------------------------
set "ZIP=%TEMP%\deskside-radio-download.zip"
if exist "%ZIP%" del /q "%ZIP%" >nul 2>&1

echo   Fetching the latest release...
"%CURL%" -fL --retry 2 -o "%ZIP%" "%ZIPURL%"
if errorlevel 1 goto :nofetch

rem Read the archive through before writing a single file out of it. One
rem line, and it turns a truncated download from a half-replaced app
rem folder into nothing having happened at all.
"%TAR%" -tf "%ZIP%" >nul 2>&1
if errorlevel 1 goto :corrupt

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

if not exist "%APPDIR%index.html" goto :corrupt

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
set "DESKSIDE_NOPAUSE=1"
echo.| call "%APPDIR%Win - Create Desktop Shortcut (Chrome).cmd"
set "DESKSIDE_NOPAUSE="

rem And one in the Start menu for the updater itself, because
rem %LOCALAPPDATA% is not a folder anyone goes looking in. Type "update
rem desk" at the Start button and it is there.
set "SELF=%APPDIR%Win - Install or Update Deskside Radio.cmd"
set "UPDATER="
if exist "%SELF%" (
  set "UPDATER=1"
  "%PS%" -NoProfile -ExecutionPolicy Bypass -Command ^
    "$dir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs';" ^
    "if (Test-Path -LiteralPath $dir) {" ^
    "  $link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $dir 'Update Deskside Radio.lnk'));" ^
    "  $link.TargetPath = $env:SELF;" ^
    "  $link.IconLocation = $env:APPDIR + 'favicon-dial.ico,0';" ^
    "  $link.WorkingDirectory = $env:APPROOT;" ^
    "  $link.Description = 'Check for and install a newer Deskside Radio';" ^
    "  $link.Save();" ^
    "}"
)

rem ---- done -------------------------------------------------------------
echo.
if defined UPDATING (
  echo   Updated.
  echo.
  echo   Close the radio and open it again to see the new version.
) else (
  echo   Installed to "%APPROOT%"
  echo.
  echo   There is a Deskside Radio shortcut on your Desktop.
  if defined UPDATER echo   To update later, type "update desk" at the Start button.
  echo   Opening the radio now.
  "%PS%" -NoProfile -ExecutionPolicy Bypass -Command ^
    "$p = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Deskside Radio.lnk';" ^
    "if (Test-Path -LiteralPath $p) { Invoke-Item -LiteralPath $p }"
)
echo.
pause
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
echo   "%APPROOT%" already has files in it and none of them is index.html,
echo   so this is not a Deskside Radio folder.
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
