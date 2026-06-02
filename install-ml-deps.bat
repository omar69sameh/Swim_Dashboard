@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo Installing ML service Python dependencies (one-time, may take several minutes)...
echo.

REM Find Python on Windows (py launcher is common when "python" is not on PATH)
set "PYCMD="
where py >nul 2>&1 && set "PYCMD=py -3"
if not defined PYCMD where python >nul 2>&1 && set "PYCMD=python"
if not defined PYCMD where python3 >nul 2>&1 && set "PYCMD=python3"

if not defined PYCMD (
  echo ERROR: Python was not found.
  echo.
  echo Install Python 3.10 or newer:
  echo   1. Open https://www.python.org/downloads/
  echo   2. Run the installer
  echo   3. CHECK the box: "Add python.exe to PATH"
  echo   4. Close this window, open a NEW terminal, run install-ml-deps.bat again
  echo.
  pause
  exit /b 1
)

echo Using: %PYCMD%
%PYCMD% --version
echo.

cd ml-service

if not exist ".venv\Scripts\python.exe" (
  echo Creating virtual environment...
  %PYCMD% -m venv .venv
  if errorlevel 1 (
    echo ERROR: Could not create venv.
    pause
    exit /b 1
  )
)

call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt

if errorlevel 1 (
  echo.
  echo Install failed. If torch fails, run after activate:
  echo   pip install torch --index-url https://download.pytorch.org/whl/cpu
  echo   pip install -r requirements.txt
  pause
  exit /b 1
)

echo.
echo Done. You can now run run-all.bat
pause
