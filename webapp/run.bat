@echo off
REM Simulador Hibrido PySAM - execucao local no Windows
REM   run.bat        instala (1a vez), compila a interface e inicia em http://127.0.0.1:8000
REM   run.bat dev    modo desenvolvimento: API na porta 8000 + Vite na porta 5173
setlocal
cd /d "%~dp0"

set "PY=python"
where python >nul 2>nul || set "PY=py -3"
%PY% --version >nul 2>nul || (
  echo Python nao encontrado. Instale o Python 3.12 em https://www.python.org/downloads/ marcando "Add python.exe to PATH".
  pause
  exit /b 1
)

if not exist .venv\instalado.txt (
  echo Instalando dependencias Python - pode levar alguns minutos...
  if not exist .venv %PY% -m venv .venv
  .venv\Scripts\python -m pip install --upgrade pip
  .venv\Scripts\python -m pip install -r requirements.txt || (
    echo Falha ao instalar as dependencias Python. Verifique a internet e rode run.bat de novo.
    pause
    exit /b 1
  )
  echo ok> .venv\instalado.txt
)

if "%1"=="dev" goto dev

if not exist frontend\dist\index.html (
  where npm >nul 2>nul || (
    echo Node.js nao encontrado. Instale o Node.js LTS em https://nodejs.org e rode run.bat de novo.
    pause
    exit /b 1
  )
  echo Compilando a interface...
  pushd frontend
  if not exist node_modules call npm ci
  call npm run build
  popd
)

echo.
echo Simulador em http://127.0.0.1:8000  - feche esta janela para encerrar.
start "" http://127.0.0.1:8000
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
goto :eof

:dev
pushd frontend
if not exist node_modules call npm ci
popd
start "API" .venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
cd frontend
npm run dev
