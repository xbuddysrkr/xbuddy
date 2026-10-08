@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   XBUDDY PRINT STATION - WINDOWS INSTALLER BUILD SCRIPT
echo ========================================================

set "CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" (
    echo [ERROR] csc.exe compiler not found at %CSC%
    exit /b 1
)

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo [1/5] Compiling XBuddyService.exe...
"%CSC%" /nologo /target:exe /out:"XBuddyService.exe" /reference:System.ServiceProcess.dll "XBuddyService.cs"
if %ERRORLEVEL% neq 0 ( echo [ERROR] Failed to compile XBuddyService.exe & exit /b 1 )
copy /y "XBuddyService.exe" "payload\XBuddyService.exe" >nul

echo [2/5] Compiling XBuddyStation.exe (Control Panel Launcher)...
"%CSC%" /nologo /target:winexe /out:"XBuddyStation.exe" /reference:System.Windows.Forms.dll,System.ServiceProcess.dll "XBuddyStation.cs"
if %ERRORLEVEL% neq 0 ( echo [ERROR] Failed to compile XBuddyStation.exe & exit /b 1 )
copy /y "XBuddyStation.exe" "payload\XBuddyStation.exe" >nul

echo [3/5] Compiling Uninstall.exe...
"%CSC%" /nologo /target:winexe /out:"Uninstall.exe" /reference:System.Windows.Forms.dll,System.ServiceProcess.dll "Uninstall.cs"
if %ERRORLEVEL% neq 0 ( echo [ERROR] Failed to compile Uninstall.exe & exit /b 1 )
copy /y "Uninstall.exe" "payload\Uninstall.exe" >nul

echo [4/5] Packaging payload into package.zip...
if exist "package.zip" del /f /q "package.zip"
powershell -NoProfile -Command "Compress-Archive -Path 'payload\*' -DestinationPath 'package.zip' -Force"
if not exist "package.zip" (
    echo [ERROR] Failed to create package.zip!
    exit /b 1
)

echo [5/5] Compiling XBuddyPrintStationSetup.exe (Guided Installer Wizard)...
"%CSC%" /nologo /target:winexe /out:"XBuddyPrintStationSetup.exe" /resource:"package.zip" /reference:System.Windows.Forms.dll,System.Drawing.dll,System.ServiceProcess.dll,System.IO.Compression.dll,System.IO.Compression.FileSystem.dll "XBuddyPrintStationSetup.cs" "Provisioning.cs"
if %ERRORLEVEL% neq 0 ( echo [ERROR] Failed to compile XBuddyPrintStationSetup.exe & exit /b 1 )

copy /y "XBuddyPrintStationSetup.exe" "..\..\XBuddyPrintStationSetup.exe" >nul
copy /y "XBuddyPrintStationSetup.exe" "..\..\frontend\public\XBuddyPrintStationSetup.exe" >nul

echo ========================================================
echo [SUCCESS] XBuddyPrintStationSetup.exe compiled and ready!
echo Output: %SCRIPT_DIR%XBuddyPrintStationSetup.exe
echo ========================================================
