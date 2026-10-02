@echo off
title X BUDDY WEBSITE
color 0E
set PATH=C:\Program Files\nodejs;%PATH%
cd /d "f:\xerox buddy"

echo ========================================================
echo               X BUDDY LOCAL WEBSITE
echo ========================================================
echo.
echo Starting local website server...
echo.
echo Links opening in browser:
echo - Student Website: http://localhost:5173
echo - Booth Station:   http://localhost:5173/booth.html
echo - Admin Panel:     http://localhost:5173/admin.html
echo.

start "" "http://localhost:5173"
call npm run dev
pause
