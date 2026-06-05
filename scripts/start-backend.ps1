param(
    [switch]$Restart,
    [int]$Port = 0
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
. (Join-Path $Root "scripts\lib\ports.ps1")

if ($Restart) {
    Stop-ListenersOnPort -Port 8000
    Stop-ListenersOnPort -Port 8001
}

if ($Port -le 0) {
    if (Test-PortListening -Port 8000) {
        Write-Host "Port 8000 is already in use (backend may already be running)."
        Write-Host "  Use: .\scripts\start-backend.ps1 -Restart   to stop and restart"
        Write-Host "  Or open: http://localhost:8000/api/"
        $Port = Get-FreePort -Candidates @(8001, 8002, 8080)
        Write-Host "Starting on alternate port $Port instead..."
    } else {
        $Port = 8000
    }
} elseif (Test-PortListening -Port $Port) {
    if (-not $Restart) {
        Write-Error "Port $Port is in use. Run with -Restart or pick another port."
    }
    Stop-ListenersOnPort -Port $Port
}

$backendDir = Join-Path $Root "backend"
if (-not (Test-Path (Join-Path $backendDir "server.py"))) {
    Write-Error "Cannot find backend/server.py under $Root"
}
$envFile = Join-Path $backendDir ".env"
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $backendDir ".env.example") $envFile
}

# 127.0.0.1 avoids many WinError 10013 issues with 0.0.0.0 when port is contested
$hostAddr = "127.0.0.1"
Write-Host "Backend: http://${hostAddr}:$Port  (API docs: /docs)"
Write-Host "Working directory: $backendDir"
Set-Location $backendDir
$env:BACKEND_PORT = "$Port"
$env:BACKEND_HOST = $hostAddr
python (Join-Path $Root "run_server.py")
