param(
  [int]$Port = 8787,
  [string]$BindAddress = "127.0.0.1"
)

$ErrorActionPreference = "Stop"

$desktopRoot = Split-Path -Parent $PSScriptRoot
$shareDir = Join-Path $desktopRoot "share"

if (-not (Test-Path $shareDir)) {
  throw "Share directory not found: $shareDir"
}

$python = Get-Command python -ErrorAction SilentlyContinue
$pythonLauncherArgs = @()

$launcher = $null
if ($python) {
  $launcher = $python.Source
} else {
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    $launcher = $py.Source
    $pythonLauncherArgs = @("-3")
  }
}

if (-not $launcher) {
  throw "Python 3 is required to serve the share directory."
}

$args = @(
  "-m", "http.server", $Port.ToString(),
  "--bind", $BindAddress,
  "--directory", $shareDir
)

Write-Host "Serving $shareDir at http://${BindAddress}:$Port/"
& $launcher @pythonLauncherArgs @args
