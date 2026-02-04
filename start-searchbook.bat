@echo off
cd /d "%~dp0"
start "" npm start
timeout /t 5 /nobreak >nul
start http://localhost:5173
