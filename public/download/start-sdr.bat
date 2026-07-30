@echo off
REM RTL-SDR V3 Console — Windows launcher
REM
REM Usage:
REM   start-sdr.bat             - desktop app (Electron)
REM   start-sdr.bat --web        - web app (opens browser)
REM   start-sdr.bat --update     - update + launch

echo.
echo  =========================================================
echo    RTL-SDR V3 Console - One-Click Launcher (Windows)
echo  =========================================================
echo.

REM Set install directory
set INSTALL_DIR=%USERPROFILE%\Desktop\rtl-sdr-v3-console

REM Step 1: Check Node.js
echo [1/6] Checking Node.js...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   X Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo   OK Node.js %NODE_VER%

REM Step 2: Clone or update
echo [2/6] Checking project files...
if exist "%INSTALL_DIR%\.git" (
    if "%1"=="--update" (
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
    echo   OK Cloned successfully
)
cd /d "%INSTALL_DIR%"

REM Step 3: Install dependencies
echo [3/6] Installing dependencies...
if not exist "node_modules\electron\dist" (
    call npm install --legacy-peer-deps
    echo   OK Dependencies installed
) else (
    if "%1"=="--update" (
        call npm install --legacy-peer-deps
        echo   OK Dependencies installed
    ) else (
        echo   OK Dependencies already installed
    )
)

REM Step 4: Sandbox (Windows doesn't need this)
echo [4/6] Skipping sandbox check (Windows)
)

REM Step 5: Start rtl_tcp
echo [5/6] Starting rtl_tcp...
where rtl_tcp >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   ! rtl_tcp not installed - app will use simulated mode
) else (
    tasklist /FI "IMAGENAME eq rtl_tcp.exe" 2>NUL | find /I "rtl_tcp.exe" >NUL
    if %ERRORLEVEL% equ 0 (
        echo   OK rtl_tcp already running
    ) else (
        start /B rtl_tcp -s 2400000
        timeout /t 2 /nobreak >nul
        echo   OK rtl_tcp started
    )
)

REM Step 6: Launch
echo [6/6] Launching RTL-SDR V3 Console...
echo.

if "%1"=="--web" (
    echo   Starting web app...
    echo   Open http://localhost:3000 in your browser.
    echo.
    npx next dev -p 3000
) else (
    echo   Starting desktop app (Electron)...
    echo   A native window will open shortly.
    echo.
    set ELECTRON_DEV=1
    npx electron electron/main.js
)

pause
