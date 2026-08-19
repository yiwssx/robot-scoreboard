param(
  [string]$OutputDir = (Join-Path $PSScriptRoot "..\dist")
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Stage = Join-Path $OutputDir "robot-scoreboard-windows-x64"
$Zip = Join-Path $OutputDir "robot-scoreboard-windows-x64.zip"

if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
if (Test-Path $Zip) { Remove-Item $Zip -Force }
New-Item -ItemType Directory -Force -Path $Stage, (Join-Path $Stage "runtime"), (Join-Path $Stage "data"), (Join-Path $Stage "obs") | Out-Null

$copyItems = @("server.js", "package.json", "package-lock.json", "README.md", "public", "src", "config", "node_modules")
foreach ($item in $copyItems) {
  Copy-Item (Join-Path $Root $item) -Destination $Stage -Recurse -Force
}

$nodeExe = (Get-Command node.exe).Source
Copy-Item $nodeExe (Join-Path $Stage "runtime\node.exe") -Force

@'
@echo off
setlocal
cd /d "%~dp0"
set HOST=0.0.0.0
set PORT=3000
start "Robot Scoreboard" "%~dp0runtime\node.exe" "%~dp0server.js"
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
ROBOT SCOREBOARD - OFFLINE WINDOWS PACKAGE

1. แตก ZIP ลงเครื่องแม่
2. ดับเบิลคลิก START-SCOREBOARD.cmd
3. Control: http://localhost:3000/control
4. Team A: http://IP-เครื่องแม่:3000/team/a
5. Team B: http://IP-เครื่องแม่:3000/team/b
6. Team setup: http://IP-เครื่องแม่:3000/teams
7. ไม่ต้องติดตั้ง Node.js และไม่ต้อง npm install
8. เก็บโฟลเดอร์ data/ และ obs/ ไว้เมื่ออัปเดตเวอร์ชัน
9. ห้าม port-forward TCP 3000 ออก Internet
'@ | Set-Content -Path (Join-Path $Stage "README-OFFLINE.txt") -Encoding UTF8

Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $Zip -CompressionLevel Optimal
Write-Host "Offline package: $Zip"
