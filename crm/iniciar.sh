#!/bin/sh
# Delta CRM — sobe tudo (Linux, macOS ou a VPS)
cd "$(dirname "$0")"
docker version >/dev/null 2>&1 || { echo "Docker não está rodando."; exit 1; }
[ -f .env ] || { cp .env.example .env; echo "Criei o .env de teste — troque as senhas antes de usar de verdade."; }
mkdir -p backups && chmod 777 backups
docker compose up -d --build && echo "CRM: http://localhost:8080 · e-mails de teste: http://localhost:8025"
