$ErrorActionPreference = "Stop"

$desktopRoot = Split-Path -Parent $PSScriptRoot
$bundleDir = Join-Path $desktopRoot "src-tauri\target\release\bundle\nsis"
$shareDir = Join-Path $desktopRoot "share"
$indexTemplate = Join-Path $shareDir "index.html"
$targetInstaller = Join-Path $shareDir "BachCelloConsole-Setup.exe"

if (-not (Test-Path $bundleDir)) {
  throw "Bundle directory not found: $bundleDir"
}

$installer = Get-ChildItem -Path $bundleDir -Filter "*-setup.exe" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $installer) {
  throw "No NSIS installer found in $bundleDir"
}

if (-not (Test-Path $shareDir)) {
  New-Item -ItemType Directory -Path $shareDir | Out-Null
}

Copy-Item -Path $installer.FullName -Destination $targetInstaller -Force

$hash = (Get-FileHash -Path $targetInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
$sizeBytes = (Get-Item $targetInstaller).Length
$manifest = [ordered]@{
  file = "BachCelloConsole-Setup.exe"
  source = $installer.Name
  version = "0.1.0"
  sha256 = $hash
  sizeBytes = $sizeBytes
  updatedAtUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
}

$manifestPath = Join-Path $shareDir "latest.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json), $utf8NoBom)
$hash | Set-Content -Path (Join-Path $shareDir "BachCelloConsole-Setup.exe.sha256.txt") -Encoding ASCII

Write-Host "Prepared share folder:"
Write-Host "  Installer: $targetInstaller"
Write-Host "  SHA256:    $hash"
