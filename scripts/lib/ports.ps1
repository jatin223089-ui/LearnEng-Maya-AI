# Shared port helpers for local dev on Windows

function Test-PortListening {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return [bool]$conn
}

function Get-FreePort {
    param(
        [int[]]$Candidates = @(8000, 8001, 8002, 8080, 8888)
    )
    foreach ($p in $Candidates) {
        if (-not (Test-PortListening -Port $p)) {
            return $p
        }
    }
    # OS-assigned free port
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = ($listener.LocalEndpoint).Port
    $listener.Stop()
    return $port
}

function Stop-ListenersOnPort {
    param([int]$Port)
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        $pid = $c.OwningProcess
        if ($pid -and $pid -ne 0) {
            Write-Host "Stopping process $pid on port $Port..."
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Milliseconds 500
}
