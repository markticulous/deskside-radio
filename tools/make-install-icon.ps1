# Builds assets\favicon-install.ico, the icon of the "Deskside Radio - Update"
# shortcut: the dial icon with an install badge top-left, made the way
# assets\shortcut-icon.ps1 makes the browser badges -- every frame of the
# dial icon, the same thin dark disc at the same 42% -- so it sits beside
# them as one of the family. Where a browser badge carries the browser's
# logo, this one carries an arrow into a tray, white on the radio's orange.
#
# Run by hand when the dial artwork changes; the icon it writes is
# committed and ships like the theme icons.
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\make-install-icon.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assets = Join-Path (Split-Path -Parent $PSScriptRoot) 'assets'
$base = Join-Path $assets 'favicon-dial.ico'
$out = Join-Path $assets 'favicon-install.ico'

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
    $ms = New-Object IO.MemoryStream; $bw = New-Object IO.BinaryWriter $ms
    $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]1)
    $bw.Write($ico, $o, 12); $bw.Write([int]22); $bw.Write($bytes); $bw.Flush(); $ms.Position = 0
    $img = (New-Object Drawing.Icon $ms, $s, $s).ToBitmap()
  }
  $bmp = New-Object Drawing.Bitmap $s, $s, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
  $g.DrawImage($img, 0, 0, $s, $s)

  # The browser badge's geometry, exactly: see shortcut-icon.ps1.
  $bs = [Math]::Max(7, [int][Math]::Round($s * 0.42))
  $ring = [Math]::Max(1, [int][Math]::Round($s * 0.02))
  $pad = [int][Math]::Floor($s * 0.02)
  $disc = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(235, 22, 23, 26))
  $g.FillEllipse($disc, $pad, $pad, $bs + 2 * $ring, $bs + 2 * $ring)
  # Where the logo would go: an orange face, and the symbol on it.
  $face = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(255, 240, 122, 28))
  $g.FillEllipse($face, $pad + $ring, $pad + $ring, $bs, $bs)

  # Drawn on the same 42-unit face as the preview (previews\installer-badges.html,
  # option A), centred on the face's centre and scaled to it.
  $k = $bs / 42.0
  $cx = $pad + $ring + $bs / 2.0; $cy = $cx
  $P = { param($x, $y) New-Object Drawing.PointF ([float]($cx + ($x - 25) * $k)), ([float]($cy + ($y - 25) * $k)) }
  $pen = New-Object Drawing.Pen ([Drawing.Color]::White), ([float][Math]::Max(1.0, 3.6 * $k))
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
  $g.DrawLine($pen, (& $P 25 13.5), (& $P 25 28.5))
  $g.DrawLines($pen, [Drawing.PointF[]]@((& $P 18.5 22.5), (& $P 25 29), (& $P 31.5 22.5)))
  $g.DrawLines($pen, [Drawing.PointF[]]@((& $P 15.5 29.5), (& $P 15.5 34.5), (& $P 34.5 34.5), (& $P 34.5 29.5)))
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
'wrote ' + $out + ' (' + $frames.Count + ' frames: ' + (($frames | ForEach-Object { $_.Size }) -join ', ') + ')'
