@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" call setup.bat
if not exist ".venv\Scripts\python.exe" exit /b 1
set LECTURE_WHISPER_MODEL=small
start "Madar browser" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:3000"
echo Madar is starting at http://127.0.0.1:3000
echo Keep this window open while using the app. Press Ctrl+C to stop.
node server.js
