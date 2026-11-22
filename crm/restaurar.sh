#!/bin/sh
# Uso: ./restaurar.sh backups/daily/crm-AAAAMMDD.sql.gz
set -e
cd "$(dirname "$0")"
[ -f "$1" ] || { echo "Uso: $0 backups/daily/crm-AAAAMMDD.sql.gz"; exit 1; }
REL=${1#backups/}
printf "Os dados atuais serão SUBSTITUÍDOS por %s. Digite SIM: " "$1"; read OK; [ "$OK" = "SIM" ] || exit 0
docker compose exec -T backup /backup.sh >/dev/null 2>&1 || true
docker compose stop app
docker compose exec -T db dropdb -U crm --if-exists crm
docker compose exec -T db createdb -U crm crm
docker compose exec -T backup sh -c "gunzip -c '/backups/$REL' | PGPASSWORD=\$POSTGRES_PASSWORD psql -q -h db -U crm -d crm"
docker compose start app
echo "Restaurado."
