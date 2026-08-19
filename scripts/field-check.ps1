param(
  [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"
$failed = $false

function Test-FieldRoute([string]$Path) {
  try {
    $response = Invoke-WebRequest -Uri "$BaseUrl$Path" -Method Get -TimeoutSec 5 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
      Write-Host ("PASS route {0}" -f $Path) -ForegroundColor Green
      return
    }
    Write-Host ("FAIL route {0} returned {1}" -f $Path, $response.StatusCode) -ForegroundColor Red
    $script:failed = $true
  } catch {
    Write-Host ("FAIL route {0}: {1}" -f $Path, $_.Exception.Message) -ForegroundColor Red
    $script:failed = $true
  }
}

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
  if (-not $check.ok) { $failed = $true }
}

foreach ($route in @("/healthz", "/control", "/team/a", "/team/b", "/teams", "/status")) {
  Test-FieldRoute $route
}

if (-not $status.ok) { $failed = $true }
if ($failed) { exit 2 }
Write-Host "Machine and HTTP route checks passed. Continue with OBS/LAN/audio acceptance checklist." -ForegroundColor Green
exit 0
