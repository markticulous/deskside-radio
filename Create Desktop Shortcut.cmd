@echo off
setlocal
rem Deskside Radio - put a shortcut on the Desktop.
rem
rem A web page cannot do this itself: Chrome will not save a .url file under
rem its own name and renames it to .download, because such a file can point
rem anywhere. So the shortcut is made here instead, as a real .lnk.
rem
rem Run it with a theme name to get that theme's icon:
rem
rem   "Create Desktop Shortcut.cmd" console
rem
rem The app's shortcut panel shows the line to use. With no argument, or one
rem whose icon is missing, it falls back to the analogue dial icon.

title Deskside Radio - Desktop shortcut

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
set "ICON=%APPDIR%favicon-%THEME%.ico"
if not exist "%ICON%" (
  set "THEME=dial"
  set "ICON=%APPDIR%favicon-dial.ico"
)
if not exist "%ICON%" (
  set "THEME=default"
  set "ICON=%APPDIR%favicon.ico"
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$desktop = [Environment]::GetFolderPath('Desktop');" ^
  "$path = Join-Path $desktop 'Deskside Radio.lnk';" ^
  "$link = (New-Object -ComObject WScript.Shell).CreateShortcut($path);" ^
  "$link.TargetPath = $env:TARGET;" ^
  "$link.IconLocation = $env:ICON + ',0';" ^
  "$link.WorkingDirectory = $env:APPDIR;" ^
  "$link.Description = 'Deskside Radio';" ^
  "$link.Save();" ^
  "Write-Host ''; Write-Host ('  Shortcut created: ' + $path)"

if errorlevel 1 (
  echo.
  echo   Something went wrong creating the shortcut.
) else (
  echo   Icon: %THEME%
)

echo.
pause
