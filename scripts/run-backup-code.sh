#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="crm_code_${TIMESTAMP}"
BACKUP_DIR="/tmp/backups"

mkdir -p "$BACKUP_DIR"

echo "=== Backup codigo: $BACKUP_NAME ==="

git archive HEAD \
  --output="$BACKUP_DIR/$BACKUP_NAME.tar.gz" \
  --prefix="proyecto-crm/"

FILE_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_NAME.tar.gz" | cut -f1)
echo "Code backup: $FILE_SIZE"

rclone copy "$BACKUP_DIR/$BACKUP_NAME.tar.gz" "gdrive:CRM-Backups/weekly/" --checksum

rm -f "$BACKUP_DIR/$BACKUP_NAME"*

echo "=== Code backup completado ==="
