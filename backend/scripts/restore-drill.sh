#!/bin/bash
# restore-drill.sh — kiem chung backup thuc su restore duoc (OPS-04).
#
# Dung:
#   ./restore-drill.sh <file-backup.dump>   # PostgreSQL custom format
#   ./restore-drill.sh <file-backup.db>     # SQLite
#
# Restore vao DB RIENG (khong phai production DB) roi chay kiem tra du lieu.
# Exit 0 = drill pass.
set -u

BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup-file>" >&2
  exit 2
fi
if [ ! -f "$BACKUP_FILE" ]; then
  echo "[drill] KHONG tim thay file: ${BACKUP_FILE}" >&2
  exit 1
fi

DRILL_DB="${PG_DRILL_DB:-bizops_restore_drill}"

# --- PostgreSQL ---------------------------------------------------------------
case "$BACKUP_FILE" in
  *.dump)
    if [ -z "${PG_HOST:-}" ]; then
      echo "[drill] can PG_HOST de restore file .dump" >&2
      exit 2
    fi
    echo "[drill] tao DB rieng ${DRILL_DB}"
    psql -h "$PG_HOST" -p "${PG_PORT:-5432}" -U "$PG_USER" -d postgres \
      -c "DROP DATABASE IF EXISTS ${DRILL_DB}" >/dev/null 2>&1
    psql -h "$PG_HOST" -p "${PG_PORT:-5432}" -U "$PG_USER" -d postgres \
      -c "CREATE DATABASE ${DRILL_DB}" >/dev/null

    echo "[drill] restore ${BACKUP_FILE} -> ${DRILL_DB}"
    if ! pg_restore -h "$PG_HOST" -p "${PG_PORT:-5432}" -U "$PG_USER" -d "$DRILL_DB" \
          --no-owner --no-acl "${BACKUP_FILE}"; then
      echo "[drill] RESTORE FAIL" >&2
      psql -h "$PG_HOST" -p "${PG_PORT:-5432}" -U "$PG_USER" -d postgres \
        -c "DROP DATABASE IF EXISTS ${DRILL_DB}" >/dev/null 2>&1
      exit 1
    fi

    # Kiem tra du lieu that su co trong DB vua restore.
    TABLES=$(psql -h "$PG_HOST" -p "${PG_PORT:-5432}" -U "$PG_USER" -d "$DRILL_DB" \
      -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'")
    USERS=$(psql -h "$PG_HOST" -p "${PG_PORT:-5432}" -U "$PG_USER" -d "$DRILL_DB" \
      -t -c "SELECT COUNT(*) FROM users" 2>/dev/null || echo 0)
    echo "[drill] tables=${TABLES} users=${USERS}"
    if [ "${TABLES}" -lt 10 ]; then
      echo "[drill] FAIL: sau restore chi co ${TABLES} bang (mong doi >=10)" >&2
      psql -h "$PG_HOST" -p "${PG_PORT:-5432}" -U "$PG_USER" -d postgres \
        -c "DROP DATABASE IF EXISTS ${DRILL_DB}" >/dev/null 2>&1
      exit 1
    fi

    psql -h "$PG_HOST" -p "${PG_PORT:-5432}" -U "$PG_USER" -d postgres \
      -c "DROP DATABASE IF EXISTS ${DRILL_DB}" >/dev/null 2>&1
    echo "[drill] DRILL PASS"
    ;;

  *.db)
    TMP="/tmp/drill-$(date +%s).db"
    echo "[drill] restore sqlite ${BACKUP_FILE} -> ${TMP}"
    if ! sqlite3 "$TMP" ".restore '${BACKUP_FILE}'"; then
      echo "[drill] RESTORE FAIL" >&2
      rm -f "$TMP"
      exit 1
    fi
    IC=$(sqlite3 "$TMP" 'PRAGMA integrity_check;')
    TABLES=$(sqlite3 "$TMP" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';")
    echo "[drill] integrity=${IC} tables=${TABLES}"
    if [ "$IC" != "ok" ] || [ "${TABLES}" -lt 10 ]; then
      echo "[drill] FAIL: integrity=${IC} tables=${TABLES}" >&2
      rm -f "$TMP"
      exit 1
    fi
    rm -f "$TMP"
    echo "[drill] DRILL PASS"
    ;;

  *)
    echo "[drill] file khong ho tro: ${BACKUP_FILE}" >&2
    exit 2
    ;;
esac
exit 0