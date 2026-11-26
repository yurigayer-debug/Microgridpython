@echo off
REM Delta CRM - sobe tudo no Docker Desktop e abre o navegador
cd /d "%~dp0"
docker version >nul 2>nul || (
  echo O Docker Desktop nao esta aberto ou nao terminou de iniciar.
  echo Abra o Docker Desktop, espere aparecer "Engine running" e rode este arquivo de novo.
  pause
  exit /b 1
)
if not exist .env (
  copy .env.example .env >nul
  echo Criei o arquivo .env com as configuracoes de teste.
  echo Antes de usar de verdade, abra o .env no Bloco de Notas e troque as senhas.
)
if not exist backups mkdir backups
echo Subindo o CRM... na primeira vez demora alguns minutos - baixa uns 3 GB.
docker compose up -d --build || (
  echo Falha ao subir. Leia a mensagem acima.
  pause
  exit /b 1
)
echo Aguardando o CRM responder...
for /l %%i in (1,1,30) do (
  curl -s http://localhost:8080/saude >nul 2>nul && goto pronto
  timeout /t 2 >nul
)
:pronto
start "" http://localhost:8080
start "" http://localhost:8025
echo.
echo CRM ............ http://localhost:8080   (usuario e senha: linha CRM_USUARIOS do .env)
echo E-mails teste .. http://localhost:8025   (nada sai de verdade; tudo cai aqui)
echo Backups ........ pasta backups\
pause
