@echo off
REM Restaura um backup: arraste o arquivo .sql.gz da pasta backups para cima deste arquivo,
REM ou rode:  restaurar.bat backups\daily\crm-AAAAMMDD.sql.gz
cd /d "%~dp0"
if "%~1"=="" (
  echo Arraste um arquivo .sql.gz da pasta backups para cima deste arquivo.
  pause
  exit /b 1
)
set "ARQ=%~f1"
set "REL=%ARQ:*\backups\=%"
set "REL=%REL:\=/%"
echo ATENCAO: os dados atuais do CRM serao SUBSTITUIDOS pelo backup:
echo    backups/%REL%
set /p OK=Digite SIM para continuar: 
if /i not "%OK%"=="SIM" exit /b 0
docker compose exec -T backup /backup.sh >nul 2>nul
docker compose stop app
docker compose exec -T db dropdb -U crm --if-exists crm
docker compose exec -T db createdb -U crm crm
docker compose exec -T backup sh -c "gunzip -c '/backups/%REL%' | PGPASSWORD=$POSTGRES_PASSWORD psql -q -h db -U crm -d crm"
docker compose start app
echo Restaurado. (Antes de restaurar foi feito um backup de seguranca em backups\last)
pause
