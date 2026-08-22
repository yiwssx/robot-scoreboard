param(
  [string]$Stage = (Join-Path $PSScriptRoot "..\..\dist\robot-scoreboard-windows-x64")
)

$ErrorActionPreference = "Stop"
$required = @(
  "START-SCOREBOARD.cmd",
  "STOP-SCOREBOARD.cmd",
  "FIELD-CHECK.cmd",
  "OPEN-FIELD-STATUS.cmd",
  "OPEN-OBS-OVERLAY.cmd",
  "BACKUP-SCOREBOARD.cmd",
  "RESTORE-SCOREBOARD.cmd",
  "README-OFFLINE.txt",
  "server\main.js",
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

Write-Host "Offline package repository architecture contents verified."
