# Run by the launcher before the browser starts, at the top of the same
# PowerShell that starts it. Three things the page cannot find out, or the
# browser must not be running for.
#
# Its own PowerShell launch until 1.5.10, and that start-up -- about 180 ms,
# measured -- sat between every double-click and the radio. Before the
# browser still: the page reads what this writes while it loads, and the
# trim can only reach a profile nothing has open. A file rather than the
# thirty caret-joined fragments of -Command it was, which cmd re-parsed
# whenever anything tried to move them.
#
# Once a day, the profile trim. The installer trims too, but skips a
# profile whose browser is open -- and the ordinary update runs in the
# background while the radio plays, so the profile in use was skipped on the
# runs that happen most. Here, before the browser starts, is the one moment
# nothing has it open. The stamp is in the app folder, which an uninstall
# removes whole; in the data folder it would stop the uninstaller removing
# that folder, which it does only when empty.
#
# Whether a shortcut is on the Desktop. The page has a button offering to
# make one, and no way on earth to find out whether it is needed. A page
# opened from a disk cannot look at the disk. It can load a script, though
# -- the same door the settings seed and the version probe come through --
# so the answer is left where it can read it. Absent or unreadable means
# show the button. Never hide on not knowing: a listener whose shortcut is
# gone needs that button more than anyone, and the same rule is what leaves
# macOS and Linux exactly as they were, since nothing of ours runs at
# launch there to write this at all. "Deskside Radio*.lnk" covers the Edge
# and Firefox ones, which carry the browser in brackets.
#
# Whether the radio starts with Windows, in a file of its own. This one
# changes precisely because somebody asked it to, from the switch in
# Settings, and the on-off script rewrites it when they do. Unlike the
# Desktop shortcut it is asked for by its exact name: the Startup entry is
# written by one script and always called "Deskside Radio.lnk", so a
# wildcard here would only let somebody else's shortcut answer for ours.
#
# Every part is inside the try: nothing here may keep the radio from opening.

try {
  $tp = Join-Path $env:APPROOT 'assets\trim-profile.ps1'
  $stamp = Join-Path $env:APPROOT 'assets\trimmed.stamp'
  if ((Test-Path -LiteralPath $tp) -and ((-not (Test-Path -LiteralPath $stamp)) -or
      ((Get-Item -LiteralPath $stamp).LastWriteTime -lt (Get-Date).AddHours(-20)))) {
    try { & $tp | Out-Null } catch { }
    Set-Content -LiteralPath $stamp -Value (Get-Date).ToString('s')
  }

  $d = [Environment]::GetFolderPath('Desktop')
  $has = $false
  if ($d -and (Test-Path -LiteralPath $d)) {
    $found = @(Get-ChildItem -LiteralPath $d -Filter 'Deskside Radio*.lnk' -ErrorAction SilentlyContinue)
    $has = ($found.Count -gt 0)
  }
  $sf = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
  $boot = $false
  if (Test-Path -LiteralPath $sf) {
    $boot = (Test-Path -LiteralPath (Join-Path $sf 'Deskside Radio.lnk'))
  }

  $out = Join-Path $env:APPROOT 'assets'
  if (Test-Path -LiteralPath $out) {
    $nl = [Environment]::NewLine
    $line = '/* Written by the launcher at each start. Whether a shortcut for' + $nl +
      '   this radio is on the Desktop right now. */' + $nl +
      'window.DESKSIDE_HAS_SHORTCUT = ' + $has.ToString().ToLower() + ';' + $nl
    Set-Content -LiteralPath (Join-Path $out 'shortcut.js') -Value $line -Encoding ASCII -NoNewline
    $line2 = '/* Written whenever the start-up entry is changed,' + $nl +
      '   and at every launch. Whether this radio is set to' + $nl +
      '   open when you sign in. */' + $nl +
      'window.DESKSIDE_STARTS_WITH_WINDOWS = ' + $boot.ToString().ToLower() + ';' + $nl
    Set-Content -LiteralPath (Join-Path $out 'startup.js') -Value $line2 -Encoding ASCII -NoNewline
  }
} catch { }
