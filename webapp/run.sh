#!/usr/bin/env bash
# Simulador Híbrido PySAM – execução local
#   ./run.sh         compila a interface (se preciso) e inicia em http://127.0.0.1:8000
#   ./run.sh dev     modo desenvolvimento: API com recarga automática (:8000) + Vite (:5173)
#   ./run.sh test    roda os testes (pytest)
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-8000}"

if [ ! -d .venv ]; then
  echo "» Criando ambiente Python (.venv)…"
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt
fi

build_frontend() {
  if ! command -v npm >/dev/null 2>&1; then
    echo "!! Node.js/npm não encontrado. Instale Node 18+ (https://nodejs.org)"
    exit 1
  fi
  echo "» Compilando a interface React…"
  (cd frontend && { [ -d node_modules ] || npm ci; } && npm run build)
}

case "${1:-}" in
  dev)
    (cd frontend && { [ -d node_modules ] || npm ci; })
    .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT" --reload &
    API=$!
    trap 'kill $API 2>/dev/null' EXIT
    echo "» Interface em desenvolvimento: http://127.0.0.1:5173"
    (cd frontend && npm run dev)
    ;;
  test)
    .venv/bin/pip install -q pytest httpx
    .venv/bin/python -m pytest -q
    ;;
  *)
    [ -f frontend/dist/index.html ] || build_frontend
    echo "» Simulador em http://127.0.0.1:$PORT"
    exec .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT"
    ;;
esac
