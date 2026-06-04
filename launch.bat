@echo off
title Pokemon TCG — localhost:3333
cd /d "%~dp0"

:: ── Kill anything already on port 3333 ──────────────────────────────────────
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3333 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: ── Build if no production build exists ─────────────────────────────────────
if not exist ".next\BUILD_ID" (
    echo [Pokemon TCG] First run — building app (about 30 seconds)...
    call npm run build
    if errorlevel 1 (
        echo BUILD FAILED. Check the output above.
        pause
        exit /b 1
    )
)

:: ── Start the production server (minimised) ─────────────────────────────────
echo [Pokemon TCG] Starting server on http://localhost:3333 ...
start "PokemonTCG-Server" /MIN "C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next" start -p 3333

:: ── Wait for the server to accept connections ────────────────────────────────
:wait
timeout /t 2 /nobreak >nul
powershell -Command "try { Invoke-WebRequest -Uri 'http://localhost:3333' -UseBasicParsing -TimeoutSec 2 >$null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 goto wait

:: ── Open Chrome ─────────────────────────────────────────────────────────────
echo [Pokemon TCG] Ready! Opening Chrome...
for %%C in (
    "%PROGRAMFILES%\Google\Chrome\Application\chrome.exe"
    "%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe"
    "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
) do (
    if exist %%C (
        start "" %%C "http://localhost:3333"
        goto opened
    )
)
:: Fallback
start "" "http://localhost:3333"
:opened

echo.
echo [Pokemon TCG] Running at http://localhost:3333
echo Close the minimised "PokemonTCG-Server" window to stop the server.
echo (This window will now close.)
timeout /t 3 /nobreak >nul
exit
