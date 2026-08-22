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
@echo off
setlocal
cd /d "%~dp0"
set HOST=0.0.0.0
set PORT=3000
start "Robot Scoreboard" "%~dp0bin\node.exe" "%~dp0server\main.js"
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000/control"
endlocal
'@ | Set-Content -Path (Join-Path $Stage "START-SCOREBOARD.cmd") -Encoding ASCII

@'
@echo off
setlocal
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
endlocal
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
14. ไม่ต้องติดตั้ง Node.js และไม่ต้อง npm install ที่เครื่องสนาม
15. เก็บ runtime/ และ backups/ ไว้เมื่ออัปเดตเวอร์ชัน
16. ห้าม port-forward TCP 3000 ออก Internet
'@ | Set-Content -Path (Join-Path $Stage "README-OFFLINE.txt") -Encoding UTF8

Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $Zip -CompressionLevel Optimal
Write-Host "Offline package: $Zip"
