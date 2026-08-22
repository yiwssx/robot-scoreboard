param(
  [string]$Stage = (Join-Path $PSScriptRoot "..\dist\robot-scoreboard-windows-x64")
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
  "public\pages\status.html",
  "public\pages\overlay-main.html",
  "public\app\control.js",
  "public\app\team.js",
  "public\app\teams.js",
  "public\app\status.js",
  "public\app\overlay-main.js",
  "scripts\backup-scoreboard.ps1",
  "scripts\restore-scoreboard.ps1",
  "scripts\field-check.ps1",
  "runtime\node.exe"
)

foreach ($relative in $required) {
  $path = Join-Path $Stage $relative
  if (-not (Test-Path $path)) { throw "Offline package missing: $relative" }
}

foreach ($devPackage in @("vite", "typescript", "preact", "@preact\preset-vite")) {
  if (Test-Path (Join-Path $Stage "node_modules\$devPackage")) {
    throw "Offline package unexpectedly contains frontend build dependency: $devPackage"
  }
}

Write-Host "Offline package client/broadcast architecture contents verified."
