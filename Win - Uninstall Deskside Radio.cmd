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

rem ---- which copy of this am I --------------------------------------
rem cmd reads a .cmd one line at a time and holds the file open the whole
rem way through, so a script inside the app folder cannot delete the folder
rem it is inside: its own file survives and keeps the folder alive with it.
rem
rem The first attempt at this left the deletion until the very end and
rem handed it to a copy in %TEMP% that waited for the first window to
rem close. It worked, but it could not report: by the time anything was
rem deleted the window that would have said so was gone, and if the folder
rem could not be removed -- which happens whenever the radio is still open,
rem because the shortcut sets that folder as the browser's working
rem directory -- nobody was told anything at all.
rem
rem So the handover happens first instead. The copy in the app folder does
rem nothing but move itself to %TEMP% and start that, which then owns the
rem whole job from the confirmation onwards and can watch the folder go.
rem Set above the handover, not below it: the copy in %TEMP% jumps straight
rem to :worker and would otherwise arrive with no PS to call and no idea
rem where the profile lives.
set "DEFAULT=%LOCALAPPDATA%\DesksideRadio\app"
set "PROFILE=%LOCALAPPDATA%\DesksideRadio\profile"

rem Full paths, for the same reason the other scripts use them: a
rem double-clicked .cmd runs with its own folder as the current directory
rem and cmd looks there before it looks along PATH.
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if /i "%~2"=="--worker" goto :worker

title Deskside Radio - uninstall

echo.
echo   DESKSIDE RADIO - UNINSTALL
echo.

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

rem Running from inside the folder that is about to go. Step outside first.
if /i "%~dp0"=="%APPDIR%" (
  set "MOVED=%TEMP%\deskside-radio-uninstall.cmd"
  copy /y "%~f0" "%TEMP%\deskside-radio-uninstall.cmd" >nul 2>&1
  if not exist "%TEMP%\deskside-radio-uninstall.cmd" goto :notemp
  start "" "%TEMP%\deskside-radio-uninstall.cmd" "%APPROOT%" --worker
  exit /b 0
)

:worker
rem Reached either by the copy in %TEMP% -- which is handed the folder as
rem argument 1 -- or by a copy run from anywhere else with the folder
rem named. Both are outside the folder, which is the only thing that
rem matters from here on.
if /i "%~2"=="--worker" (
  set "APPROOT=%~1"
  call set "APPDIR=%%APPROOT%%\"
  title Deskside Radio - uninstall
  echo.
  echo   DESKSIDE RADIO - UNINSTALL
  echo.
)

echo   This removes Deskside Radio from this computer. It touches nothing
echo   outside the two places it put things, and needs no administrator.
echo.
echo   What goes:
echo      the app folder    "%APPROOT%"
echo      its shortcuts     Desktop, Startup and the Start menu
echo.
echo   What stays, unless you say otherwise at the end:
echo      your stations, the schedule, the theme, the sound settings
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
rem   by target  any .lnk in those folders pointing into the folder being
rem              removed -- as its target, its working directory, or inside
rem              its arguments, which is where the file:// URL sits for the
rem              browser shortcuts. This is what catches one that was
rem              renamed to something else entirely.
rem   by name    Deskside Radio*.lnk and Update Deskside Radio.lnk, but
rem              only when the thing it points at is no longer there. The
rem              wildcard covers the updater's current name, Deskside Radio
rem              - Update.lnk; the exact one is kept for installs made
rem              before it was renamed off the letter U.
rem
rem That second condition was learned the hard way. Matching on the name
rem alone removed the Start menu entry belonging to a different install
rem that was not being uninstalled and was still perfectly good. A
rem shortcut with our name and a target that still exists elsewhere
rem belongs to that elsewhere; one with our name and a dead target is
rem what this uninstall just orphaned, and is ours to clear up.
rem
rem Four folders: this account's Desktop, the all-users Desktop, the
rem Startup folder and the Start menu. Every value reaches PowerShell as an
rem environment variable and every quote is built with [char]34, because a
rem literal one would end the -Command line cmd is holding open.
rem
rem The pipes are bare. ^ escapes a pipe on a cmd command line, but not
rem inside a quoted string -- there it is just a caret, and PowerShell was
rem handed a literal ^| and refused to parse the whole block:
rem
rem   Unexpected token '^' in expression or statement.
rem
rem Which it printed, and then carried on, so every shortcut survived an
rem uninstall that said it had removed them. The caret is only ever needed
rem at the end of these lines, outside the quotes, where it joins them.
echo.
echo   Looking for shortcuts...
"%PS%" -NoProfile -ExecutionPolicy Bypass -Command ^
  "$q = [char]34;" ^
  "$where = @(" ^
  "  [Environment]::GetFolderPath('Desktop')," ^
  "  [Environment]::GetFolderPath('CommonDesktopDirectory')," ^
  "  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup')," ^
  "  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs')" ^
  ") | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique;" ^
  "$root = $env:APPROOT;" ^
  "$shell = New-Object -ComObject WScript.Shell;" ^
  "$hit = @();" ^
  "foreach ($dir in $where) {" ^
  "  Get-ChildItem -LiteralPath $dir -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {" ^
  "    $named = ($_.Name -like 'Deskside Radio*.lnk') -or ($_.Name -eq 'Update Deskside Radio.lnk');" ^
  "    $take = $false;" ^
  "    try {" ^
  "      $s = $shell.CreateShortcut($_.FullName);" ^
  "      $mine = $root -and (" ^
  "        ($s.TargetPath -and $s.TargetPath -like ($root + '*')) -or" ^
  "        ($s.WorkingDirectory -and $s.WorkingDirectory -like ($root + '*')) -or" ^
  "        ($s.Arguments -and $s.Arguments -like ('*' + $root + '*')));" ^
  "      $dead = -not ($s.TargetPath) -or -not (Test-Path -LiteralPath $s.TargetPath);" ^
  "      $take = $mine -or ($named -and $dead);" ^
  "    } catch { $take = $named }" ^
  "    if ($take) { $hit += $_.FullName }" ^
  "  }" ^
  "};" ^
  "foreach ($f in $hit) {" ^
  "  Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue;" ^
  "  if (Test-Path -LiteralPath $f) { Write-Host ('     could not remove ' + $q + $f + $q) }" ^
  "  else { Write-Host ('     ' + $q + (Split-Path $f -Leaf) + $q) }" ^
  "};" ^
  "if ($hit.Count -eq 0) { Write-Host '     none were left to remove' }"
set "MSG=Shortcuts cleared"
call :ok

rem ---- the settings -----------------------------------------------------
rem Its own question, with its own answer, because this is the one part of
rem an uninstall that reinstalling cannot undo. The default is to keep
rem them: somebody uninstalling to fix something, or to move the install,
rem wants their stations there afterwards.
if not exist "%PROFILE%\" goto :folder
echo.
echo   Your stations, schedule and settings are in
echo      "%PROFILE%"
echo.
echo   Keep them and they are picked up again if you ever reinstall. This
echo   is the one part of an uninstall that reinstalling cannot undo.
set "WIPE="
set /p "WIPE=  Type D and press Enter to delete them too, or just press Enter to keep them: "
if /i not "%WIPE%"=="D" (
  set "MSG=Settings kept"
  call :ok
) else (
  rd /s /q "%PROFILE%" 2>nul
  if exist "%PROFILE%\" (
    echo      Could not remove them - close any Deskside Radio window and run this again.
  ) else (
    set "MSG=Settings deleted"
    call :ok
  )
)

rem ---- the app folder ---------------------------------------------------
rem This copy is outside the folder, so it can simply delete it and watch
rem what happened -- no handover, no minimised window, no guessing.
rem
rem The usual reason it will not go is that the radio is still open: the
rem Desktop shortcut sets the app folder as the browser's working
rem directory, and Windows will not remove a folder that a running process
rem is sitting in. That is worth saying in those words, because "access
rem denied" sends people looking for permissions they do not need.
:folder
echo.
echo   Removing the app folder...
rd /s /q "%APPROOT%" 2>nul

if not exist "%APPROOT%\" goto :gone

rem Still there. Give whatever is holding it a moment -- a browser that has
rem just been closed can take a second to let go -- and try again.
%SystemRoot%\System32\ping.exe -n 3 127.0.0.1 >nul 2>&1
rd /s /q "%APPROOT%" 2>nul
if not exist "%APPROOT%\" goto :gone

echo.
echo   The folder could not be removed:
echo     "%APPROOT%"
echo.
echo   Almost always this means the radio is still open. Its window uses
echo   that folder as its working directory, and Windows will not delete a
echo   folder something is running in.
echo.
echo   Close every Deskside Radio window and run this again - everything
echo   else is already done, so it will go straight to this step.
echo.
pause
exit /b 1

:gone
set "MSG=Removed"
call :ok

rem And the folder above it, which is ours too when the install was in its
rem default place: the installer puts the app and the browser profile side
rem by side under %LOCALAPPDATA%\DesksideRadio precisely so that everything
rem the radio ever writes is in one place. Leaving that place behind, empty,
rem after an uninstall that said it was finished is not finishing.
rem
rem `rd` without /s removes a directory only when it is empty, so this is
rem safe by construction: keep your settings and the profile is still in
rem there, the call fails, and nothing is said about it. It is only ever
rem tried when the install was at the default path -- an install at D:\Radio
rem has D:\ above it, and that is emphatically not ours to remove.
if /i "%APPROOT%"=="%DEFAULT%" rd /q "%LOCALAPPDATA%\DesksideRadio" 2>nul
if /i "%APPROOT%"=="%DEFAULT%" if not exist "%LOCALAPPDATA%\DesksideRadio\" (
  set "MSG=Removed %LOCALAPPDATA%\DesksideRadio"
  call :ok
)

:done
echo.
echo   Deskside Radio has been uninstalled. Nothing of it is left running
echo   and nothing was written to the registry, so there is nothing else
echo   to tidy up.
echo.
pause

rem The copy in %TEMP% takes itself out on the way past: cmd releases the
rem file once it has read the goto, so the del lands. Only that copy. A
rem script somebody keeps somewhere and runs with a path has to survive
rem being run.
if /i "%~f0"=="%TEMP%\deskside-radio-uninstall.cmd" ((goto) 2>nul & del "%~f0")
exit /b 0

rem ---- saying a thing went right ----------------------------------------
rem Colour through PowerShell's Write-Host rather than ANSI escapes, for
rem the reason the installer gives: a console without virtual-terminal
rem processing turns escapes into visible gibberish.
:ok
"%PS%" -NoProfile -ExecutionPolicy Bypass -Command ^
  "Write-Host '  ' -NoNewline;" ^
  "Write-Host '[OK]' -ForegroundColor Green -NoNewline;" ^
  "Write-Host ('  ' + $env:MSG)"
exit /b 0

rem ---- the ways it can go wrong -----------------------------------------

:notemp
echo.
echo   Could not copy this script to "%TEMP%", which it needs to do before
echo   it can remove the folder it is sitting in.
echo.
echo   Run it from somewhere else instead, naming the folder:
echo.
echo     "Win - Uninstall Deskside Radio.cmd" "%APPROOT%"
echo.
pause
exit /b 1

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
