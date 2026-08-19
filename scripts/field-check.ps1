param(
  [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"
try {
  $status = Invoke-RestMethod -Uri "$BaseUrl/api/field-status" -Method Get -TimeoutSec 5
} catch {
  Write-Host "FIELD CHECK FAILED: server/status endpoint not reachable" -ForegroundColor Red
  Write-Host $_.Exception.Message
  exit 1
}

Write-Host "FIELD READINESS: $($status.ok)" -ForegroundColor $(if ($status.ok) { "Green" } else { "Red" })
Write-Host "Host: $($status.hostname)  Node: $($status.node)  Scoreboard: $($status.scoreboard.status)"
foreach ($item in $status.network) {
  Write-Host "LAN: $($item.interface) $($item.address)"
}
foreach ($check in $status.checks) {
  $label = if ($check.ok) { "PASS" } else { "FAIL" }
  Write-Host ("{0,-4} {1} - {2}" -f $label, $check.name, $check.detail) -ForegroundColor $(if ($check.ok) { "Green" } else { "Red" })
}

if (-not $status.ok) { exit 2 }
Write-Host "Machine readiness checks passed. Continue with OBS/LAN/audio acceptance checklist." -ForegroundColor Green
exit 0
