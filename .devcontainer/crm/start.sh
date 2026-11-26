#!/bin/bash
# Sobe o Delta CRM dentro do Codespace (dá para usar pelo navegador do celular).
set -e
cd "$(dirname "$0")/../../crm"
URL="http://localhost:8080"
if [ -n "$CODESPACE_NAME" ]; then URL="https://${CODESPACE_NAME}-8080.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"; fi
if [ ! -f .env ]; then
  cp .env.example .env
  SENHA=$(head -c 9 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 10)
  sed -i "s#^CRM_USUARIOS=.*#CRM_USUARIOS=admin@deltasolar.com.br:${SENHA}#" .env
fi
sed -i "s#^PUBLIC_URL=.*#PUBLIC_URL=${URL}#" .env
for i in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 2; done
mkdir -p backups && chmod 777 backups
docker compose up -d --build
# Porta 8080 pública: o cliente (sem conta GitHub) consegue abrir os links de proposta e contrato
[ -n "$CODESPACE_NAME" ] && gh codespace ports visibility 8080:public -c "$CODESPACE_NAME" >/dev/null 2>&1 || true
echo
echo "=============================================================="
echo " CRM:      $URL"
echo " Login:    $(grep ^CRM_USUARIOS .env | cut -d= -f2 | sed 's/:/  senha: /')"
echo " E-mails:  aba PORTS, porta 8025"
echo "=============================================================="
