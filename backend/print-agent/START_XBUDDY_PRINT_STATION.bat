@echo off
title X BUDDY PRINT STATION
color 0B
setlocal enabledelayedexpansion

:: Automatically detect the directory where this script is located
set "AGENT_DIR=%~dp0"
set "AGENT_DIR=%AGENT_DIR:~0,-1%"
set "PATH=C:\Program Files\nodejs;%PATH%"

cd /d "%AGENT_DIR%"

cls
echo ========================================================
echo             X BUDDY PRINT STATION
echo ========================================================
echo.

:: 1. Validate Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

:: 2. Clean up lingering previous processes
echo [1/2] Cleaning previous sessions...
taskkill /f /im cloudflared.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :3001 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: 3. Start Print Agent with direct outbound HTTPS telemetry
echo [2/2] Starting Print Agent connected to EPSON printer...
echo [INFO] Direct outbound HTTPS telemetry active (https://xbuddysrkr.vercel.app)
echo ========================================================
node index.js

pause