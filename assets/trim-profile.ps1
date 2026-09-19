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

foreach ($name in @('profile-chrome', 'profile-edge')) {
  $dir = Join-Path $root $name
  if (-not (Test-Path -LiteralPath $dir)) { continue }

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
    } | ConvertTo-Json -Depth 4
    Set-Content -LiteralPath $prefs -Value $fresh -Encoding ASCII
  }
}

if ($freed -ge 1MB) { '{0:N1} MB freed' -f ($freed / 1MB) }
elseif ($freed -gt 0) { '{0:N0} KB freed' -f ($freed / 1KB) }
