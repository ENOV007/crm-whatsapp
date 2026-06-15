#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="crm_db_${TIMESTAMP}"
BACKUP_DIR="/tmp/backups"

mkdir -p "$BACKUP_DIR"

echo "=== Backup DB: $BACKUP_NAME ==="

pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --no-acl \
  -f "$BACKUP_DIR/$BACKUP_NAME.dump"

gzip -9 "$BACKUP_DIR/$BACKUP_NAME.dump"
GZIP_FILE="$BACKUP_DIR/$BACKUP_NAME.dump.gz"

FILE_SIZE=$(du -h "$GZIP_FILE" | cut -f1)
echo "DB backup: $FILE_SIZE"

sha256sum "$GZIP_FILE" > "${GZIP_FILE}.sha256"

rclone copy "$GZIP_FILE" "gdrive:CRM-Backups/daily/" --checksum
rclone copy "${GZIP_FILE}.sha256" "gdrive:CRM-Backups/daily/" --checksum

rm -f "$BACKUP_DIR/$BACKUP_NAME"*

echo "=== DB backup completado ==="
