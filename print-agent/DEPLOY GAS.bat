@echo off
title Deploy GAS — X Buddy
color 0A
echo.
echo  Copying updated GAS code to clipboard...
powershell -Command "Get-Content '%~dp0GAS_COMPLETE.js' -Raw | Set-Clipboard"
echo  Done! Code is in your clipboard.
echo.
echo  Opening Google Apps Script editor...
start "" "https://script.google.com/d/AKfycbzgScP1ogLW46Qzvv15idtPRY2xl973LFmadsbvL2ok2FRBjsDht4PCOmvsfaDrlPhf/edit"
echo.
echo  =====================================================
echo  STEPS (takes 30 seconds):
echo  1. The GAS editor just opened in your browser
echo  2. Click inside the code area, press Ctrl+A to select all
echo  3. Press Ctrl+V to paste the new code
echo  4. Press Ctrl+S to save
echo  5. Click "Deploy" ^> "Manage Deployments"
echo  6. Click the pencil icon ^> "New Version" ^> "Deploy"
echo  7. Done! Come back here and press any key.
echo  =====================================================
echo.
pause
echo.
echo  Restarting Print Agent...
taskkill /FI "WINDOWTITLE eq X Buddy Print Agent" /F >nul 2>&1
timeout /t 1 /nobreak >nul
start "X Buddy Print Agent" cmd /k "set PATH=C:\Program Files\nodejs;%PATH% && cd /d "%~dp0" && node index.js"
echo  Print Agent restarted!
echo.
pause
