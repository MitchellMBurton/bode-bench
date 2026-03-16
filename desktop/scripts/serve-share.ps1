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

$serverScriptPath = Join-Path $env:TEMP "bach-cello-console-serve-share.py"
$serverScript = @"
import functools
import http.server
import pathlib
import sys

bind_address = sys.argv[1]
port = int(sys.argv[2])
share_dir = pathlib.Path(sys.argv[3])

class NoCacheShareHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(share_dir), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

server = http.server.ThreadingHTTPServer((bind_address, port), NoCacheShareHandler)
print(f"Serving {share_dir} at http://{bind_address}:{port}/")
try:
    server.serve_forever()
finally:
    server.server_close()
"@

Set-Content -Path $serverScriptPath -Value $serverScript -Encoding UTF8

try {
  $args = @(
    $serverScriptPath,
    $BindAddress,
    $Port.ToString(),
    $shareDir
  )

  Write-Host "Serving $shareDir at http://${BindAddress}:$Port/ (cache disabled for local testing)"
  & $launcher @pythonLauncherArgs @args
} finally {
  if (Test-Path $serverScriptPath) {
    Remove-Item $serverScriptPath -Force
  }
}
