#!/bin/bash
# backup.sh — sqlite .backup (dung WAL, cam .dump) + pg_dump prod + test restore
set -e
DB="${DATABASE_PATH:-./data/bizops.db}"
OUT="backups/bizops-$(date +%F_%H%M).db"
mkdir -p backups
if [ -n "$PG_HOST" ]; then
  echo "[backup] pg_dump -> $OUT.sql"
  pg_dump -h "$PG_HOST" -U "$PG_USER" -d "$PG_DB" -F c -f "$OUT.dump"
  echo "[backup] xong. Test restore hang tuan: pg_restore -d ${PG_DB}_restore $OUT.dump"
else
  echo "[backup] sqlite .backup -> $OUT"
  sqlite3 "$DB" ".backup '$OUT'"
  echo "[backup] xong. Test restore hang tuan: sqlite3 /tmp/restore-test.db \".restore '$OUT'\" && sqlite3 /tmp/restore-test.db 'PRAGMA integrity_check;'"
fi
# cron ghi chu (khong chay o day — 02d-1 dien cron 2h chay script nay):
# 0 2 * * * /app/scripts/backup.sh >> /var/log/bizops-backup.log 2>&1
