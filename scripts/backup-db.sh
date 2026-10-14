#!/usr/bin/env bash
# Backup diário do banco de produção (Postgres do compose na VPS).
#
#   crontab -e  →  0 3 * * * $HOME/ontime/scripts/backup-db.sh >> $HOME/backups/backup.log 2>&1
#
# Gera ~/backups/ontime-AAAA-MM-DD_HHMM.sql.gz e apaga os com mais de RETENCAO_DIAS.
# Com BACKUP_S3_URI (ex.: s3://meu-bucket/ontime) no .env e o AWS CLI instalado,
# também copia para o S3 — o disco da VPS sozinho não é backup.
# Restaurar: gunzip -c arquivo.sql.gz | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DESTINO="${BACKUP_DIR:-$HOME/backups}"
RETENCAO_DIAS="${RETENCAO_DIAS:-14}"

cd "$APP_DIR"
# POSTGRES_USER, POSTGRES_DB e o opcional BACKUP_S3_URI vêm do .env da produção.
set -a
# shellcheck disable=SC1091
source .env
set +a

mkdir -p "$DESTINO"
arquivo="$DESTINO/ontime-$(date +%F_%H%M).sql.gz"

# -T: sem TTY (cron). --clean --if-exists: o dump restaura por cima de um banco existente.
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
	| gzip > "$arquivo.tmp"
mv "$arquivo.tmp" "$arquivo"
echo "$(date '+%F %T') ✓ $(basename "$arquivo") ($(du -h "$arquivo" | cut -f1))"

if [[ -n "${BACKUP_S3_URI:-}" ]]; then
	aws s3 cp "$arquivo" "$BACKUP_S3_URI/" --only-show-errors
	echo "$(date '+%F %T') ✓ enviado para $BACKUP_S3_URI"
fi

find "$DESTINO" -name 'ontime-*.sql.gz' -mtime +"$RETENCAO_DIAS" -delete
