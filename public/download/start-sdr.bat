@echo off
setlocal enabledelayedexpansion

echo.
echo  =========================================================
echo    RTL-SDR V3 Console - One-Click Launcher (Windows)
echo  =========================================================
echo.

set "INSTALL_DIR=%USERPROFILE%\Desktop\rtl-sdr-v3-console"

REM Step 1: Check Node.js
echo [1/6] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo   ERROR: Node.js not found. Install from https://nodejs.org
    echo   Download the LTS version (20.x or higher)
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo   OK Node.js !NODE_VER!

REM Step 2: Clone or update
echo [2/6] Checking project files...
if exist "%INSTALL_DIR%\.git" (
    if /i "%~1"=="--update" (
        echo   Updating from GitHub...
        cd /d "%INSTALL_DIR%"
        git fetch origin
        git reset --hard origin/main
        if exist .next rmdir /s /q .next
        echo   OK Updated to latest version
    ) else (
        echo   OK Project found
    )
) else (
    echo   Cloning from GitHub...
    git clone "https://github.com/jwfrancois/rtl-sdr-v3-console.git" "%INSTALL_DIR%"
    if errorlevel 1 (
        echo   ERROR: Failed to clone. Check your internet connection.
        pause
        exit /b 1
    )
    echo   OK Cloned successfully
)
cd /d "%INSTALL_DIR%"

REM Step 3: Install dependencies
echo [3/6] Installing dependencies...
if not exist "node_modules\electron\dist" (
    echo   Running npm install...
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo   ERROR: npm install failed.
        pause
        exit /b 1
    )
    echo   OK Dependencies installed
) else (
    if /i "%~1"=="--update" (
        echo   Running npm install...
        call npm install --legacy-peer-deps
        echo   OK Dependencies installed
    ) else (
        echo   OK Dependencies already installed
    )
)

REM Step 4: Skip sandbox (Windows does not need it)
echo [4/6] Skipping sandbox check (not needed on Windows)

REM Step 5: Start rtl_tcp
echo [5/6] Starting rtl_tcp...
where rtl_tcp >nul 2>&1
if errorlevel 1 (
    echo   NOTE: rtl_tcp not installed - app will use simulated mode
    echo   To install: download rtl-sdr from https://www.rtl-sdr.com/
) else (
    tasklist /fi "imagename eq rtl_tcp.exe" 2>nul | find /i "rtl_tcp.exe" >nul
    if errorlevel 1 (
        start "" /b rtl_tcp -s 2400000
        timeout /t 2 /nobreak >nul
        echo   OK rtl_tcp started
    ) else (
        echo   OK rtl_tcp already running
    )
)

REM Step 6: Launch
echo [6/6] Launching RTL-SDR V3 Console...
echo.

if /i "%~1"=="--web" (
    echo   Starting web app...
    echo   Open http://localhost:3000 in your browser.
    echo.
    call npx next dev -p 3000
) else (
    echo   Starting desktop app (Electron)...
    echo   A native window will open shortly.
    echo.
    set "ELECTRON_DEV=1"
    call npx electron electron/main.js
)

echo.
echo RTL-SDR V3 Console has exited.
pause
