#!/usr/bin/env bash
# Instala as dependências e compila a interface (executado uma vez, na criação do Codespace).
set -euo pipefail
cd "$(dirname "$0")/../webapp"
python -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
cd frontend
npm ci --no-audit --no-fund
npm run build
