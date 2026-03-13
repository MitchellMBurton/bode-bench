$ErrorActionPreference = "Stop"

$desktopRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $desktopRoot
$bundleDir = Join-Path $desktopRoot "src-tauri\target\release\bundle\nsis"
$shareDir = Join-Path $desktopRoot "share"
$tauriConfigPath = Join-Path $desktopRoot "src-tauri\tauri.conf.json"
$webDistDir = Join-Path $repoRoot "app\dist"
$webAssetsDir = Join-Path $shareDir "assets"
$webIndexPath = Join-Path $shareDir "webapp.html"
$webIconPath = Join-Path $shareDir "vite.svg"

if (-not (Test-Path $tauriConfigPath)) {
  throw "Tauri config not found: $tauriConfigPath"
}

$tauriConfig = Get-Content -Path $tauriConfigPath -Raw | ConvertFrom-Json
$productName = [string]$tauriConfig.productName
$version = [string]$tauriConfig.version
$identifier = [string]$tauriConfig.identifier
$homepage = [string]$tauriConfig.bundle.homepage
$safeProductName = ($productName -replace "[^A-Za-z0-9]+", "")
$canonicalInstallerName = "${safeProductName}-Setup.exe"
$targetInstaller = Join-Path $shareDir $canonicalInstallerName
$hashFileName = "${canonicalInstallerName}.sha256.txt"

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

if (-not (Test-Path $webDistDir)) {
  throw "Web app dist directory not found: $webDistDir"
}

if (Test-Path $webAssetsDir) {
  Remove-Item -Path $webAssetsDir -Recurse -Force
}
New-Item -ItemType Directory -Path $webAssetsDir | Out-Null

Copy-Item -Path (Join-Path $webDistDir "assets\*") -Destination $webAssetsDir -Recurse -Force
Copy-Item -Path (Join-Path $webDistDir "index.html") -Destination $webIndexPath -Force

if (Test-Path (Join-Path $webDistDir "vite.svg")) {
  Copy-Item -Path (Join-Path $webDistDir "vite.svg") -Destination $webIconPath -Force
} elseif (Test-Path $webIconPath) {
  Remove-Item -Path $webIconPath -Force
}

$hash = (Get-FileHash -Path $targetInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
$targetInstallerItem = Get-Item $targetInstaller
$sizeBytes = $targetInstallerItem.Length
$manifest = [ordered]@{
  productName = $productName
  identifier = $identifier
  version = $version
  channel = "local"
  file = $canonicalInstallerName
  source = $installer.Name
  homepage = $homepage
  platform = "Windows x64"
  minimumOs = "Windows 10 or later"
  installerType = "NSIS Setup EXE"
  signed = $false
  sha256 = $hash
  sha256File = $hashFileName
  sizeBytes = $sizeBytes
  browserAppFile = "webapp.html"
  browserAppAvailable = $true
  updatedAtUtc = $targetInstallerItem.LastWriteTimeUtc.ToString("yyyy-MM-ddTHH:mm:ssZ")
}

$manifestPath = Join-Path $shareDir "latest.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 4), $utf8NoBom)
"$hash *$canonicalInstallerName" | Set-Content -Path (Join-Path $shareDir $hashFileName) -Encoding ASCII

Write-Host "Prepared share folder:"
Write-Host "  Installer: $targetInstaller"
Write-Host "  Version:   $version"
Write-Host "  Size:      $sizeBytes bytes"
Write-Host "  SHA256:    $hash"
Write-Host "  Manifest:  $manifestPath"
Write-Host "  Web App:   $webIndexPath"
