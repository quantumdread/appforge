<#
.SYNOPSIS
  Route A operator session: baseline -> extract -> completeness audit -> diff.

.DESCRIPTION
  Automates steps 1-5 of docs/maintainers/verification/ROUTE-A-CATALOG-ADJUDICATION.md.
  It is READ-ONLY with respect to both the tenant and the repository: the
  extractor calls list_controls / describe_control only, and every artifact this
  script writes goes to a private review directory outside the repo.

  It deliberately does NOT adjudicate, stage, or promote anything. Steps 6 and 7
  (adjudication, isolated release:check, publication) stay manual and need
  the maintainer's per-change decisions.

.PARAMETER ReviewRoot
  Private output directory. Must not already exist. Keep it outside the repo.

.PARAMETER EnvironmentId / AppId
  The authorized delivery environment and a canvas app to host the authoring
  session. The app is only a host: the extractor never reads its screens.
  Both identifiers are required; supply the authorized session host explicitly.

.EXAMPLE
  pwsh -File docs\maintainers\verification\route-a-session.ps1 -ReviewRoot C:\tmp\catalog-review -EnvironmentId <environment-guid> -AppId <app-guid>
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $ReviewRoot,
  [Parameter(Mandatory = $true)][string] $EnvironmentId,
  [Parameter(Mandatory = $true)][string] $AppId,
  [string] $ClusterCategory = 'prod',
  [string] $AppForgeRoot  = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
)

$ErrorActionPreference = 'Stop'

$catalogDir = Join-Path $AppForgeRoot 'knowledge\catalogs'
$extractor  = Join-Path $AppForgeRoot 'cli\extractor.mjs'
$freshDir   = Join-Path $ReviewRoot 'fresh'

# --- Guards ------------------------------------------------------------------
if (Test-Path -LiteralPath $ReviewRoot) {
  throw "ReviewRoot already exists: $ReviewRoot. Choose a fresh directory; existing extraction output is not safe to reuse."
}
if ($ReviewRoot -like "$AppForgeRoot*") {
  throw "ReviewRoot must live outside the AppForge repository. The extractor overwrites fixed filenames."
}
if (-not (Test-Path -LiteralPath $extractor)) { throw "Extractor not found at $extractor" }
if (-not (Get-Command dnx -ErrorAction SilentlyContinue)) {
  throw "dnx not found. The extractor starts the canvas-authoring MCP through dnx; install the .NET 10 SDK."
}

New-Item -ItemType Directory -Path $ReviewRoot -Force | Out-Null

# --- Step 1: baseline --------------------------------------------------------
Write-Host "`n=== 1. Baseline ===" -ForegroundColor Cyan
$commit = (git -C $AppForgeRoot rev-parse HEAD).Trim()
$dirty  = (git -C $AppForgeRoot status --porcelain)
$baselineFiles = @(
  (Join-Path $catalogDir 'control-manifest.yml'),
  (Join-Path $catalogDir 'control-properties.yml'),
  (Join-Path $catalogDir 'control-augmentations.yml'),
  (Join-Path $AppForgeRoot 'cli\dist\analyzer-core.mjs')
)
$baseline = foreach ($f in $baselineFiles) {
  [pscustomobject]@{ File = (Split-Path $f -Leaf); Sha256 = (Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash }
}
$baseline | Format-Table -AutoSize
[pscustomobject]@{
  captured_at = (Get-Date).ToString('o'); appforge_commit = $commit
  working_tree_clean = [string]::IsNullOrWhiteSpace($dirty)
  environment_id = $EnvironmentId; app_id = $AppId; cluster_category = $ClusterCategory
  baseline = $baseline
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $ReviewRoot 'baseline.json') -Encoding utf8
if (-not [string]::IsNullOrWhiteSpace($dirty)) {
  Write-Warning "Working tree is not clean. Extraction is still read-only, but record why before adjudicating."
}

# --- Step 2-3: extract -------------------------------------------------------
Write-Host "`n=== 2. Extract (spawns canvas-authoring MCP via dnx; may prompt for sign-in) ===" -ForegroundColor Cyan
$env:CANVAS_ENVIRONMENT_ID  = $EnvironmentId
$env:CANVAS_APP_ID          = $AppId
$env:CANVAS_CLUSTER_CATEGORY = $ClusterCategory
$stdout = Join-Path $ReviewRoot 'extractor.stdout.log'
$stderr = Join-Path $ReviewRoot 'extractor.stderr.log'
$sw = [Diagnostics.Stopwatch]::StartNew()
& node $extractor $freshDir 1> $stdout 2> $stderr
$code = $LASTEXITCODE
$sw.Stop()
Write-Host ("exit {0} in {1:n0}s" -f $code, $sw.Elapsed.TotalSeconds)
if ($code -ne 0) {
  Get-Content -LiteralPath $stderr -Tail 25
  throw "Extraction failed (exit $code). Inspect $stderr before proceeding; nothing has been adjudicated."
}

# --- Step 4: completeness audit ---------------------------------------------
Write-Host "`n=== 3. Completeness audit ===" -ForegroundColor Cyan
function Get-ManifestFacts([string] $path) {
  $head = Get-Content -LiteralPath $path -TotalCount 20
  $get  = { param($k) ($head | Select-String -Pattern "^\s*$k\s*:\s*(.+)$").Matches.Groups[1].Value.Trim() }
  [pscustomobject]@{
    extracted_at             = & $get 'extracted_at'
    controls_total_in_tenant = & $get 'controls_total_in_tenant'
    controls_in_this_file    = & $get 'controls_in_this_file'
    controls_skipped         = & $get 'controls_skipped'
  }
}
$oldManifest = Join-Path $catalogDir 'control-manifest.yml'
$newManifest = Join-Path $freshDir  'control-manifest.yml'
if (-not (Test-Path -LiteralPath $newManifest)) { throw "Extractor produced no manifest at $newManifest" }
$old = Get-ManifestFacts $oldManifest
$new = Get-ManifestFacts $newManifest
[pscustomobject]@{ Which='committed'; Extracted=$old.extracted_at; InTenant=$old.controls_total_in_tenant; InFile=$old.controls_in_this_file; Skipped=$old.controls_skipped },
[pscustomobject]@{ Which='fresh';     Extracted=$new.extracted_at; InTenant=$new.controls_total_in_tenant; InFile=$new.controls_in_this_file; Skipped=$new.controls_skipped } |
  Format-Table -AutoSize
if ([int]$new.controls_in_this_file -lt ([int]$old.controls_in_this_file * 0.8)) {
  Write-Warning "Fresh extraction describes far fewer controls than the committed catalog. Treat as a suspect run, not as evidence controls disappeared."
}

# --- Step 5: diff ------------------------------------------------------------
Write-Host "`n=== 4. Diff (exit 1 from git means differences exist, which is expected) ===" -ForegroundColor Cyan
foreach ($name in @('control-manifest.yml','control-properties.yml')) {
  $oldF = Join-Path $catalogDir $name
  $newF = Join-Path $freshDir  $name
  $out  = Join-Path $ReviewRoot ("diff-" + $name.Replace('.yml','') + ".patch")
  git -C $AppForgeRoot diff --no-index --no-color -- $oldF $newF | Set-Content -LiteralPath $out -Encoding utf8
  $lines = @(Get-Content -LiteralPath $out -ErrorAction SilentlyContinue)
  $adds = @($lines | Where-Object { $_ -match '^\+' -and $_ -notmatch '^\+\+\+' }).Count
  $dels = @($lines | Where-Object { $_ -match '^-'  -and $_ -notmatch '^---' }).Count
  Write-Host ("  {0,-26} +{1,-5} -{2,-5} -> {3}" -f $name, $adds, $dels, (Split-Path $out -Leaf))
}

# Controls newly reachable / newly missing, by top-level key.
function Get-ControlKeys([string] $p) {
  (Select-String -LiteralPath $p -Pattern '^  ([A-Za-z][A-Za-z0-9_/]*):\s*$').Matches |
    ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
}
$oldKeys = Get-ControlKeys (Join-Path $catalogDir 'control-properties.yml')
$newKeys = Get-ControlKeys (Join-Path $freshDir  'control-properties.yml')
$gained  = @($newKeys | Where-Object { $_ -notin $oldKeys })
$lost    = @($oldKeys | Where-Object { $_ -notin $newKeys })
Write-Host "`nNewly describable controls ($($gained.Count)): $($gained -join ', ')"
Write-Host "No longer describable  ($($lost.Count)): $($lost -join ', ')"

$dumpSourced = @('Circle','Classic/Icon','Form','ModernCheckbox','PartialCircle','Star','Triangle')
$retire = @($gained | Where-Object { $_ -in $dumpSourced })
if ($retire.Count) {
  Write-Host "`nRETIRE these dump_sourced entries — the build gate fails if a control exists in both:" -ForegroundColor Yellow
  $retire | ForEach-Object { Write-Host "  - $_" }
  if ('Form' -in $retire) {
    Write-Host "  'Form' is reachable again: tenant worklist item 10 (the Form lower bound) is resolved by retirement, not by a Studio dump." -ForegroundColor Yellow
  }
}

Write-Host "`n=== Done. Nothing was staged, promoted or committed. ===" -ForegroundColor Green
Write-Host "Review directory: $ReviewRoot"
Write-Host "Next: steps 6-7 of ROUTE-A-CATALOG-ADJUDICATION.md — adjudicate each difference with the maintainer,"
Write-Host "stage only reviewed changes in an isolated checkout, run release:check there, then decide on release."
