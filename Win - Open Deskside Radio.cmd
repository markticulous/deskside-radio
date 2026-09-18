@echo off
setlocal
rem ---------------------------------------------------------------------
rem  Deskside Radio - open it, and take the resize grip off the window
rem
rem  The Desktop shortcut and the Startup entry point here rather than
rem  straight at the browser, for one reason: a window cannot be made
rem  non-resizable from inside the page. There is no web API for it, and
rem  there is no Chrome switch for it either. The only way is to change the
rem  window's style after Windows has created it, which needs something of
rem  ours running at launch -- and a shortcut aimed at chrome.exe leaves
rem  nothing of ours running at all.
rem
rem  So this starts the browser, waits for the window to appear, and clears
rem  WS_THICKFRAME and WS_MAXIMIZEBOX. That stops the edges being dragged,
rem  the window being maximised, and Win+Arrow snapping it about. The radio
rem  can still size its own window -- SetWindowPos is not affected by the
rem  style, which was measured before any of this was written -- and it
rem  needs to, because the themes are not the same height.
rem
rem  Nothing is installed and nothing is left running. This exits as soon
rem  as the style is set, or after a minute if no window ever turns up.
rem
rem  A minute, and not the ten seconds this first had. At sign-in nothing is
rem  warm -- not the disk, not the browser, not the .NET that compiles the
rem  helper below -- and the radio has been measured taking over a minute to
rem  appear after a reboot on a machine where it opens at once by hand. A
rem  window that turns up after the wait has run out is left resizable and
rem  nothing says so, which is the worst outcome available here; the cost of
rem  waiting longer is a minimised console sitting idle in the cases where
rem  the radio never opens at all.
rem
rem  Argument 1 is the browser to use, baked into the shortcut by
rem  "Win - Create Desktop Shortcut (Chrome).cmd" so that the browser
rem  detection stays in one place. With no argument the page is opened with
rem  whatever the default browser is, unwindowed and unlocked, which is the
rem  same fallback that script has always had.
rem ---------------------------------------------------------------------

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "APPDIR=%~dp0"
set "TARGET=%APPDIR%index.html"
set "PROFILE=%LOCALAPPDATA%\DesksideRadio\profile"
set "BROWSER=%~1"

if not exist "%TARGET%" (
  echo.
  echo   Could not find index.html next to this script.
  echo   Keep this file in the Deskside Radio folder.
  echo.
  pause
  exit /b 1
)

rem No browser named: open it the ordinary way and leave the window alone.
if not defined BROWSER (
  start "" "%TARGET%"
  exit /b 0
)

rem One PowerShell call does the lot, because it is the only thing here
rem that can build a file:// URL, wait on a window and call into user32.
rem Every quote is [char]34: a literal one would close the -Command string
rem cmd is holding open.
"%PS%" -NoProfile -ExecutionPolicy Bypass -Command ^
  "$q = [char]34;" ^
  "$u = $q + 'user32.dll' + $q;" ^
  "$url = ([Uri]$env:TARGET).AbsoluteUri;" ^
  "$flags = '--app=' + $q + $url + $q +" ^
  "  ' --autoplay-policy=no-user-gesture-required' +" ^
  "  ' --window-size=1133,741' +" ^
  "  ' --user-data-dir=' + $q + $env:PROFILE + $q +" ^
  "  ' --no-first-run --no-default-browser-check';" ^
  "Start-Process -FilePath $env:BROWSER -ArgumentList $flags;" ^
  "$cs = @(" ^
  "  'using System; using System.Text; using System.Collections.Generic;'," ^
  "  'using System.Runtime.InteropServices;'," ^
  "  'public class DsWin {'," ^
  "  '  public delegate bool Cb(IntPtr h, IntPtr l);'," ^
  "  '  [DllImport(' + $u + ')] static extern bool EnumWindows(Cb cb, IntPtr l);'," ^
  "  '  [DllImport(' + $u + ')] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);'," ^
  "  '  [DllImport(' + $u + ')] static extern bool IsWindowVisible(IntPtr h);'," ^
  "  '  [DllImport(' + $u + ')] static extern int GetWindowLong(IntPtr h, int i);'," ^
  "  '  [DllImport(' + $u + ')] static extern int SetWindowLong(IntPtr h, int i, int v);'," ^
  "  '  [DllImport(' + $u + ')] static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);'," ^
  "  '  public static int Lock(string tail) {'," ^
  "  '    int n = 0;'," ^
  "  '    EnumWindows(delegate (IntPtr h, IntPtr l) {'," ^
  "  '      if (!IsWindowVisible(h)) return true;'," ^
  "  '      StringBuilder sb = new StringBuilder(512);'," ^
  "  '      GetWindowText(h, sb, 512);'," ^
  "  '      if (!sb.ToString().EndsWith(tail)) return true;'," ^
  "  '      int s = GetWindowLong(h, -16);'," ^
  "  '      if ((s & 0x40000) == 0) return true;'," ^
  "  '      SetWindowLong(h, -16, s & ~0x40000 & ~0x10000);'," ^
  "  '      SetWindowPos(h, IntPtr.Zero, 0, 0, 0, 0, 0x0002 | 0x0001 | 0x0004 | 0x0020);'," ^
  "  '      n++;'," ^
  "  '      return true;'," ^
  "  '    }, IntPtr.Zero);'," ^
  "  '    return n;'," ^
  "  '  }'," ^
  "  '}'" ^
  ") -join [Environment]::NewLine;" ^
  "Add-Type -TypeDefinition $cs;" ^
  "foreach ($try in 1..120) {" ^
  "  Start-Sleep -Milliseconds 500;" ^
  "  if ([DsWin]::Lock('Deskside Radio') -gt 0) { break }" ^
  "}"

exit /b 0
