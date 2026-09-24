# ---------------------------------------------------------------------
#  Deskside Radio - trim the browser profile, and point its downloads at
#  the app folder.
#
#  Called by Win-Install-or-Update-Deskside-Radio.cmd, which reads one
#  line off standard output: how much was freed, or nothing at all when
#  there was nothing to free. Everything else it needs to say, it says.
#
#  Two jobs, both to the profile rather than to the app.
#
#  1. The junk. A Chrome profile collects some thirty folders of things
#     fetched in the background -- safe browsing lists, hyphenation
#     dictionaries, captcha providers, on-device suggestion models,
#     optimisation hints for pages that will never be loaded. This radio
#     is a browser showing one local file with no address bar; none of it
#     applies. The launchers now start the browser with the flags that
#     stop them arriving. This removes the ones already there.
#
#     Every name below is something the browser downloaded and can
#     download again. Local Storage, which is where the stations, the
#     schedule and the theme actually live, is not in the list and is
#     never touched -- that is the whole safety argument for deleting
#     anything here, and it is why the list is written out by hand rather
#     than generated from what happens to be in the folder.
#
#  2. The download folder. Export settings writes
#     deskside-radio-settings.js, and that file beside index.html is the
#     only thing the three browser profiles can all see: each keeps its
#     own storage and none can read another's. Landing in Downloads it
#     seeds nothing, which is why settings exported from Chrome never
#     turned up in Edge. Chrome has no command-line flag for it, so it
#     goes into the profile's Preferences.
#
#     Preferences is a large JSON file the browser owns. It is read,
#     amended and written back only if it parses, the previous copy is
#     kept beside it, and any failure leaves the original in place -- the
#     worst case here is the download folder staying where it was.
# ---------------------------------------------------------------------

$ErrorActionPreference = 'SilentlyContinue'

$root = Join-Path $env:LOCALAPPDATA 'DesksideRadio'
$app = $env:APPROOT
if (-not (Test-Path -LiteralPath $root)) { return }

$junk = @(
  'ActorSafetyLists', 'AmountExtractionHeuristicRegexes', 'AutofillStates',
  'CaptchaProviders', 'CertificateRevocation', 'component_crx_cache',
  'Crashpad', 'Crowd Deny', 'extensions_crx_cache', 'FileTypePolicies',
  'FirstPartySetsPreloaded', 'hyphen-data', 'MEIPreload',
  'OnDeviceHeadSuggestModel', 'optimization_guide_model_store',
  'OptimizationGuideModelsManifest', 'OptimizationHints', 'OriginTrials',
  'PKIMetadata', 'PrivacySandboxAttestationsPreloaded', 'RecoveryImproved',
  'Safe Browsing', 'SafetyTips', 'segmentation_platform', 'Snapshots',
  'SSLErrorAssistant', 'Subresource Filter', 'TrustTokenKeyCommitments',
  'WasmTtsEngine', 'WidevineCdm', 'ZxcvbnData'
)

$freed = 0

# A profile whose browser is open is left alone: this is called by the
# installer, and the radio can be playing through an update. Matched on the
# profile's own folder name in the browser's command line.
# One process list for every check. Each costs about 200 ms, and asking
# once per profile was most of the trim's time at launch.
$procLines = @(Get-CimInstance Win32_Process | ForEach-Object { $_.CommandLine } | Where-Object { $_ })
function Running([string]$name) {
  [bool]($script:procLines | Where-Object { $_.Contains($name) })
}

function Drop([string]$target) {
  if (-not (Test-Path -LiteralPath $target)) { return }
  $size = (Get-ChildItem -LiteralPath $target -Recurse -Force -File | Measure-Object -Property Length -Sum).Sum
  Remove-Item -LiteralPath $target -Recurse -Force
  if (-not (Test-Path -LiteralPath $target)) { $script:freed += [double]$size }
}

foreach ($name in @('profile-chrome', 'profile-edge')) {
  $dir = Join-Path $root $name
  if (-not (Test-Path -LiteralPath $dir)) { continue }
  if (Running $name) { continue }
  # Extensions nothing of ours installed. The launcher starts these profiles
  # with --disable-extensions, so they would never load; PDF tools register
  # with every Chrome profile on the machine, and this one had 20 MB of them.
  Drop (Join-Path $dir 'Default\Extensions')

  # What piles up. Service Worker data is all from browser pages -- a file://
  # page cannot register a worker -- and was 22.6 MB in Edge after one visit
  # to its settings. The metrics files are Edge's, 4 MB apiece and
  # accumulating. The cache is capped at 16 MB by the launch flags and was
  # found at 26, so past the cap it goes, and grows back only to the cap.
  # Shader caches are not here: they are rebuilt at every launch, so clearing
  # them frees nothing that lasts and slows the next start.
  Drop (Join-Path $dir 'Default\Service Worker')
  Drop (Join-Path $dir 'BrowserMetrics')
  Drop (Join-Path $dir 'BrowserMetrics-spare.pma')
  $cache = Join-Path $dir 'Default\Cache'
  if (Test-Path -LiteralPath $cache) {
    $held = (Get-ChildItem -LiteralPath $cache -Recurse -Force -File | Measure-Object -Property Length -Sum).Sum
    if ($held -gt 16MB) { Drop $cache; Drop (Join-Path $dir 'Default\Code Cache') }
  }

  foreach ($j in $junk) {
    $target = Join-Path $dir $j
    if (-not (Test-Path -LiteralPath $target)) { continue }
    $size = (Get-ChildItem -LiteralPath $target -Recurse -Force -File |
      Measure-Object -Property Length -Sum).Sum
    Remove-Item -LiteralPath $target -Recurse -Force
    # Only counted if it actually went. A profile whose browser is still
    # running keeps its files, and saying otherwise would be a lie told
    # in kilobytes.
    if (-not (Test-Path -LiteralPath $target)) { $freed += [double]$size }
  }

  if (-not $app) { continue }
  $default = Join-Path $dir 'Default'
  $prefs = Join-Path $default 'Preferences'

  if (Test-Path -LiteralPath $prefs) {
    try {
      $o = Get-Content -LiteralPath $prefs -Raw | ConvertFrom-Json
      if (-not $o.download) {
        $o | Add-Member -NotePropertyName download -NotePropertyValue (New-Object PSObject) -Force
      }
      $o.download | Add-Member -NotePropertyName default_directory -NotePropertyValue $app -Force
      $o.download | Add-Member -NotePropertyName prompt_for_download -NotePropertyValue $false -Force
      if (-not $o.savefile) {
        $o | Add-Member -NotePropertyName savefile -NotePropertyValue (New-Object PSObject) -Force
      }
      $o.savefile | Add-Member -NotePropertyName default_directory -NotePropertyValue $app -Force
      # Dark: the browser's own Appearance setting, found by choosing it in
      # Edge's settings and comparing the file. Chromium's key, so Chrome
      # reads it too. It darkens menus, dialogs and settings; the title bar
      # follows Windows' accent-colour setting, which this cannot touch.
      if (-not $o.browser) {
        $o | Add-Member -NotePropertyName browser -NotePropertyValue (New-Object PSObject) -Force
      }
      if (-not $o.browser.theme) {
        $o.browser | Add-Member -NotePropertyName theme -NotePropertyValue (New-Object PSObject) -Force
      }
      $o.browser.theme | Add-Member -NotePropertyName color_scheme2 -NotePropertyValue 2 -Force
      # Depth well past anything Chrome nests, because the default of 2
      # would quietly flatten most of this file into strings.
      $json = $o | ConvertTo-Json -Depth 100 -Compress
      if ($json -and $json.Length -gt 100) {
        Copy-Item -LiteralPath $prefs -Destination ($prefs + '.dsr-bak') -Force
        Set-Content -LiteralPath $prefs -Value $json -Encoding UTF8
      }
    } catch { }
  } else {
    New-Item -ItemType Directory -Path $default -Force | Out-Null
    $fresh = @{
      download = @{ default_directory = $app; prompt_for_download = $false }
      savefile = @{ default_directory = $app }
      browser = @{ theme = @{ color_scheme2 = 2 } }
    } | ConvertTo-Json -Depth 4
    Set-Content -LiteralPath $prefs -Value $fresh -Encoding ASCII
  }
}

# Firefox, which was never trimmed at all and was the largest by far. Named
# folders only, all of them caches or things the radio does not use: never
# 'storage', which is where Firefox keeps the stations and settings.
$fx = Join-Path $root 'profile-firefox'
if ((Test-Path -LiteralPath $fx) -and -not (Running 'profile-firefox')) {
  foreach ($j in @('cache2', 'startupCache', 'gmp-widevinecdm', 'crashes', 'minidumps',
                   'datareporting', 'saved-telemetry-pings', 'shader-cache')) {
    Drop (Join-Path $fx $j)
  }
}

if ($freed -ge 1MB) { '{0:N1} MB freed' -f ($freed / 1MB) }
elseif ($freed -gt 0) { '{0:N0} KB freed' -f ($freed / 1KB) }
