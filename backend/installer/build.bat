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

echo [1/5] Compiling XBuddyService.exe (x64 Native Windows Service)...
"%CSC%" /nologo /platform:x64 /target:exe /out:"XBuddyService.exe" /reference:System.ServiceProcess.dll "XBuddyService.cs"
if %ERRORLEVEL% neq 0 ( echo [ERROR] Failed to compile XBuddyService.exe & exit /b 1 )
copy /y "XBuddyService.exe" "payload\XBuddyService.exe" >nul

echo [2/5] Compiling XBuddyStation.exe (Control Panel Launcher)...
"%CSC%" /nologo /platform:x64 /target:winexe /out:"XBuddyStation.exe" /reference:System.Windows.Forms.dll,System.ServiceProcess.dll "XBuddyStation.cs"
if %ERRORLEVEL% neq 0 ( echo [ERROR] Failed to compile XBuddyStation.exe & exit /b 1 )
copy /y "XBuddyStation.exe" "payload\XBuddyStation.exe" >nul

echo [3/5] Compiling Uninstall.exe (Elevated Uninstaller)...
"%CSC%" /nologo /platform:x64 /target:winexe /out:"Uninstall.exe" /win32manifest:"app.manifest" /reference:System.Windows.Forms.dll,System.ServiceProcess.dll "Uninstall.cs"
if %ERRORLEVEL% neq 0 ( echo [ERROR] Failed to compile Uninstall.exe & exit /b 1 )
copy /y "Uninstall.exe" "payload\Uninstall.exe" >nul

echo [4/5] Packaging payload into package.zip...
if exist "payload\bin\mutool.exe" (
    if not exist "payload\app\bin" mkdir "payload\app\bin"
    copy /y "payload\bin\mutool.exe" "payload\app\bin\mutool.exe" >nul
)
if exist "package.zip" del /f /q "package.zip"
powershell -NoProfile -Command "Compress-Archive -Path 'payload\*' -DestinationPath 'package.zip' -Force"
if not exist "package.zip" (
    echo [ERROR] Failed to create package.zip!
    exit /b 1
)

echo [4.5/5] Generating secure station provisioning payload...
node generate_provisioning.cjs
if %ERRORLEVEL% neq 0 ( echo [ERROR] Failed to generate Provisioning.cs & exit /b 1 )

echo [5/5] Compiling XBuddyPrintStationSetup.exe (Guided Installer Wizard with UAC Manifest and Win32 Service Registration)...
"%CSC%" /nologo /platform:x64 /target:winexe /out:"XBuddyPrintStationSetup.exe" /win32manifest:"app.manifest" /resource:package.zip /reference:System.Windows.Forms.dll,System.Drawing.dll,System.ServiceProcess.dll,System.IO.Compression.dll,System.IO.Compression.FileSystem.dll "XBuddyPrintStationSetup.cs" "Provisioning.cs"
if %ERRORLEVEL% neq 0 ( echo [ERROR] Failed to compile XBuddyPrintStationSetup.exe & exit /b 1 )

copy /y "XBuddyPrintStationSetup.exe" "..\..\XBuddyPrintStationSetup.exe" >nul
copy /y "XBuddyPrintStationSetup.exe" "..\..\frontend\public\XBuddyPrintStationSetup.exe" >nul
copy /y "XBuddyPrintStationSetup.exe" "..\..\frontend\dist\XBuddyPrintStationSetup.exe" >nul

echo ========================================================
echo [SUCCESS] XBuddyPrintStationSetup.exe compiled and ready!
echo Architecture: x64 Native
echo Output: %SCRIPT_DIR%XBuddyPrintStationSetup.exe
echo ========================================================
