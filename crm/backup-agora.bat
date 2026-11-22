@echo off
REM Faz um backup do banco agora (alem do automatico diario) na pasta backups\
cd /d "%~dp0"
docker compose exec -T backup /backup.sh && echo Backup criado na pasta backups\last
pause
