param(
    [switch]$Restart
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
. (Join-Path $Root "scripts\lib\ports.ps1")

function Ensure-Mongo {
    $tcp = Test-NetConnection -ComputerName localhost -Port 27017 -WarningAction SilentlyContinue
    if ($tcp.TcpTestSucceeded) { return }
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        Write-Host "Starting MongoDB via Docker..."
        Push-Location $Root
        docker compose up -d mongodb
        Pop-Location
        Start-Sleep -Seconds 3
        return
    }
    $svc = Get-Service -Name "MongoDB" -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -ne "Running") {
        Write-Host "Starting MongoDB Windows service..."
        Start-Service MongoDB
    }
}

Ensure-Mongo

Write-Host "Installing backend dependencies..."
python -m pip install -r (Join-Path $Root "backend\requirements.txt") | Out-Null

$backendEnv = Join-Path $Root "backend\.env"
if (-not (Test-Path $backendEnv)) {
    Copy-Item (Join-Path $Root "backend\.env.example") $backendEnv
    Write-Host "Created backend/.env — add GOOGLE_API_KEY, then re-run."
}

if ($Restart) {
    Stop-ListenersOnPort -Port 8000
    Stop-ListenersOnPort -Port 3000
}

$backendPort = 8000
if (Test-PortListening -Port $backendPort) {
    if ($Restart) {
        $backendPort = Get-FreePort -Candidates @(8000, 8001, 8002, 8080)
    } else {
        Write-Host "Port 8000 already in use — reusing existing backend (or run with -Restart)"
    }
}

$frontendPort = 3000
if (Test-PortListening -Port $frontendPort) {
    if ($Restart) {
        $frontendPort = Get-FreePort -Candidates @(3000, 3001, 3002)
    } else {
        Write-Host "Port 3000 already in use — reusing existing frontend (or run with -Restart)"
    }
}

$frontendEnv = Join-Path $Root "frontend\.env"
@"
REACT_APP_BACKEND_URL=http://127.0.0.1:$backendPort
WDS_SOCKET_PORT=$frontendPort
ENABLE_HEALTH_CHECK=false
PORT=$frontendPort
"@ | Set-Content -Path $frontendEnv -Encoding utf8

if (-not (Test-PortListening -Port $backendPort)) {
    Write-Host "Starting backend on http://127.0.0.1:$backendPort ..."
    Start-Process powershell -ArgumentList @(
        "-NoExit", "-Command",
        "& '$($Root)\scripts\start-backend.ps1' -Port $backendPort"
    )
    Start-Sleep -Seconds 2
} else {
    Write-Host "Backend already listening on port $backendPort"
}

if (-not (Test-PortListening -Port $frontendPort)) {
    Write-Host "Starting frontend on http://localhost:$frontendPort ..."
    Push-Location (Join-Path $Root "frontend")
    $env:PORT = "$frontendPort"
    npm start
} else {
    Write-Host "Frontend already on http://localhost:$frontendPort"
    Write-Host "Set REACT_APP_BACKEND_URL=http://127.0.0.1:$backendPort in frontend/.env"
}
