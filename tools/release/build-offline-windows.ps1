param(
  [string]$OutputDir = (Join-Path $PSScriptRoot "..\..\dist")
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Stage = Join-Path $OutputDir "robot-scoreboard-windows-x64"
$Zip = Join-Path $OutputDir "robot-scoreboard-windows-x64.zip"

Push-Location $Root
try {
  & npm run build:client
  if ($LASTEXITCODE -ne 0) { throw "Client build failed with exit code $LASTEXITCODE" }
} finally { Pop-Location }

if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
if (Test-Path $Zip) { Remove-Item $Zip -Force }
New-Item -ItemType Directory -Force -Path `
  $Stage,
  (Join-Path $Stage "bin"),
  (Join-Path $Stage "dist"),
  (Join-Path $Stage "runtime\data"),
  (Join-Path $Stage "runtime\obs"),
  (Join-Path $Stage "runtime\config"),
  (Join-Path $Stage "backups"),
  (Join-Path $Stage "tools\field") | Out-Null

foreach ($item in @("server", "package.json", "package-lock.json", "README.md", "node_modules")) {
  Copy-Item (Join-Path $Root $item) -Destination $Stage -Recurse -Force
}
Copy-Item (Join-Path $Root "dist\client") -Destination (Join-Path $Stage "dist\client") -Recurse -Force
Copy-Item (Join-Path $Root "runtime\config\*") -Destination (Join-Path $Stage "runtime\config") -Recurse -Force
foreach ($scriptName in @("backup-scoreboard.ps1", "restore-scoreboard.ps1", "field-check.ps1")) {
  Copy-Item (Join-Path $Root "tools\field\$scriptName") -Destination (Join-Path $Stage "tools\field\$scriptName") -Force
}

Push-Location $Stage
try {
  & npm prune --omit=dev --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw "Runtime dependency prune failed with exit code $LASTEXITCODE" }
} finally { Pop-Location }

$nodeExe = (Get-Command node.exe).Source
Copy-Item $nodeExe (Join-Path $Stage "bin\node.exe") -Force

@'
param(
  [int]$Port = 3000,
  [string]$ListenHost = "0.0.0.0",
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$RuntimeDir = Join-Path $Root "runtime"
$PidFile = Join-Path $RuntimeDir "scoreboard.pid.json"
$NodeExe = Join-Path $Root "bin\node.exe"
$ServerScript = Join-Path $Root "server\main.js"
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

function Test-ScoreboardProcess([int]$ProcessId) {
  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $process) { return $false }

  try {
    $info = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
    $expectedNode = [IO.Path]::GetFullPath($NodeExe)
    $actualNode = if ($info.ExecutablePath) { [IO.Path]::GetFullPath([string]$info.ExecutablePath) } else { "" }
    $serverNeedle = [IO.Path]::GetFullPath($ServerScript)
    return ($actualNode -ieq $expectedNode -and [string]$info.CommandLine -like "*$serverNeedle*")
  } catch {
    try { return ([IO.Path]::GetFullPath($process.Path) -ieq [IO.Path]::GetFullPath($NodeExe)) }
    catch { return $false }
  }
}

if (Test-Path $PidFile) {
  try { $record = Get-Content $PidFile -Raw | ConvertFrom-Json }
  catch { throw "Invalid scoreboard PID file: $PidFile. Verify no scoreboard process is running before deleting it." }

  $managedPid = [int]$record.pid
  if (Get-Process -Id $managedPid -ErrorAction SilentlyContinue) {
    if (-not (Test-ScoreboardProcess $managedPid)) {
      throw "Refusing to start: $PidFile points to live PID $managedPid that is not this packaged scoreboard."
    }
    Write-Host "Robot Scoreboard is already running as PID $managedPid."
    if (-not $NoBrowser) { Start-Process "http://localhost:$($record.port)/control" }
    exit 0
  }

  Remove-Item $PidFile -Force
}

$env:HOST = $ListenHost
$env:PORT = [string]$Port
$process = Start-Process -FilePath $NodeExe -ArgumentList @($ServerScript) -WorkingDirectory $Root -PassThru
$record = [ordered]@{
  pid = $process.Id
  port = $Port
  node = [IO.Path]::GetFullPath($NodeExe)
  server = [IO.Path]::GetFullPath($ServerScript)
  startedAt = (Get-Date).ToString("o")
}
$record | ConvertTo-Json | Set-Content -Path $PidFile -Encoding UTF8

$healthUrl = "http://127.0.0.1:$Port/healthz"
$ready = $false
try {
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($process.HasExited) { throw "Scoreboard process exited with code $($process.ExitCode) before becoming ready." }
    try {
      $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 250
  }
  if (-not $ready) { throw "Scoreboard did not become ready at $healthUrl." }
} catch {
  Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  throw
}

Write-Host "Robot Scoreboard started as PID $($process.Id) on port $Port."
if (-not $NoBrowser) { Start-Process "http://localhost:$Port/control" }
'@ | Set-Content -Path (Join-Path $Stage "START-SCOREBOARD.ps1") -Encoding UTF8

@'
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$PidFile = Join-Path $Root "runtime\scoreboard.pid.json"
$NodeExe = Join-Path $Root "bin\node.exe"
$ServerScript = Join-Path $Root "server\main.js"

if (-not (Test-Path $PidFile)) {
  Write-Host "No managed Robot Scoreboard process is recorded. Nothing was stopped."
  exit 0
}

try { $record = Get-Content $PidFile -Raw | ConvertFrom-Json }
catch { throw "Invalid scoreboard PID file: $PidFile. Refusing to stop an unverified process." }

$managedPid = [int]$record.pid
$process = Get-Process -Id $managedPid -ErrorAction SilentlyContinue
if (-not $process) {
  Remove-Item $PidFile -Force
  Write-Host "Removed stale scoreboard PID record for PID $managedPid."
  exit 0
}

$matches = $false
try {
  $info = Get-CimInstance Win32_Process -Filter "ProcessId = $managedPid" -ErrorAction Stop
  $expectedNode = [IO.Path]::GetFullPath($NodeExe)
  $actualNode = if ($info.ExecutablePath) { [IO.Path]::GetFullPath([string]$info.ExecutablePath) } else { "" }
  $serverNeedle = [IO.Path]::GetFullPath($ServerScript)
  $matches = ($actualNode -ieq $expectedNode -and [string]$info.CommandLine -like "*$serverNeedle*")
} catch {
  try { $matches = ([IO.Path]::GetFullPath($process.Path) -ieq [IO.Path]::GetFullPath($NodeExe)) }
  catch { $matches = $false }
}

if (-not $matches) {
  throw "Refusing to stop PID $managedPid because it is not the packaged Robot Scoreboard process."
}

Stop-Process -Id $managedPid -Force
Wait-Process -Id $managedPid -Timeout 5 -ErrorAction SilentlyContinue
Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
Write-Host "Robot Scoreboard PID $managedPid stopped."
'@ | Set-Content -Path (Join-Path $Stage "STOP-SCOREBOARD.ps1") -Encoding UTF8

@'
@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0START-SCOREBOARD.ps1"
exit /b %ERRORLEVEL%
'@ | Set-Content -Path (Join-Path $Stage "START-SCOREBOARD.cmd") -Encoding ASCII

@'
@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0STOP-SCOREBOARD.ps1"
exit /b %ERRORLEVEL%
'@ | Set-Content -Path (Join-Path $Stage "STOP-SCOREBOARD.cmd") -Encoding ASCII

@'
@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\field\backup-scoreboard.ps1" -Root "%~dp0"
pause
endlocal
'@ | Set-Content -Path (Join-Path $Stage "BACKUP-SCOREBOARD.cmd") -Encoding ASCII

@'
@echo off
setlocal
cd /d "%~dp0"
echo STOP-SCOREBOARD.cmd must be run before restore.
set /p BACKUP_PATH=Backup folder path: 
if "%BACKUP_PATH%"=="" exit /b 2
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\field\restore-scoreboard.ps1" -Root "%~dp0" -BackupPath "%BACKUP_PATH%"
pause
endlocal
'@ | Set-Content -Path (Join-Path $Stage "RESTORE-SCOREBOARD.cmd") -Encoding ASCII

@'
@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\field\field-check.ps1"
pause
endlocal
'@ | Set-Content -Path (Join-Path $Stage "FIELD-CHECK.cmd") -Encoding ASCII

@'
@echo off
start "" "http://localhost:3000/status"
'@ | Set-Content -Path (Join-Path $Stage "OPEN-FIELD-STATUS.cmd") -Encoding ASCII

@'
@echo off
start "" "http://127.0.0.1:3000/overlay/main"
'@ | Set-Content -Path (Join-Path $Stage "OPEN-OBS-OVERLAY.cmd") -Encoding ASCII

@'
ROBOT SCOREBOARD - OFFLINE WINDOWS PACKAGE

CENTRAL MACHINE ONLY
1. แตก ZIP ลงเครื่องกลางที่ใช้ Scoreboard + OBS
2. ดับเบิลคลิก START-SCOREBOARD.cmd
3. Control: http://localhost:3000/control
4. Field Status: http://localhost:3000/status
5. OBS Browser Source: http://127.0.0.1:3000/overlay/main
6. OBS text-file fallback/primary output: .\runtime\obs\

FIELD CLIENTS
7. Team A: http://IP-เครื่องกลาง:3000/team/a
8. Team B: http://IP-เครื่องกลาง:3000/team/b
9. Team setup: http://IP-เครื่องกลาง:3000/teams
10. เครื่อง Team A/B ไม่ต้องมี OBS, Node.js หรือ npm

OPERATIONS
11. FIELD-CHECK.cmd = ตรวจ central-machine readiness
12. BACKUP-SCOREBOARD.cmd = สำรอง runtime/data + runtime/obs + runtime/config
13. RESTORE-SCOREBOARD.cmd = กู้ backup (ต้อง STOP server ก่อน)
14. STOP-SCOREBOARD.cmd หยุดเฉพาะ process ที่ START-SCOREBOARD.cmd บันทึกและยืนยันว่าเป็น Scoreboard เท่านั้น
15. ไม่ต้องติดตั้ง Node.js และไม่ต้อง npm install ที่เครื่องสนาม
16. เก็บ runtime/ และ backups/ ไว้เมื่ออัปเดตเวอร์ชัน
17. ห้าม port-forward TCP 3000 ออก Internet
'@ | Set-Content -Path (Join-Path $Stage "README-OFFLINE.txt") -Encoding UTF8

Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $Zip -CompressionLevel Optimal
Write-Host "Offline package: $Zip"
