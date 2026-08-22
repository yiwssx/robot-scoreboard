$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("robot-scoreboard-backup-test-" + [guid]::NewGuid().ToString("N"))
$RuntimeRoot = Join-Path $TempRoot "runtime"

try {
  foreach ($name in @("data", "obs", "config")) {
    New-Item -ItemType Directory -Force -Path (Join-Path $RuntimeRoot $name) | Out-Null
  }
  Set-Content -Path (Join-Path $RuntimeRoot "data\state.txt") -Value "original-data" -Encoding UTF8
  Set-Content -Path (Join-Path $RuntimeRoot "obs\score_a.txt") -Value "42" -Encoding UTF8
  Set-Content -Path (Join-Path $RuntimeRoot "config\competition-rules.json") -Value '{"matchDurationSeconds":180}' -Encoding UTF8

  $backupRoot = Join-Path $TempRoot "backups"
  $backupPath = (& (Join-Path $RepoRoot "tools\field\backup-scoreboard.ps1") -Root $TempRoot -BackupRoot $backupRoot -Label "ci" | Select-Object -Last 1)
  if (-not (Test-Path (Join-Path $backupPath "manifest.json"))) { throw "Backup manifest missing" }

  Set-Content -Path (Join-Path $RuntimeRoot "data\state.txt") -Value "mutated" -Encoding UTF8
  Set-Content -Path (Join-Path $RuntimeRoot "obs\score_a.txt") -Value "999" -Encoding UTF8
  Set-Content -Path (Join-Path $RuntimeRoot "config\competition-rules.json") -Value '{"matchDurationSeconds":1}' -Encoding UTF8

  & (Join-Path $RepoRoot "tools\field\restore-scoreboard.ps1") -Root $TempRoot -BackupPath $backupPath

  if ((Get-Content (Join-Path $RuntimeRoot "data\state.txt") -Raw).Trim() -ne "original-data") { throw "Data restore mismatch" }
  if ((Get-Content (Join-Path $RuntimeRoot "obs\score_a.txt") -Raw).Trim() -ne "42") { throw "OBS restore mismatch" }
  if ((Get-Content (Join-Path $RuntimeRoot "config\competition-rules.json") -Raw).Trim() -ne '{"matchDurationSeconds":180}') { throw "Config restore mismatch" }

  $preRestore = Get-ChildItem -Path $backupRoot -Directory | Where-Object { $_.Name -like '*-pre-restore' }
  if (-not $preRestore) { throw "Pre-restore safety backup missing" }

  Write-Host "Backup/restore validation passed."
} finally {
  Remove-Item $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
