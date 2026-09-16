@echo off
setlocal
rem Deskside Radio - take it off this machine.
rem
rem The counterpart to "Win-Install-or-Update-Deskside-Radio.cmd", and it
rem works out what to remove the same way that one works out what to
rem install: if index.html is beside this script, this folder is the
rem install. Otherwise argument 1, or the default below.
rem
rem It removes:
rem
rem   every shortcut     the Desktop, the Startup folder and the Start menu
rem   the app folder     everything the zip put there, and this script
rem
rem Your stations, schedule and settings are NOT in the app folder. They
rem live in the browser profile at %LOCALAPPDATA%\DesksideRadio\profile,
rem and that is asked about separately, because it is the only part of
rem this that reinstalling cannot undo. The answer defaults to keeping it.
rem
rem Nothing was ever written to the registry and nothing ever ran as a
rem service, so there is nothing else to find.
rem
rem   "Win - Uninstall Deskside Radio.cmd"            this folder
rem   "Win - Uninstall Deskside Radio.cmd" D:\Radio   somewhere else

rem ---- the second copy, doing the one thing the first cannot ------------
rem Checked before anything else, because this is not a run anybody asked
rem for. See "the app folder" below for why it exists.
if /i "%~2"=="--finish" goto :finish

title Deskside Radio - uninstall

echo.
echo   DESKSIDE RADIO - UNINSTALL
echo.

set "DEFAULT=%LOCALAPPDATA%\DesksideRadio\app"
set "PROFILE=%LOCALAPPDATA%\DesksideRadio\profile"

rem Full paths, for the same reason the other scripts use them: a
rem double-clicked .cmd runs with its own folder as the current directory
rem and cmd looks there before it looks along PATH.
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

rem The same discriminator the installer uses: app.css is in the source
rem tree and is inlined away by the build. Without this, running the
rem repository's own copy would delete the source.
if exist "%~dp0app.css" goto :repo

rem ---- what are we removing ---------------------------------------------
rem APPDIR keeps its trailing backslash for joining names onto; APPROOT has
rem it taken off, because "C:\path\" handed to an exe is a path with a
rem quote on the end of it. Backslashes come off the argument before one is
rem put back, or "D:\Radio\" leaves one behind and the trap springs anyway.
set "ARG=%~1"
:trimslash
if not defined ARG goto :trimmed
if not "%ARG:~-1%"=="\" goto :trimmed
set "ARG=%ARG:~0,-1%"
goto :trimslash
:trimmed

if exist "%~dp0index.html" (
  set "APPDIR=%~dp0"
) else (
  if not defined ARG (set "APPDIR=%DEFAULT%\") else (set "APPDIR=%ARG%\")
)
call set "APPROOT=%%APPDIR:~0,-1%%"

if not exist "%APPDIR%index.html" goto :notthere

echo   This will remove Deskside Radio from this machine.
echo.
echo     the app folder    "%APPROOT%"
echo     its shortcuts     Desktop, Startup and the Start menu
echo.
echo   Your stations and settings are kept - they are in the browser
echo   profile, not in that folder. You are asked about those separately.
echo.
set "GO="
set /p "GO=  Type Y and press Enter to go ahead, or just press Enter to stop: "
if /i not "%GO%"=="Y" goto :cancelled

rem ---- the shortcuts ----------------------------------------------------
rem Deleted before the folder, so a folder that will not go leaves no
rem shortcuts pointing into nothing.
rem
rem Found two ways rather than read off a list of names. A list goes stale
rem the moment a new launcher ships, and it never covered a shortcut
rem somebody renamed or copied.
rem
rem   by name    Deskside Radio*.lnk, which is every shortcut any of these
rem              scripts has ever written -- Deskside Radio, (Edge) and
rem              (Firefox) -- plus any a later one adds, plus a copy
rem              somebody made and called "Deskside Radio mornings".
rem   by target  any .lnk in those folders pointing into the app folder,
rem              as its target, its working directory, or inside its
rem              arguments, which is where the file:// URL sits for the
rem              browser shortcuts. This is what catches one renamed to
rem              something else entirely.
rem
rem Four folders: this account's Desktop, the all-users Desktop, the
rem Startup folder and the Start menu. Every value reaches PowerShell as an
rem environment variable and every quote is built with [char]34, because a
rem literal one would end the -Command line cmd is holding open.
echo.
echo   Removing shortcuts...
"%PS%" -NoProfile -ExecutionPolicy Bypass -Command ^
  "$q = [char]34;" ^
  "$where = @(" ^
  "  [Environment]::GetFolderPath('Desktop')," ^
  "  [Environment]::GetFolderPath('CommonDesktopDirectory')," ^
  "  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup')," ^
  "  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs')" ^
  ") ^| Where-Object { $_ -and (Test-Path -LiteralPath $_) } ^| Select-Object -Unique;" ^
  "$root = $env:APPROOT;" ^
  "$shell = New-Object -ComObject WScript.Shell;" ^
  "$hit = @();" ^
  "foreach ($dir in $where) {" ^
  "  Get-ChildItem -LiteralPath $dir -Filter '*.lnk' -ErrorAction SilentlyContinue ^| ForEach-Object {" ^
  "    $take = ($_.Name -like 'Deskside Radio*.lnk') -or ($_.Name -eq 'Update Deskside Radio.lnk');" ^
  "    if (-not $take -and $root) {" ^
  "      try {" ^
  "        $s = $shell.CreateShortcut($_.FullName);" ^
  "        $take = ($s.TargetPath -and $s.TargetPath -like ($root + '*')) -or" ^
  "                ($s.WorkingDirectory -and $s.WorkingDirectory -like ($root + '*')) -or" ^
  "                ($s.Arguments -and $s.Arguments -like ('*' + $root + '*'));" ^
  "      } catch { $take = $false }" ^
  "    }" ^
  "    if ($take) { $hit += $_.FullName }" ^
  "  }" ^
  "};" ^
  "foreach ($f in $hit) {" ^
  "  Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue;" ^
  "  if (Test-Path -LiteralPath $f) { Write-Host ('    could not remove ' + $q + $f + $q) }" ^
  "  else { Write-Host ('    removed ' + $q + (Split-Path $f -Leaf) + $q) }" ^
  "};" ^
  "if ($hit.Count -eq 0) { Write-Host '    none found' }"

rem ---- the settings -----------------------------------------------------
rem Asked before the folder goes, because the folder going is the last
rem thing that happens and this window has to still be here to ask. The
rem default is to keep them: somebody uninstalling to fix something, or to
rem move the install, wants their stations there afterwards.
if not exist "%PROFILE%\" goto :folder
echo.
echo   Your stations, schedule and settings are in
echo     "%PROFILE%"
echo.
echo   Kept, they are picked up again if you ever reinstall.
set "WIPE="
set /p "WIPE=  Type D and press Enter to delete them too, or just press Enter to keep them: "
if /i not "%WIPE%"=="D" (
  echo   Kept.
) else (
  rd /s /q "%PROFILE%" 2>nul
  if exist "%PROFILE%\" (echo   Could not remove it - close any Deskside Radio window and run this again.) else (echo   Deleted.)
)

rem ---- the app folder ---------------------------------------------------
rem cmd reads a .cmd one line at a time and holds the file open the whole
rem way through, so a script inside the folder cannot delete the folder it
rem is inside: its own file survives and keeps the folder alive with it.
rem
rem So the last step is handed to a copy of this file in %TEMP%, started
rem without waiting, which then waits for this window to close before it
rem removes the tree. Deliberately the very last thing, after everything
rem that needs to be said has been said and read, because this window has
rem to be gone before the other one can do its work.
rem
rem When this is being run from outside the folder -- with the folder named
rem as an argument -- none of that applies and it is removed right here,
rem where the result can be reported.
:folder
echo.
if /i not "%~dp0"=="%APPDIR%" (
  echo   Removing "%APPROOT%"...
  rd /s /q "%APPROOT%" 2>nul
  if exist "%APPROOT%\" (
    echo   Some of it could not be removed. Usually that means the radio is
    echo   still open - close it and run this again.
  ) else (
    echo   Gone.
  )
  goto :done
)

set "MOVED=%TEMP%\deskside-radio-uninstall.cmd"
copy /y "%~f0" "%MOVED%" >nul 2>&1
if not exist "%MOVED%" (
  echo   Could not write to "%TEMP%", so the app folder is still here.
  echo   Everything else is done. Delete "%APPROOT%" by hand to finish.
  goto :done
)

echo   Everything else is done.
echo.
echo   "%APPROOT%" is removed as this window closes - it holds this script
echo   open while it is running, so it has to go last.
echo.
pause
start "" /min "%MOVED%" "%APPROOT%" --finish
exit /b 0

:done
echo.
echo   Deskside Radio has been uninstalled.
echo.
pause
exit /b 0

rem ---- the second copy --------------------------------------------------
rem Started by the copy in the app folder, with the folder to remove, and
rem never run by hand. It says nothing and asks nothing.
rem
rem The window it was started from is closing as this begins, so the first
rem attempt can still find the script locked. ping is the wait: timeout
rem needs a console of its own and this one is minimised. Ten tries at
rem roughly a second is far longer than a window takes to go.
:finish
set "TREE=%~1"
if not defined TREE exit /b 1
if not exist "%TREE%\" exit /b 0
for /l %%i in (1,1,10) do (
  rd /s /q "%TREE%" 2>nul
  if not exist "%TREE%\" goto :finished
  %SystemRoot%\System32\ping.exe -n 2 127.0.0.1 >nul 2>&1
)
:finished
rem And this copy takes itself out of %TEMP% on the way past: cmd releases
rem the file once it has read the goto, so the del lands.
(goto) 2>nul & del "%~f0"

rem ---- the ways it can go wrong -----------------------------------------

:repo
echo   This is the Deskside Radio source folder, not an install.
echo.
echo   Running here would delete the source. To remove an installed copy,
echo   run the one in the app folder, or name the folder:
echo.
echo     "Win - Uninstall Deskside Radio.cmd" "%%LOCALAPPDATA%%\DesksideRadio\app"
echo.
pause
exit /b 1

:notthere
echo   No Deskside Radio install found at
echo     "%APPROOT%"
echo.
echo   Nothing has been changed. If it is installed somewhere else, name
echo   that folder:
echo.
echo     "Win - Uninstall Deskside Radio.cmd" D:\Somewhere\Radio
echo.
pause
exit /b 1

:cancelled
echo.
echo   Stopped. Nothing has been changed.
echo.
pause
exit /b 1
