param(
    # Optional. Where to write a record of what this saw and did. Left unset,
    # which is how the launcher runs it, nothing is written anywhere. Given a
    # path, every window it sees and every resize it attempts is noted, which
    # is the only way to tell "it never found the window" apart from "it found
    # the window and Windows refused".
    [string]$LogPath,

    # Firefox. Set by the launcher's Firefox branch. Firefox will not let the
    # page move or size its own window, so on pin this moves the big window
    # off the screen instead and puts it back on unpin -- and leaves the float's
    # size alone, since Firefox draws an address bar in it that Chrome's
    # numbers would crop.
    [switch]$Firefox
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
# One slot per browser family, not one in all. With a single slot a Firefox
# radio's watcher held it, Chrome's quit, and the Firefox one then treated
# Chrome's windows as Firefox's -- which broke Chrome's pin and unpin.
$slot = 'Local\DesksideRadioStripFit'
if ($Firefox) { $slot = 'Local\DesksideRadioStripFitFirefox' }
$mutex = New-Object System.Threading.Mutex($false, $slot)
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

# ---------------------------------------------------------------------------
# Now playing, for the stations the page cannot ask itself.
#
# Most streams carry the song's title -- a line of text spliced into the
# audio every few seconds -- but a page cannot get at it: asking needs a
# request header the stream servers will not clear for a page, so the
# browser refuses before anything is sent. Out here there is no such rule.
#
# So this answers the radio, on this machine only, about one station at a
# time and only when asked. Asked, it takes a sip: connects to the station
# asking for the titles, reads to the first one -- about 16 KB, a second of
# audio, measured on two stations -- and hangs up. A second stream held open
# would cost the station's whole data rate again for as long as it played;
# a sip a minute is about a fiftieth of that. Nothing is fetched when the
# radio is not asking, which is whenever it is stopped, closed or playing a
# station it can look up for itself.
#
# It runs on a thread of its own inside this script, which is already
# running for as long as the radio is, so it costs no process of its own
# and cannot hold up the strip sizing below while a station is slow.
#
# Only the radio can use it. Each start picks a fresh random key and writes
# it, with the port, to assets/now-playing.js beside the page, where the
# page reads it the way it reads the launcher's other notes. A request
# without that key gets nothing, so a web page in the same browser cannot
# have this fetch addresses for it. It listens on the loopback address
# only, never the network.
#
# One for the machine, not one per browser family: the first watcher to
# start provides it, and a second radio in another browser shares it.
$npSlot = New-Object System.Threading.Mutex($false, 'Local\DesksideRadioNowPlaying')
$npMine = $false
try { $npMine = $npSlot.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $npMine = $true }
if ($npMine) {
    $npRun = [runspacefactory]::CreateRunspace()
    $npRun.Open()
    $npPs = [PowerShell]::Create()
    $npPs.Runspace = $npRun
    [void]$npPs.AddScript({
        param([string]$KeyFile)
        $key = -join ((1..24) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
        $listener = $null
        foreach ($port in 47811..47830) {
            try {
                $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
                $listener.Start()
                break
            } catch { $listener = $null }
        }
        if (-not $listener) { return }
        try {
            Set-Content -LiteralPath $KeyFile -Encoding ASCII -Value ("window.DESKSIDE_NOW_PLAYING = { port: $port, key: '$key' };")
        } catch { $listener.Stop(); return }

        # A sip: to the first real title, past any ad marker, then hang up.
        # At most four title blocks -- a station sending only ads and blanks
        # costs 64 KB and gets nothing -- and eight seconds.
        function Sip([string]$url) {
            $res = $null
            try {
                $req = [System.Net.HttpWebRequest]::Create($url)
                $req.Headers.Add('Icy-MetaData', '1')
                $req.UserAgent = 'DesksideRadio'
                $req.Timeout = 8000; $req.ReadWriteTimeout = 8000
                $res = $req.GetResponse()
                $mi = [int]$res.Headers['icy-metaint']
                if ($mi -le 0) { return '' }
                $st = $res.GetResponseStream()
                $buf = New-Object byte[] 16384
                for ($b = 0; $b -lt 4; $b++) {
                    $left = $mi
                    while ($left -gt 0) {
                        $r = $st.Read($buf, 0, [Math]::Min($buf.Length, $left))
                        if ($r -le 0) { return '' }
                        $left -= $r
                    }
                    $len = $st.ReadByte() * 16
                    if ($len -le 0) { continue }
                    $m = New-Object byte[] $len
                    $got = 0
                    while ($got -lt $len) {
                        $r = $st.Read($m, $got, $len - $got)
                        if ($r -le 0) { break }
                        $got += $r
                    }
                    $txt = [System.Text.Encoding]::UTF8.GetString($m, 0, $got).TrimEnd([char]0)
                    if ($txt -match "adw_ad='true'") { continue }
                    if ($txt -match "StreamTitle='(.*?)';") {
                        $t = $Matches[1].Trim()
                        if ($t) { return $t }
                    }
                }
                return ''
            } catch { return '' } finally { if ($res) { $res.Close() } }
        }

        $cache = @{}
        while ($true) {
            $client = $null
            try {
                $client = $listener.AcceptTcpClient()
                $client.ReceiveTimeout = 3000
                $io = $client.GetStream()
                $reader = New-Object System.IO.StreamReader($io)
                $line = $reader.ReadLine()
                while ($reader.ReadLine()) { }
                $title = $null
                if ($line -match '^GET /np\?([^ ]*) HTTP') {
                    $q = @{}
                    foreach ($pair in $Matches[1].Split('&')) {
                        $kv = $pair.Split('=', 2)
                        if ($kv.Count -eq 2) { $q[$kv[0]] = [System.Uri]::UnescapeDataString($kv[1].Replace('+', ' ')) }
                    }
                    if ($q['k'] -eq $key -and $q['u'] -match '^https?://') {
                        # Asked again within twenty seconds -- a second radio,
                        # or a page reloaded -- it gets the same answer rather
                        # than another connection.
                        $hit = $cache[$q['u']]
                        if ($hit -and ((Get-Date) - $hit.At).TotalSeconds -lt 20) { $title = $hit.Title }
                        else {
                            $title = Sip $q['u']
                            $cache[$q['u']] = @{ Title = $title; At = Get-Date }
                            if ($cache.Count -gt 20) { $cache.Clear() }
                        }
                    }
                }
                if ($null -eq $title) { $code = '403 Forbidden'; $body = '{}' }
                else {
                    $code = '200 OK'
                    $esc = $title.Replace('\', '\\').Replace('"', '\"')
                    $esc = [regex]::Replace($esc, '[\x00-\x1f]', ' ')
                    $body = '{"title":"' + $esc + '"}'
                }
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
                $head = "HTTP/1.1 $code`r`nContent-Type: application/json; charset=utf-8`r`nAccess-Control-Allow-Origin: *`r`nCache-Control: no-store`r`nConnection: close`r`nContent-Length: " + $bytes.Length + "`r`n`r`n"
                $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
                $io.Write($hb, 0, $hb.Length)
                $io.Write($bytes, 0, $bytes.Length)
                $io.Flush()
            } catch { } finally { if ($client) { $client.Close() } }
        }
    }).AddArgument((Join-Path $PSScriptRoot 'assets\now-playing.js'))
    [void]$npPs.BeginInvoke()
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
public static extern int GetSystemMetrics(int i);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool IsZoomed(System.IntPtr h);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool ShowWindow(System.IntPtr h, int c);

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
            $ex = [DsFit.Win]::GetWindowLongPtr($h, $script:gwl).ToInt64()
            $top = (($ex -band $script:topmost) -ne 0)
            # Some Edge builds caption the float with the page's file path
            # ("File  C:/Users/.../DesksideRadio/app/index.html") rather than
            # the opener's title -- seen on a work PC, where the strip was
            # never found and so never sized. A floating window whose title
            # names the radio's folder is the strip too.
            $isFloat = $top -and $t -and ($t -match $script:pathRe)
            if ($t -and ($t.EndsWith($script:tail) -or $t.EndsWith($script:fxtail) -or $isFloat)) {
                $r = New-Object DsFit.Win+RECT
                [void][DsFit.Win]::GetWindowRect($h, [ref]$r)
                [void]$script:found.Add([pscustomobject]@{
                    H       = $h
                    Title   = $t
                    Topmost = $top
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
# Firefox puts its own name after every title, behind an em dash. Built from
# the code point rather than typed: Windows PowerShell reads a file without a
# byte-order mark as ANSI, and a typed em dash would arrive as three bytes of
# something else and never match.
$script:fxtail = $RADIO_TAIL + ' ' + [char]0x2014 + ' Mozilla Firefox'
$stowed = $null
# The radio's folder as it appears in a file path or URL: the installed
# DesksideRadio, or a copy in a folder named Deskside Radio (%20 in a URL).
$script:pathRe = 'Deskside(Radio| Radio|%20Radio)[\\/]'
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
$goneSince = $null
$lastSeen = ''

while ($true) {
    if ((Get-Date) -gt $until) { Note "twelve hours; stopping"; break }

    $wins = Get-RadioWindows
    # Only this mode's own browser. Firefox names every window with its own
    # suffix and Chrome and Edge do not, so the suffix divides them cleanly.
    $wins = @($wins | Where-Object { $_.Title.EndsWith($script:fxtail) -eq [bool]$Firefox })

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
    #
    # Gone for three seconds together, not for one pass: while the strip opens
    # the radio's window is shrunk and tucked away, and a pass that caught it
    # between states took the radio for closed -- this stopped, and the strip
    # it had been started for came up at the browser's size with "Click here".
    if ($wins | Where-Object { -not $_.Topmost }) { $sawRadio = $true; $goneSince = $null }
    elseif ($sawRadio) {
        if (-not $goneSince) { $goneSince = Get-Date }
        elseif (((Get-Date) - $goneSince).TotalSeconds -ge 3) { Note "the radio has gone; stopping"; break }
    }

    # Firefox: out of the way on pin, back on unpin. The float is the topmost
    # one; the big window is the other. Remembered by handle and rectangle, so
    # it comes back exactly where it was. Past the right-hand edge of the whole
    # virtual screen, not merely behind the float: Firefox will not go narrower
    # than 515px, so tucked behind a 355px float it still showed. Tested there
    # before this was written, and Firefox keeps drawing the page -- which is
    # what paints the float -- so the mini radio's visualiser does not stop.
    # A maximised radio window goes straight back to its own size. Chrome and
    # Edge draw their own maximise button whatever the window style says, so it
    # cannot be removed from outside; this makes it do nothing. The float is
    # left alone -- it is the big window that has a size to keep.
    foreach ($mw in ($wins | Where-Object { -not $_.Topmost })) {
        if ([DsFit.Win]::IsZoomed($mw.H)) {
            [void][DsFit.Win]::ShowWindow($mw.H, 9)
            Note "radio window was maximised; put back"
        }
    }

    if ($Firefox) {
        # The resize lock, on both windows. See the note on this in the Firefox
        # branch of the launcher: whether Firefox honours it is the open question,
        # so each change is logged. Only when the style is still there, so a
        # window that has kept it off costs one read a pass.
        foreach ($fw in $wins) {
            $st = [DsFit.Win]::GetWindowLongPtr($fw.H, $GWL_STYLE).ToInt64()
            $locked = $st -band -bnot ($WS_THICKFRAME -bor $WS_MAXIMIZEBOX)
            if ($locked -ne $st) {
                [void][DsFit.Win]::SetWindowLongPtr($fw.H, $GWL_STYLE, [System.IntPtr]$locked)
                [void][DsFit.Win]::SetWindowPos($fw.H, [System.IntPtr]::Zero, 0, 0, 0, 0, 0x0027)
                $which = 'the radio window'; if ($fw.Topmost) { $which = 'the float' }
                Note ("locked {0}: style {1:X} -> {2:X}" -f $which, $st, $locked)
            }
        }

        $float = $wins | Where-Object { $_.Topmost } | Select-Object -First 1
        $main = $wins | Where-Object { -not $_.Topmost } | Select-Object -First 1
        if ($float -and $main -and -not $stowed) {
            $stowed = [pscustomobject]@{ H = $main.H; X = $main.X; Y = $main.Y; W = $main.W; T = $main.T }
            $vx = [DsFit.Win]::GetSystemMetrics(76); $vy = [DsFit.Win]::GetSystemMetrics(77)
            $vw = [DsFit.Win]::GetSystemMetrics(78)
            $ok = [DsFit.Win]::SetWindowPos($main.H, [System.IntPtr]::Zero, $vx + $vw + 50, $vy + 50, $main.W, $main.T, 0x0014)
            Note "pinned: radio window moved off-screen from $($main.X),$($main.Y) -> $ok"
        } elseif (-not $float -and $stowed) {
            $ok = [DsFit.Win]::SetWindowPos($stowed.H, [System.IntPtr]::Zero, $stowed.X, $stowed.Y, $stowed.W, $stowed.T, 0x0014)
            Note "unpinned: radio window back at $($stowed.X),$($stowed.Y) -> $ok"
            $stowed = $null
        }
        Start-Sleep -Milliseconds 200
        continue
    }

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

# Out, all the way. The now-playing helper's thread is still waiting on its
# socket, and a PowerShell whose script has finished stays running for as
# long as one of its runspaces is busy -- measured. So without this the
# watcher outlived the radio, kept its slot, and the next radio's watcher
# gave up waiting for it: no strip sizing and no song titles for that
# session. Exit takes the helper and its socket down with it.
[Environment]::Exit(0)
