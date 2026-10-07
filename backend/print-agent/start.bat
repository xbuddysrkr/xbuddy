@echo off
title X BUDDY PRINT STATION
color 0B
setlocal enabledelayedexpansion

set "AGENT_DIR=C:\Users\SRKREC\Desktop\xbuddy-print-agent"
set "PATH=C:\Program Files\nodejs;%PATH%"

cd /d "%AGENT_DIR%"

cls
echo ========================================================
echo             X BUDDY PRINT STATION INITIALIZATION
echo ========================================================
echo.

:: 1. Validate Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Expected: C:\Program Files\nodejs\node.exe
    pause
    exit /b 1
)

:: 2. Validate Project Directory
if not exist "%AGENT_DIR%\index.js" (
    echo [ERROR] Print Agent files not found in %AGENT_DIR%!
    pause
    exit /b 1
)

:: 3. Validate Credentials
if not exist "%AGENT_DIR%\credentials.json" (
    echo [ERROR] credentials.json is missing in %AGENT_DIR%!
    pause
    exit /b 1
)

:: 4. Clean up lingering processes and stale logs
echo [1/4] Cleaning previous processes and stale logs...
taskkill /f /im cloudflared.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :3001 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)
if exist tunnel.log del /f /q tunnel.log >nul 2>&1
if exist tunnel_err.log del /f /q tunnel_err.log >nul 2>&1

:: 5. Start Cloudflare Tunnel in background
echo [2/4] Starting Cloudflare Tunnel...
start "X Buddy Cloudflare Tunnel" /min cmd /c "cloudflared.exe tunnel --url http://localhost:3001 --logfile tunnel.log 2>&1"

:: 6. Short wait for tunnel initialization
echo [3/4] Initializing Cloudflare connection...
timeout /t 5 /nobreak > nul

:: 7. Start Print Agent (runs in foreground, orchestrates sync & verify)
echo [4/4] Starting X Buddy Print Agent...
echo ========================================================
node index.js

echo.
echo ========================================================
echo [WARNING] Print Agent stopped.
echo ========================================================
pause