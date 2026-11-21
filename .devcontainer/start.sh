#!/usr/bin/env bash
# Inicia o simulador em segundo plano na porta 8000 (executado a cada início do Codespace).
cd "$(dirname "$0")/../webapp"
pkill -f "uvicorn app.main:app" 2>/dev/null || true
nohup .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/simulador.log 2>&1 &
echo "Simulador iniciando na porta 8000 (log: /tmp/simulador.log)"
