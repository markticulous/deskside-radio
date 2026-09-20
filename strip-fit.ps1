param(
    # Optional. Where to write a record of what this saw and did. Left unset,
    # which is how the launcher runs it, nothing is written anywhere. Given a
    # path, every window it sees and every resize it attempts is noted, which
    # is the only way to tell "it never found the window" apart from "it found
    # the window and Windows refused".
    [string]$LogPath
)

# Deskside Radio -- sizes the floating strip.
#
# Why this exists at all.
#
# The radio can float a compact strip above every other window, using the
# browser's picture-in-picture window. It cannot decide how big that window
# is. Measured, on a profile with nothing remembered so there was nothing for
# Chrome to restore: 440x150 asked for, 440x240 asked for, 600x400 asked for,
# and 1119x700 granted every time -- which is simply Chrome's default for this
# display. preferInitialWindowPlacement makes no difference. Shrinking the
# window it opens from makes no difference either: 440x150 at the moment of
# the request, 1119x700 granted.
#
# The window can be resized afterwards, by the page, with resizeTo -- but that
# needs a live user activation and requestWindow has already spent the one
# that opened it. So the page cannot do it until the listener clicks something,
# and being asked to click your own floating window to make it the right size
# is not a feature.
#
# From out here there is no such rule. This finds that window and sets its
# size, once, and then leaves it alone.
#
# It is Windows only. On macOS and Linux the strip opens at the browser's
# default size and the first click on it snaps it down.

$ErrorActionPreference = 'Stop'

# How the radio's windows are known: the title ends this way, because the
# station name is on the front.
#
# Both of them end this way. Windows captions the picture-in-picture window
# with the OPENER's title, not with the title of the document inside it --
# measured, by naming that document separately and watching both windows still
# enumerate as "KISS 92.5 - Deskside Radio". So the title alone cannot tell
# them apart, and the thing that can is below.
$RADIO_TAIL = 'Deskside Radio'

# WS_EX_TOPMOST. The strip is the one that floats; the radio's own window does
# not. This is a fact about what the window is rather than what it is called,
# which is why it works where the title did not.
$WS_EX_TOPMOST = 0x00000008
$GWL_EXSTYLE = -20

# The grip and the maximise box, taken off so the strip cannot be dragged to
# some other size. The launcher does the same to the radio's own window -- see
# DsWin.Lock in "Win - Open Deskside Radio.cmd" -- and for the same reason:
# the layout is built for one size, and a window that can be pulled about is a
# window that will be.
#
# Windows only, like the rest of this. Elsewhere the strip stays resizable,
# which is no bad thing while the click-to-shrink is the only way to size it.
$GWL_STYLE = -16
$WS_THICKFRAME = 0x00040000
$WS_MAXIMIZEBOX = 0x00010000

# The strip: the 340x88 the page is built for, plus the frame that window
# carries -- 14 across and 41 down, measured by asking for 440x150 and reading
# back 426x109 inside. That frame is Chrome's origin bar, which the radio's own
# window has not got.
#
# In device pixels, and deliberately not scaled by the monitor's DPI.
#
# A picture-in-picture window is rendered unscaled: one CSS pixel in there is
# one device pixel, whatever the display is set to. Measured -- the page asked
# for 354x129 and Windows reported the window as 355x129 device pixels on a
# 144 DPI monitor, where a scaled window would have come back 531x194. Which
# is exactly what this script used to set, by multiplying by the scale, and
# exactly how much too big the strip was.
#
# GetDpiForWindow still says 144 for that window. It is reporting the monitor,
# not how Chrome draws into it.
$WANT_W = 340 + 14
$WANT_H = 88 + 41

# Nothing runs for ever. The radio going away ends this in well under a
# second; this is the backstop for the case where that check never fires.
$MAX_MINUTES = 720

# One at a time. The launcher starts this with the radio, and a radio opened
# twice -- or opened, closed and opened again before this noticed -- would
# otherwise leave watchers stacked up, all of them polling.
#
# It waits a few seconds for its turn rather than giving up at once. Closing
# the radio and opening it again straight away starts this while the previous
# one is still noticing the radio has gone: giving up immediately meant the new
# one stood down, the old one then exited, and the next pin had no watcher at
# all.
$mutex = New-Object System.Threading.Mutex($false, 'Local\DesksideRadioStripFit')
$mine = $false
try { $mine = $mutex.WaitOne(4000) } catch [System.Threading.AbandonedMutexException] { $mine = $true }
if (-not $mine) { return }

function Note([string]$m) {
    if (-not $LogPath) { return }
    try {
        $line = '{0:HH:mm:ss.fff}  {1}' -f (Get-Date), $m
        Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
    } catch { }
}

Note "started; looking for a topmost window whose title ends '$RADIO_TAIL'"

Add-Type -Namespace DsFit -Name Win -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool EnumWindows(EnumProc cb, System.IntPtr p);
public delegate bool EnumProc(System.IntPtr h, System.IntPtr p);

[System.Runtime.InteropServices.DllImport("user32.dll", CharSet=System.Runtime.InteropServices.CharSet.Unicode)]
public static extern int GetWindowTextW(System.IntPtr h, System.Text.StringBuilder s, int n);

[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool IsWindowVisible(System.IntPtr h);

[System.Runtime.InteropServices.DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")]
public static extern System.IntPtr GetWindowLongPtr(System.IntPtr h, int i);

[System.Runtime.InteropServices.DllImport("user32.dll", EntryPoint="SetWindowLongPtrW")]
public static extern System.IntPtr SetWindowLongPtr(System.IntPtr h, int i, System.IntPtr v);

[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool SetWindowPos(System.IntPtr h, System.IntPtr after, int x, int y, int w, int t, uint flags);

[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool GetWindowRect(System.IntPtr h, out RECT r);

// Per-window, not per-system: the strip can be dragged to a second screen at
// a different scaling, and 440 css pixels is a different number of real ones
// there. Windows 10 1607 and later; if it is missing the fallback is 96.
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern int GetDpiForWindow(System.IntPtr h);

[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern System.IntPtr MonitorFromWindow(System.IntPtr h, uint flags);

[System.Runtime.InteropServices.DllImport("user32.dll", CharSet=System.Runtime.InteropServices.CharSet.Unicode)]
public static extern bool GetMonitorInfoW(System.IntPtr m, ref MONITORINFO mi);

public struct RECT { public int L, T, R, B; }
public struct MONITORINFO {
    public int Size;
    public RECT Monitor;
    public RECT Work;
    public uint Flags;
}
'@

# SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED. Size and position, but
# never the stacking; the frame flag is there because the resize grip is taken
# off in the same breath and the frame has to be redrawn for that to show.
#
# nudging the z-order of an always-on-top window drops it behind the things it
# exists to sit above.
#
# It has to move as well as resize. Chrome puts this window in the corner of
# the screen and, once it is the size we want rather than the size Chrome
# chose, that corner leaves it hanging off both edges. So it is pulled back
# into the monitor's work area -- the monitor it is already on, and no further
# than it has to come, so the corner Chrome picked is still respected.
$SWP = 0x0004 -bor 0x0010 -bor 0x0020

# How far inside the work area to keep it, in CSS pixels, scaled per monitor.
$EDGE = 16

function Get-RadioWindows {
    $found = New-Object System.Collections.ArrayList
    $script:found = $found
    $cb = [DsFit.Win+EnumProc] {
        param($h, $p)
        if ([DsFit.Win]::IsWindowVisible($h)) {
            $sb = New-Object System.Text.StringBuilder 512
            [void][DsFit.Win]::GetWindowTextW($h, $sb, 512)
            $t = $sb.ToString()
            if ($t -and $t.EndsWith($script:tail)) {
                $ex = [DsFit.Win]::GetWindowLongPtr($h, $script:gwl).ToInt64()
                $r = New-Object DsFit.Win+RECT
                [void][DsFit.Win]::GetWindowRect($h, [ref]$r)
                [void]$script:found.Add([pscustomobject]@{
                    H       = $h
                    Title   = $t
                    Topmost = (($ex -band $script:topmost) -ne 0)
                    X       = $r.L
                    Y       = $r.T
                    W       = $r.R - $r.L
                    T       = $r.B - $r.T
                })
            }
        }
        return $true
    }
    [void][DsFit.Win]::EnumWindows($cb, [System.IntPtr]::Zero)
    return $found
}

$script:tail = $RADIO_TAIL
$script:gwl = $GWL_EXSTYLE
$script:topmost = $WS_EX_TOPMOST

# Every strip this has already sized, so a window is sized once and then left
# alone -- after that it is the listener's, and putting it back every time they
# resized it would be a fault rather than a feature.
#
# Forgotten as soon as the window goes, though, which matters more than it
# sounds: unpinning and pinning again gets the same window handle back from
# Chrome, so remembering for ever meant the second pin was skipped and the
# strip came up at Chrome's size with no way back but a click.
$done = New-Object System.Collections.Generic.HashSet[System.IntPtr]
$until = (Get-Date).AddMinutes($MAX_MINUTES)
$sawRadio = $false
$lastSeen = ''

while ($true) {
    if ((Get-Date) -gt $until) { Note "twelve hours; stopping"; break }

    $wins = Get-RadioWindows

    if ($LogPath) {
        $now = ($wins | ForEach-Object { "$($_.Title) [$(if ($_.Topmost) {'TOPMOST'} else {'normal'})] $($_.W)x$($_.T)" }) -join ' ;; '
        if ($now -ne $lastSeen) { Note "seen: $now"; $lastSeen = $now }
    }

    # Forget any window that has gone. Chrome hands back the same handle for
    # the next strip, so without this the second pin of a session is taken for
    # one already dealt with.
    if ($done.Count) {
        $live = New-Object System.Collections.Generic.HashSet[System.IntPtr]
        foreach ($w in $wins) { [void]$live.Add($w.H) }
        foreach ($h in @($done)) {
            if (-not $live.Contains($h)) { [void]$done.Remove($h); Note "strip closed; will size the next one" }
        }
    }

    # The radio's own window is the one that does not float. Until it has been
    # seen once this is still starting up and its absence means nothing; after
    # that, its absence means the app has been closed.
    if ($wins | Where-Object { -not $_.Topmost }) { $sawRadio = $true }
    elseif ($sawRadio) { Note "the radio has gone; stopping"; break }

    foreach ($w in ($wins | Where-Object { $_.Topmost })) {
        if ($done.Contains($w.H)) { continue }

        # Kept for the log only. See the note on WANT_W: this window is drawn
        # unscaled, so the DPI is not a factor in its size.
        $dpi = 96
        try { $dpi = [DsFit.Win]::GetDpiForWindow($w.H) } catch { }
        if ($dpi -le 0) { $dpi = 96 }

        $pxW = $WANT_W
        $pxH = $WANT_H

        # Where it should sit: where Chrome put it, pulled back inside the work
        # area of the monitor it is already on. MONITOR_DEFAULTTONEAREST.
        $x = $w.X
        $y = $w.Y
        $mi = New-Object DsFit.Win+MONITORINFO
        $mi.Size = [System.Runtime.InteropServices.Marshal]::SizeOf($mi)
        $mon = [DsFit.Win]::MonitorFromWindow($w.H, 2)
        if ($mon -ne [System.IntPtr]::Zero -and [DsFit.Win]::GetMonitorInfoW($mon, [ref]$mi)) {
            $pad = $EDGE
            $maxX = $mi.Work.R - $pxW - $pad
            $maxY = $mi.Work.B - $pxH - $pad
            if ($x -gt $maxX) { $x = $maxX }
            if ($y -gt $maxY) { $y = $maxY }
            if ($x -lt ($mi.Work.L + $pad)) { $x = $mi.Work.L + $pad }
            if ($y -lt ($mi.Work.T + $pad)) { $y = $mi.Work.T + $pad }
        }

        # The grip off, before the move, so the one SetWindowPos below can
        # carry SWP_FRAMECHANGED and the new frame is drawn once.
        $st = [DsFit.Win]::GetWindowLongPtr($w.H, $GWL_STYLE).ToInt64()
        $locked = $st -band -bnot ($WS_THICKFRAME -bor $WS_MAXIMIZEBOX)
        if ($locked -ne $st) {
            [void][DsFit.Win]::SetWindowLongPtr($w.H, $GWL_STYLE, [System.IntPtr]$locked)
        }

        $ok = [DsFit.Win]::SetWindowPos($w.H, [System.IntPtr]::Zero, $x, $y, $pxW, $pxH, $SWP)
        Note "strip found at $($w.W)x$($w.T) @ $($w.X),$($w.Y); dpi $dpi; asked for ${pxW}x${pxH} @ ${x},${y}; grip off -> $ok"
        if ($ok) { [void]$done.Add($w.H) }
    }

    Start-Sleep -Milliseconds 200
}
