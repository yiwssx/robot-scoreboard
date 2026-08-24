param(
  [string]$Stage = (Join-Path $PSScriptRoot "..\..\dist\robot-scoreboard-windows-x64")
)

$ErrorActionPreference = "Stop"
$Stage = (Resolve-Path $Stage).Path
$required = @(
  "START-SCOREBOARD.cmd",
  "STOP-SCOREBOARD.cmd",
  "START-SCOREBOARD.ps1",
  "STOP-SCOREBOARD.ps1",
  "FIELD-CHECK.cmd",
  "OPEN-FIELD-STATUS.cmd",
  "OPEN-OBS-OVERLAY.cmd",
  "BACKUP-SCOREBOARD.cmd",
  "RESTORE-SCOREBOARD.cmd",
  "README-OFFLINE.txt",
  "server\main.js",
  "dist\client\pages\control.html",
  "dist\client\pages\team-a.html",
  "dist\client\pages\team-b.html",
  "dist\client\pages\team-names.html",
  "dist\client\pages\status.html",
  "dist\client\pages\overlay-main.html",
  "dist\client\app\control.js",
  "dist\client\app\scoring.js",
  "dist\client\app\team-setup.js",
  "dist\client\app\status.js",
  "dist\client\app\overlay-main.js",
  "tools\field\backup-scoreboard.ps1",
  "tools\field\restore-scoreboard.ps1",
  "tools\field\field-check.ps1",
  "runtime\config\competition-rules.json",
  "node_modules\express",
  "node_modules\socket.io",
  "bin\node.exe"
)

foreach ($relative in $required) {
  $path = Join-Path $Stage $relative
  if (-not (Test-Path $path)) { throw "Offline package missing: $relative" }
}

foreach ($devPackage in @("vite", "typescript", "preact", "@preact\preset-vite")) {
  if (Test-Path (Join-Path $Stage "node_modules\$devPackage")) {
    throw "Offline package unexpectedly contains client build dependency: $devPackage"
  }
}

$stopCmd = Get-Content (Join-Path $Stage "STOP-SCOREBOARD.cmd") -Raw
if ($stopCmd -match '(?i)taskkill|netstat') {
  throw "STOP-SCOREBOARD.cmd must not kill arbitrary processes by scanning TCP 3000."
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$testPort = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()

$startScript = Join-Path $Stage "START-SCOREBOARD.ps1"
$stopScript = Join-Path $Stage "STOP-SCOREBOARD.ps1"
$pidFile = Join-Path $Stage "runtime\scoreboard.pid.json"
$started = $false

try {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $startScript -Port $testPort -ListenHost "127.0.0.1" -NoBrowser
  if ($LASTEXITCODE -ne 0) { throw "Packaged START-SCOREBOARD.ps1 failed with exit code $LASTEXITCODE" }
  $started = $true

  if (-not (Test-Path $pidFile)) { throw "Packaged startup did not create managed PID record." }
  $record = Get-Content $pidFile -Raw | ConvertFrom-Json
  if ([int]$record.port -ne $testPort) { throw "Managed PID record contains unexpected port $($record.port)." }

  foreach ($route in @("/healthz", "/control", "/team/a", "/team/b", "/teams", "/status", "/overlay/main")) {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$testPort$route" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -ne 200) { throw "Packaged route $route returned $($response.StatusCode)." }
  }

  $status = Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/api/field-status" -TimeoutSec 5
  if (-not $status.ok) { throw "Packaged /api/field-status reports not ready." }
} finally {
  if ($started -or (Test-Path $pidFile)) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stopScript
    if ($LASTEXITCODE -ne 0) { throw "Packaged STOP-SCOREBOARD.ps1 failed with exit code $LASTEXITCODE" }
  }
}

if (Test-Path $pidFile) { throw "Managed PID record remains after packaged shutdown." }
Write-Host "Offline package architecture, runtime dependencies, routes, readiness, and managed process lifecycle verified."
