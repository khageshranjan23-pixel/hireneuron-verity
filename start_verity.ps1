<#
.SYNOPSIS
    HireNeuron Verity Windows Startup Launcher
    Starts API, Evaluation Worker, Voice/Integrity Supervisor, and Next.js Frontend.
#>

param(
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location $Root

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  HIRENEURON VERITY — AUTONOMOUS AI INTERVIEWER LAUNCHER  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check Python Venv
$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    Write-Host "[!] Virtual environment not found at .venv. Creating..." -ForegroundColor Yellow
    python -m venv .venv
    & $VenvPython -m pip install -r backend/requirements.txt
}

# 2. Check .env
if (-not (Test-Path (Join-Path $Root ".env"))) {
    Write-Host "[!] .env not found. Running setup.py..." -ForegroundColor Yellow
    & $VenvPython scripts/setup.py
}

# 3. Run Doctor
Write-Host "[*] Checking configuration and environment..." -ForegroundColor Gray
& $VenvPython scripts/doctor.py

# 4. Check Occupied Ports
$portsToCheck = @(8000, 3000)
foreach ($port in $portsToCheck) {
    $occupied = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
    if ($occupied) {
        Write-Host "[!] Warning: Port $port is already in use by PID $($occupied.OwningProcess[0])." -ForegroundColor Yellow
    }
}

# 5. Extract Recruiter Token for Convenience
$RecruiterToken = ""
Get-Content (Join-Path $Root ".env") | ForEach-Object {
    if ($_ -match "^RECRUITER_TOKEN=(.*)$") {
        $RecruiterToken = $matches[1]
    }
}

Write-Host "`n[*] Starting all services..." -ForegroundColor Green

# Start API
$apiProc = Start-Process -FilePath $VenvPython -ArgumentList "scripts/run.py api" -PassThru -NoNewWindow
Write-Host "  ✓ API Server starting on http://localhost:8000 (PID: $($apiProc.Id))" -ForegroundColor Cyan

# Start Evaluation Worker
$evalProc = Start-Process -FilePath $VenvPython -ArgumentList "scripts/run.py evaluate" -PassThru -NoNewWindow
Write-Host "  ✓ Evaluation Worker active (PID: $($evalProc.Id))" -ForegroundColor Cyan

# Start Worker Supervisor (manages voice + integrity per active room)
$supProc = Start-Process -FilePath $VenvPython -ArgumentList "scripts/run.py supervisor" -PassThru -NoNewWindow
Write-Host "  ✓ Media Worker Supervisor active (PID: $($supProc.Id))" -ForegroundColor Cyan

# Start Frontend
$npmCmd = "npm.cmd"
$webProc = Start-Process -FilePath $npmCmd -ArgumentList "--prefix web run dev" -PassThru -NoNewWindow
Write-Host "  ✓ Next.js Frontend starting on http://localhost:3000 (PID: $($webProc.Id))`n" -ForegroundColor Cyan

# Wait for API Health
Write-Host "[*] Waiting for API health check..." -ForegroundColor Gray
$healthy = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    try {
        $res = Invoke-RestMethod -Uri "http://localhost:8000/health" -Method Get -TimeoutSec 2
        if ($res.status -eq "ok") {
            $healthy = $true
            break
        }
    } catch {
        # Waiting
    }
}

if ($healthy) {
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "  HIRENEURON VERITY IS READY!" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "  Recruiter Dashboard : http://localhost:3000" -ForegroundColor White
    Write-Host "  FastAPI Docs        : http://localhost:8000/docs" -ForegroundColor White
    Write-Host "  Recruiter Token     : $RecruiterToken" -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "Press Ctrl+C to stop all services cleanly.`n" -ForegroundColor Gray
} else {
    Write-Host "[!] API did not respond within timeout. Check console logs." -ForegroundColor Red
}

try {
    while ($true) {
        Start-Sleep -Seconds 2
        if ($apiProc.HasExited -or $webProc.HasExited) {
            Write-Host "[!] One of the primary servers exited." -ForegroundColor Red
            break
        }
    }
} finally {
    Write-Host "`n[*] Stopping all services cleanly..." -ForegroundColor Yellow
    foreach ($p in @($apiProc, $evalProc, $supProc, $webProc)) {
        if ($p -and -not $p.HasExited) {
            try { Stop-Process -Id $p.Id -Force } catch {}
        }
    }
    Write-Host "[*] All services stopped." -ForegroundColor Green
}
