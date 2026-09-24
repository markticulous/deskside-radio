# The icon for a Desktop shortcut: the theme's own icon with the browser's
# logo in the top-left, so three shortcuts on one Desktop can be told apart
# at a glance -- or the plain icon, for anyone who would rather.
#
# The logo is never shipped. It is taken, here and now, from the browser
# installed on this PC and drawn onto our icon on this PC, so nothing of
# Google's, Microsoft's or Mozilla's is in the download. It also means the
# badge is whatever that browser's icon is today. Made once per theme and
# browser into assets\badged, which the updater unpacks over and never
# wipes, and the uninstaller removes with the rest of the app folder.
#
# Called by the three Create Desktop Shortcut scripts with the icon the
# shortcut already had. Run by a person, it does what the arguments say:
# the badge unless "plain" was asked for. Run by the installer, which
# rewrites every shortcut at every update, it keeps what is there -- the
# theme, a plain icon, an icon that is not ours at all -- because a choice
# made in the shortcut's Properties would otherwise be undone at the next
# update. The one exception is a plain icon from before badges existed:
# until a badge has been made for this browser, plain was simply the only
# icon there was, so it is not a choice and the badge goes on.
#
# Returns the icon's location, index and all, and a line saying what it is. Anything that fails
# returns the plain icon: a shortcut without a badge is fine, a shortcut
# without an icon is not.
param(
  [string]$Old = '',
  [string]$Browser = '',
  [string]$Theme = '',
  [switch]$Plain
)

$assets = Join-Path $env:APPDIR 'assets'
$badged = Join-Path $assets 'badged'
$exe = [IO.Path]::GetFileName($Browser).ToLower()
$key = @{ 'chrome.exe' = 'chrome'; 'msedge.exe' = 'edge'; 'firefox.exe' = 'firefox' }[$exe]
$names = @{ chrome = 'Chrome'; edge = 'Edge'; firefox = 'Firefox' }
$byInstaller = [bool]$env:DESKSIDE_NOPAUSE

$oldFile = ($Old -replace ',\s*-?\d+$', '').Trim()
$oldName = if ($oldFile) { [IO.Path]::GetFileNameWithoutExtension($oldFile) } else { '' }
$oldOurs = $oldName -like 'favicon-*'

# Somebody else's icon, chosen in Properties: the installer leaves it be.
if ($byInstaller -and $oldFile -and -not $oldOurs) {
  return [pscustomobject]@{ Location = $Old; Label = 'kept as it was (not one of ours)' }
}

# The theme: asked for, else the one the shortcut had when the installer is
# the one asking, else the dial.
if (-not $Theme -and $byInstaller -and $oldName -match '^favicon-([a-z]+)') {
  if (Test-Path -LiteralPath (Join-Path $assets ('favicon-' + $matches[1] + '.ico'))) { $Theme = $matches[1] }
}
if (-not $Theme -or -not (Test-Path -LiteralPath (Join-Path $assets ('favicon-' + $Theme + '.ico')))) { $Theme = 'dial' }
$base = Join-Path $assets ('favicon-' + $Theme + '.ico')
$plainResult = [pscustomobject]@{ Location = $base + ',0'; Label = $Theme + ', plain' }

if (-not $key) { return $plainResult }
$out = Join-Path $badged ('favicon-' + $Theme + '-' + $key + '.ico')
$madeBefore = [bool](Get-ChildItem -LiteralPath $badged -Filter ('favicon-*-' + $key + '.ico') -ErrorAction SilentlyContinue)

# Built whether or not it is wanted this time, so its being there says this
# browser has been offered a badge -- which is what makes a plain icon seen
# after this a choice rather than a leftover.
if (-not (Test-Path -LiteralPath $out)) {
  try {
    New-Item -ItemType Directory -Force -Path $badged | Out-Null
    Add-Type -AssemblyName System.Drawing
    if (-not ('DsIco' -as [type])) {
      Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class DsIco {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern uint PrivateExtractIcons(string f, int i, int cx, int cy, IntPtr[] h, uint[] id, uint n, uint fl);
  [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr h);
}
'@
    }
    $ico = [IO.File]::ReadAllBytes($base)
    $count = [BitConverter]::ToUInt16($ico, 4)
    $frames = New-Object System.Collections.ArrayList
    foreach ($i in 0..($count - 1)) {
      $o = 6 + 16 * $i
      $s = [int]$ico[$o]; if ($s -eq 0) { $s = 256 }
      $len = [BitConverter]::ToInt32($ico, $o + 8); $at = [BitConverter]::ToInt32($ico, $o + 12)
      $bytes = New-Object byte[] $len; [Array]::Copy($ico, $at, $bytes, 0, $len)
      if ($bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50) {
        $img = [Drawing.Image]::FromStream((New-Object IO.MemoryStream (, $bytes)))
      } else {
        # A bitmap frame: wrapped back into a one-frame .ico for Windows to read.
        $ms = New-Object IO.MemoryStream; $bw = New-Object IO.BinaryWriter $ms
        $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]1)
        $bw.Write($ico, $o, 12); $bw.Write([int]22); $bw.Write($bytes); $bw.Flush(); $ms.Position = 0
        $img = (New-Object Drawing.Icon $ms, $s, $s).ToBitmap()
      }
      $bmp = New-Object Drawing.Bitmap $s, $s, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
      $g = [Drawing.Graphics]::FromImage($bmp)
      $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
      $g.DrawImage($img, 0, 0, $s, $s)

      # 42% of the icon, on a thin dark disc that parts it from the dial's
      # ring and scale. The logo is asked of the browser at the size it is
      # drawn, so Windows picks that icon's own nearest frame.
      $bs = [Math]::Max(7, [int][Math]::Round($s * 0.42))
      $ring = [Math]::Max(1, [int][Math]::Round($s * 0.02))
      $pad = [int][Math]::Floor($s * 0.02)
      $disc = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(235, 22, 23, 26))
      $g.FillEllipse($disc, $pad, $pad, $bs + 2 * $ring, $bs + 2 * $ring)
      $h = New-Object IntPtr[] 1; $id = New-Object UInt32[] 1
      [void][DsIco]::PrivateExtractIcons($Browser, 0, $bs, $bs, $h, $id, 1, 0)
      if ($h[0] -eq [IntPtr]::Zero) { throw 'no icon in the browser' }
      $logo = New-Object Drawing.Bitmap ([Drawing.Icon]::FromHandle($h[0]).ToBitmap())
      [void][DsIco]::DestroyIcon($h[0])
      $g.DrawImage($logo, $pad + $ring, $pad + $ring, $bs, $bs)
      $g.Dispose()

      $png = New-Object IO.MemoryStream
      $bmp.Save($png, [Drawing.Imaging.ImageFormat]::Png)
      [void]$frames.Add(@{ Size = $s; Data = $png.ToArray() })
    }

    # Every frame stored as PNG, which Windows has read in icons since Vista.
    $ms = New-Object IO.MemoryStream; $bw = New-Object IO.BinaryWriter $ms
    $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$frames.Count)
    $offset = 6 + 16 * $frames.Count
    foreach ($f in $frames) {
      $d = if ($f.Size -ge 256) { 0 } else { $f.Size }
      $bw.Write([byte]$d); $bw.Write([byte]$d); $bw.Write([byte]0); $bw.Write([byte]0)
      $bw.Write([uint16]1); $bw.Write([uint16]32)
      $bw.Write([int]$f.Data.Length); $bw.Write([int]$offset)
      $offset += $f.Data.Length
    }
    foreach ($f in $frames) { $bw.Write($f.Data) }
    $bw.Flush()
    [IO.File]::WriteAllBytes($out, $ms.ToArray())
  } catch {
    Remove-Item -LiteralPath $out -Force -ErrorAction SilentlyContinue
    return $plainResult
  }
}

# Plain when asked for; and, when the installer is rewriting, when it was
# plain already and a badge for this browser had been made before -- so it
# was chosen, not left over from before there were badges.
if ($Plain) { return $plainResult }
if ($byInstaller -and $oldOurs -and $oldFile -notmatch '\\badged\\' -and $madeBefore) { return $plainResult }
return [pscustomobject]@{ Location = $out + ',0'; Label = $Theme + ', with the ' + $names[$key] + ' badge' }
