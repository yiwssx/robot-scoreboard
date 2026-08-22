param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$BackupRoot,
  [string]$Label = "manual"
)

$ErrorActionPreference = "Stop"
if (-not $BackupRoot) { $BackupRoot = Join-Path $Root "backups" }
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$safeLabel = ($Label -replace '[^A-Za-z0-9_-]', '-')
$destination = Join-Path $BackupRoot "$timestamp-$safeLabel"
New-Item -ItemType Directory -Force -Path $destination | Out-Null

$runtimeRoot = Join-Path $Root "runtime"
foreach ($name in @("data", "obs", "config")) {
  $source = Join-Path $runtimeRoot $name
  if (Test-Path $source) { Copy-Item $source -Destination $destination -Recurse -Force }
}

$version = "unknown"
$packageFile = Join-Path $Root "package.json"
if (Test-Path $packageFile) {
  try { $version = (Get-Content $packageFile -Raw | ConvertFrom-Json).version } catch {}
}

$manifest = [ordered]@{
  schema = 2
  createdAt = (Get-Date).ToString("o")
  label = $Label
  hostname = $env:COMPUTERNAME
  version = $version
  sourceRoot = $Root
  includes = @("runtime/data", "runtime/obs", "runtime/config")
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $destination "manifest.json") -Encoding UTF8

Write-Host "Backup created: $destination"
Write-Output $destination
