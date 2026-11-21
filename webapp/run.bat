@echo off
REM Inicia o Simulador Hibrido PySAM em http://127.0.0.1:8000
cd /d "%~dp0"
if not exist .venv (
  python -m venv .venv
  .venv\Scripts\python -m pip install --upgrade pip
  .venv\Scripts\pip install -r requirements.txt
)
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
