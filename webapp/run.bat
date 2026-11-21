@echo off
REM Simulador Hibrido PySAM - execucao local no Windows
REM   run.bat        compila a interface (se preciso) e inicia em http://127.0.0.1:8000
REM   run.bat dev    modo desenvolvimento: API (:8000) + Vite (:5173)
cd /d "%~dp0"
if not exist .venv (
  python -m venv .venv
  .venv\Scripts\python -m pip install --upgrade pip
  .venv\Scripts\pip install -r requirements.txt
)
if "%1"=="dev" goto dev
if not exist frontend\dist\index.html (
  where npm >nul 2>nul || (echo Node.js/npm nao encontrado. Instale Node 18+ ou use docker compose up --build & exit /b 1)
  pushd frontend
  if not exist node_modules call npm ci
  call npm run build
  popd
)
echo Simulador em http://127.0.0.1:8000
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
goto :eof
:dev
pushd frontend
if not exist node_modules call npm ci
popd
start "API" .venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
cd frontend
npm run dev
