$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$port = 3000
$existing = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
  Start-Process "http://127.0.0.1:$port"
  Write-Host "Local app is already running at http://127.0.0.1:$port"
  exit 0
}
Start-Process powershell.exe -ArgumentList '-NoExit', '-Command', "Set-Location '$projectRoot'; npm run dev"
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    Start-Process "http://127.0.0.1:$port"
    Write-Host "Local app started at http://127.0.0.1:$port"
    exit 0
  }
}
throw 'Next.js did not start on port 3000. Check the dev-server window for the error.'
