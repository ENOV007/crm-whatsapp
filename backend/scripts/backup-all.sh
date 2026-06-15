#!/bin/bash
set -euo pipefail

echo "========================================="
echo " CRM Backup - $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "========================================="

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

bash "$SCRIPT_DIR/backup-db.sh"
bash "$SCRIPT_DIR/backup-code.sh"
bash "$SCRIPT_DIR/cleanup-backups.sh"

echo ""
echo "=== Todos los backups completados ==="
