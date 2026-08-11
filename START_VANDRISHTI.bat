@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title VanDrishti Setup and Launcher

echo ============================================================
echo   VanDrishti - automatic setup and launcher
echo ============================================================
echo.

rem Reuse VanDrishti when it is already running on the default port.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/api/v1/health' -TimeoutSec 2 ^| Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto :existing_server

set "PY_LAUNCHER="
set "PY_ARGS="

where py.exe >nul 2>&1
if not errorlevel 1 (
    py.exe -3.12 --version >nul 2>&1
    if not errorlevel 1 (
        set "PY_LAUNCHER=py.exe"
        set "PY_ARGS=-3.12"
        goto :python_found
    )
)

if exist "%LocalAppData%\Programs\Python\Python312\python.exe" (
    set "PY_LAUNCHER=%LocalAppData%\Programs\Python\Python312\python.exe"
    goto :python_found
)

where python.exe >nul 2>&1
if not errorlevel 1 (
    python.exe --version 2>&1 ^| findstr.exe /B /C:"Python 3.12." >nul
    if not errorlevel 1 (
        set "PY_LAUNCHER=python.exe"
        goto :python_found
    )
)

echo Compatible Python 3.12 was not found. Attempting to install it...
where winget.exe >nul 2>&1
if errorlevel 1 goto :python_missing

winget.exe install --id Python.Python.3.12 --exact --scope user --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto :python_install_failed

set "PY_LAUNCHER=%LocalAppData%\Programs\Python\Python312\python.exe"
set "PY_ARGS="
if not exist "%PY_LAUNCHER%" goto :python_restart_required

:python_found
echo [1/4] Python found.

if not exist "requirements.txt" (
    echo ERROR: requirements.txt is missing from this folder.
    goto :failed
)

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" --version 2>&1 ^| findstr.exe /B /C:"Python 3.12." >nul
    if errorlevel 1 (
        echo Removing an incompatible Python environment...
        rmdir /s /q ".venv"
    )
)

if not exist ".venv\Scripts\python.exe" (
    echo [2/4] Creating the isolated Python environment...
    "%PY_LAUNCHER%" %PY_ARGS% -m venv ".venv"
    if errorlevel 1 goto :venv_failed
) else (
    echo [2/4] Existing isolated Python environment found.
)

set "VENV_PY=%CD%\.venv\Scripts\python.exe"
set "PYTHONUTF8=1"

echo [3/4] Installing required packages. This can take several minutes...
"%VENV_PY%" -m pip install --upgrade pip
if errorlevel 1 goto :packages_failed
"%VENV_PY%" -m pip install -r "requirements.txt"
if errorlevel 1 goto :packages_failed

if not exist "frontend\demo_before.png" (
    "%VENV_PY%" "scripts\generate_demo.py"
    if errorlevel 1 goto :demo_failed
)

set "APP_PORT="
for /f "delims=" %%P in ('powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p=8000; while($p -le 8100){ $listener=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$p); try { $listener.Start(); $listener.Stop(); Write-Output $p; exit 0 } catch { try { $listener.Stop() } catch {}; $p++ } }; exit 1"') do set "APP_PORT=%%P"
if not defined APP_PORT goto :port_failed

echo [4/4] Starting VanDrishti on port %APP_PORT%...
echo.
echo Dashboard: http://127.0.0.1:%APP_PORT%
echo Keep this window open while using VanDrishti.
echo Press CTRL+C to stop the server.
echo.

rem Open the dashboard only after the health endpoint is ready.
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "$url='http://127.0.0.1:%APP_PORT%'; $health=$url + '/api/v1/health'; for($i=0; $i -lt 60; $i++){ try { Invoke-WebRequest -UseBasicParsing -Uri $health -TimeoutSec 1 ^| Out-Null; Start-Process $url; exit 0 } catch { Start-Sleep -Seconds 1 } }; exit 1" >nul 2>&1

"%VENV_PY%" -m uvicorn backend.app.main:app --host 127.0.0.1 --port %APP_PORT%
if errorlevel 1 goto :server_failed
exit /b 0

:existing_server
echo VanDrishti is already running at http://127.0.0.1:8000
start "" "http://127.0.0.1:8000"
echo The existing dashboard has been opened.
pause
exit /b 0

:python_missing
echo ERROR: Python 3.12 and Windows Package Manager were not found.
echo Install Python 3.12 from https://www.python.org/downloads/
echo During installation, select "Add Python to PATH", then run this file again.
goto :failed

:python_install_failed
echo ERROR: Automatic Python installation failed.
echo Install Python from https://www.python.org/downloads/ and run this file again.
goto :failed

:python_restart_required
echo Python was installed, but Windows has not refreshed the command path yet.
echo Restart the laptop, then double-click START_VANDRISHTI.bat again.
goto :failed

:venv_failed
echo ERROR: The Python environment could not be created.
goto :failed

:packages_failed
echo ERROR: Package installation failed.
echo Check the internet connection and available disk space, then run this file again.
goto :failed

:demo_failed
echo ERROR: Demo images could not be prepared.
goto :failed

:server_failed
echo ERROR: The VanDrishti server stopped because of an error.
echo Read the error shown above, then run this file again.
goto :failed

:port_failed
echo ERROR: No free local port was found between 8000 and 8100.
echo Close an unused local server and run this file again.
goto :failed

:failed
echo.
pause
exit /b 1
