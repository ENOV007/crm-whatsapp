#!/bin/bash
set -euo pipefail

echo "=== Limpiando backups antiguos ==="

rclone delete "gdrive:CRM-Backups/daily/" --min-age 7d --exclude "*.sha256" 2>/dev/null || true
rclone delete "gdrive:CRM-Backups/weekly/" --min-age 28d --exclude "*.sha256" 2>/dev/null || true

echo "=== Limpieza completada ==="
