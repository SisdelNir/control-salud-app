#!/bin/bash
# Instala el cron job de backup automático diario a las 3 AM
# Uso: bash setup-backup-cron.sh

mkdir -p /Users/nir/Desktop/DR-SISDEL/backups

# Agregar cron job (si no existe ya)
CRON_JOB="0 3 * * * cd /Users/nir/Desktop/DR-SISDEL && node backup-firestore.js >> /Users/nir/Desktop/DR-SISDEL/backups/backup.log 2>&1"

(crontab -l 2>/dev/null | grep -v "backup-firestore"; echo "$CRON_JOB") | crontab -

echo "✅ Backup automático configurado: cada día a las 3:00 AM"
echo "   Los backups se guardarán en: /Users/nir/Desktop/DR-SISDEL/backups/"
echo "   Para verificar: crontab -l"
