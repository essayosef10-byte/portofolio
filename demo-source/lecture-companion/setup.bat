@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1 || (echo Node.js 20 or newer is required.& pause & exit /b 1)
where py >nul 2>&1 || (echo Python launcher is required. Install Python 3.10 or newer.& pause & exit /b 1)
if not exist ".venv\Scripts\python.exe" (
  py -3.10 -m venv .venv 2>nul
  if errorlevel 1 py -3 -m venv .venv
  if errorlevel 1 (echo Could not create the Python environment.& pause & exit /b 1)
)
.venv\Scripts\python.exe -m pip install --upgrade pip
if errorlevel 1 (echo Could not prepare pip.& pause & exit /b 1)
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 (echo Dependency installation failed.& pause & exit /b 1)
echo.
echo Setup complete. Run run.bat to launch Madar.
pause
