@echo off
setlocal EnableDelayedExpansion

REM Swim Dashboard + ML API + ML worker (3 windows)
cd /d "%~dp0"

echo ============================================
echo   SwimML - starting all services
echo ============================================
echo.

if not exist ".env.local" (
  echo ERROR: Missing .env.local in project root.
  echo Copy .env.example and add your Supabase keys.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dashboard dependencies...
  call npm install
  if errorlevel 1 pause & exit /b 1
)

set "PY=python"
set "VENV=%~dp0ml-service\.venv\Scripts\python.exe"
if exist "%VENV%" set "PY=%VENV%"

if not exist "%VENV%" (
  echo.
  echo NOTE: Python venv not found at ml-service\.venv
  echo Run install-ml-deps.bat once, then run-all.bat again.
  echo Trying system Python for ML services...
  echo.
)

echo [1/3] Dashboard  - http://localhost:3000
start "SwimML Dashboard" cmd /k "cd /d "%~dp0" && npm run dev"

timeout /t 2 /nobreak >nul

echo [2/3] ML API     - http://localhost:8000/health
start "SwimML ML API" cmd /k "cd /d "%~dp0ml-service" && "%PY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

timeout /t 2 /nobreak >nul

echo [3/3] ML Worker  - processes pending sessions every 30s
start "SwimML ML Worker" cmd /k "cd /d "%~dp0ml-service" && "%PY%" -m app.worker.poll"

echo.
echo ============================================
echo   All started in separate windows.
echo   Keep ML Worker + ML API open while testing.
echo ============================================
echo.
echo Phone records session -^> Supabase -^> Worker analyzes -^> Dashboard shows stroke + quality
echo Mobile app: mobileApp\build-apk.bat to install on phone
echo.
echo Login: http://localhost:3000/login
echo.
pause
