@echo off
REM Para o CRM. Os dados continuam guardados no Docker e voltam no proximo iniciar.bat
cd /d "%~dp0"
docker compose down
pause
