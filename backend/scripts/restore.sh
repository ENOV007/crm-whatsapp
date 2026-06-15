#!/bin/bash
set -euo pipefail

BACKUP_DATE="$1"
TARGET_DB_URL="$2"

if [ -z "$BACKUP_DATE" ] || [ -z "$TARGET_DB_URL" ]; then
  echo "Uso: ./restore.sh <YYYYMMDD> <database-url>"
  echo "Ejemplo: ./restore.sh 20260615 postgresql://..."
  exit 1
fi

RESTORE_DIR="/tmp/restore_$$"
mkdir -p "$RESTORE_DIR"

echo "=== Restaurando backup del $BACKUP_DATE ==="

DB_FILE=$(rclone ls "gdrive:CRM-Backups/daily/" | grep "crm_db_${BACKUP_DATE}" | grep -v sha256 | head -1 | awk '{print $2}')
CODE_FILE=$(rclone ls "gdrive:CRM-Backups/daily/" | grep "crm_code_${BACKUP_DATE}" | head -1 | awk '{print $2}')

if [ -z "$DB_FILE" ]; then
  echo "ERROR: No se encontro backup de DB para $BACKUP_DATE"
  exit 1
fi

echo "Descargando DB backup..."
rclone copy "gdrive:CRM-Backups/daily/$DB_FILE" "$RESTORE_DIR/"

if [ -f "$RESTORE_DIR/${DB_FILE}.sha256" ]; then
  echo "Verificando integridad..."
  cd "$RESTORE_DIR"
  sha256sum -c "${DB_FILE}.sha256"
  cd -
fi

gunzip "$RESTORE_DIR/$DB_FILE"
DUMP_FILE="$RESTORE_DIR/${DB_FILE%.gz}"

echo "Restaurando base de datos..."
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --no-acl \
  "$TARGET_DB_URL" \
  "$DUMP_FILE"

if [ -n "$CODE_FILE" ]; then
  echo "Descargando codigo backup..."
  rclone copy "gdrive:CRM-Backups/daily/$CODE_FILE" "$RESTORE_DIR/"
  echo "Codigo backup disponible en: gdrive:CRM-Backups/daily/$CODE_FILE"
fi

rm -rf "$RESTORE_DIR"

echo ""
echo "=== Restore completado ==="
