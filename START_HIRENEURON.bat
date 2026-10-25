@echo off
setlocal enabledelayedexpansion
title HireNeuron Verity Launcher

echo ======================================================================
echo           HIRENEURON VERITY - ONE-CLICK SECURE LAUNCHER
echo ======================================================================
echo.

cd /d "%~dp0"

REM 1. Check Python
if exist ".venv\Scripts\python.exe" (
    set "PYTHON_EXE=.venv\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

REM 2. Run system doctor check
echo [*] Checking environment and provider credentials...
"%PYTHON_EXE%" scripts\doctor.py
if errorlevel 1 (
    echo.
    echo [!] WARNING: Environment configuration issues detected.
    echo Please review .env settings.
    pause
)

REM 3. Launch full stack via launcher
echo.
echo [*] Starting HireNeuron Verity services...
echo     - FastAPI Backend on http://localhost:8000
echo     - Next.js Web Application on http://localhost:3000
echo     - Durable Evaluation & Media Workers
echo.

REM Automatically open browser after 3 seconds in background
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"

REM Run launcher
"%PYTHON_EXE%" start_verity.py

pause
