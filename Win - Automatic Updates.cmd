@echo off
setlocal
rem ---------------------------------------------------------------------
rem  Deskside Radio - turn automatic updating off, or back on.
rem
rem    "Win - Automatic Updates.cmd" off     stop updating by itself
rem    "Win - Automatic Updates.cmd"         start again
rem
rem  The radio keeps itself up to date. When you open it from the Desktop
rem  shortcut, the launcher looks once a day to see whether a newer version
rem  has been published, and if there is one it fetches it in the
rem  background while you listen. The new version is on disk straight away
rem  and on screen the next time you open the radio, which says which
rem  version it is now running.
rem
rem  Nothing is installed to do that. There is no service, no scheduled
rem  task and nothing in the registry; the launcher does it on its way past
rem  and exits, as it always did.
rem
rem  This script is the way to stop it, and it is a script rather than a
rem  switch inside the app for a plain reason: the app's settings live in
rem  the browser's own storage, which a batch file cannot read. So the
rem  answer is kept where the launcher can see it -- one small file in the
rem  app folder -- the same way starting with Windows is one file in the
rem  Startup folder.
rem
rem  Turning it off does not stop the radio telling you an update exists.
rem  That notice is the app's own, it sends no more than the question, and
rem  it has its own switch in Settings - Service.
rem ---------------------------------------------------------------------

title Deskside Radio - automatic updates

set "APPDIR=%~dp0"
set "MARK=%APPDIR%assets\auto-update-off.txt"

echo.
echo   DESKSIDE RADIO - AUTOMATIC UPDATES
echo.

if not exist "%APPDIR%index.html" (
  echo   Could not find index.html next to this script.
  echo   Keep this file in the Deskside Radio folder and run it again.
  echo.
  pause
  exit /b 1
)


rem assets\ is made by the installer, but a folder taken apart by hand may
rem not have one, and writing the marker is the whole job here.
if not exist "%APPDIR%assets\" mkdir "%APPDIR%assets" 2>nul

if /i "%~1"=="off" goto :turnoff
if /i "%~1"=="on" goto :turnon
if "%~1"=="" goto :turnon

echo   Sorry, "%~1" is not something this understands.
echo.
echo     "Win - Automatic Updates.cmd" off     stop updating by itself
echo     "Win - Automatic Updates.cmd"         start again
echo.
pause
exit /b 1

:turnoff
> "%MARK%" echo Deskside Radio will not update itself while this file is here.
>>"%MARK%" echo.
>>"%MARK%" echo The launcher looks for this file each time you open the radio. Delete it,
>>"%MARK%" echo or run "Win - Automatic Updates.cmd" with no argument, and automatic
>>"%MARK%" echo updating starts again.
>>"%MARK%" echo.
>>"%MARK%" echo Nothing else reads it, and it holds nothing about you.
if not exist "%MARK%" goto :failed
echo   Automatic updating is OFF.
echo.
echo   The radio will still tell you when a new version has been published.
echo   To take one, run "Win-Install-or-Update-Deskside-Radio.cmd" in this
echo   folder, or download it again from the releases page.
echo.
echo   To start again: run this script with no argument.
echo.
pause
exit /b 0

:turnon
if exist "%MARK%" del /q "%MARK%" >nul 2>&1
if exist "%MARK%" goto :failed
echo   Automatic updating is ON.
echo.
echo   Opening the radio from your Desktop shortcut now looks once a day for
echo   a newer version, and fetches it in the background while you listen.
echo   The new version is there the next time you open the radio.
echo.
echo   To stop it: "Win - Automatic Updates.cmd" off
echo.
pause
exit /b 0

:failed
echo.
echo   Could not write to
echo      "%APPDIR%assets"
echo.
echo   Check the folder is not read-only and try again.
echo.
pause
exit /b 1
