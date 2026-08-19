param(
  [string]$Stage = (Join-Path $PSScriptRoot "..\dist\robot-scoreboard-windows-x64")
)

$ErrorActionPreference = "Stop"
$required = @(
  "START-SCOREBOARD.cmd",
  "STOP-SCOREBOARD.cmd",
  "FIELD-CHECK.cmd",
  "OPEN-FIELD-STATUS.cmd",
  "BACKUP-SCOREBOARD.cmd",
  "RESTORE-SCOREBOARD.cmd",
  "README-OFFLINE.txt",
  "public\pages\status.html",
  "scripts\backup-scoreboard.ps1",
  "scripts\restore-scoreboard.ps1",
  "scripts\field-check.ps1",
  "runtime\node.exe"
)

foreach ($relative in $required) {
  $path = Join-Path $Stage $relative
  if (-not (Test-Path $path)) { throw "Offline package missing: $relative" }
}

Write-Host "Offline package field-readiness contents verified."
