#!/bin/bash
# backup.sh — backup PostgreSQL (prod) hoac SQLite (dev), kem retention + verify.
#
# Usage: backup.sh [OUT_DIR] [STAMP]
#   OUT_DIR  mac dinh: $BACKUP_DIR (neu set) hoac ./backups
#   STAMP    mac dinh: %F_%H%M%S
#
# OPS-04 yeu cau:
#   - backup chay duoc trong Docker image (dung image rieng co bash + pg_dump)
#   - file backup nam tren volume persistent, khong o writable layer
#   - retention (xoa file cu) + verify (restore thu vao DB rieng)
#   - canh bao that bai (exit code != 0 + ghi log loi)
set -u

OUT_DIR="${1:-${BACKUP_DIR:-./backups}}"
STAMP="${2:-$(date +%F_%H%M%S)}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$OUT_DIR"

# --- PostgreSQL (production) -------------------------------------------------
if [ -n "${PG_HOST:-}" ]; then
  OUT="${OUT_DIR}/bizops-${STAMP}.dump"
  echo "[backup] pg_dump ${PG_HOST}/${PG_DB} -> ${OUT}"
  # -F c = custom format (pg_restore), khong dump SQL text.
  # --no-owner: restore vao DB role khac duoc.
  if ! pg_dump -h "$PG_HOST" -p "${PG_PORT:-5432}" -U "$PG_USER" -d "$PG_DB" \
        -F c --no-owner --no-acl -f "${OUT}.tmp"; then
    echo "[backup] pg_dump FAIL" >&2
    rm -f "${OUT}.tmp"
    exit 1
  fi
  mv "${OUT}.tmp" "$OUT"

  # VERIFY: restore thu vao database tam de chung minh file khong hong.
  VERIFY_DB="${PG_DB}_restorecheck"
  echo "[backup] verify: restore thu vao ${VERIFY_DB}"
  if ! psql -h "$PG_HOST" -p "${PG_PORT:-5432}" -U "$PG_USER" -d postgres \
        -c "DROP DATABASE IF EXISTS ${VERIFY_DB}" >/dev/null 2>&1; then
    echo "[backup] verify: khong drop duoc ${VERIFY_DB} (bo qua verify)" >&2
  elif ! psql -h "$PG_HOST" -p "${PG_PORT:-5432}" -U "$PG_USER" -d postgres \
        -c "CREATE DATABASE ${VERIFY_DB}" >/dev/null 2>&1; then
    echo "[backup] verify: khong tao duoc ${VERIFY_DB} (bo qua verify)" >&2
  elif pg_restore -h "$PG_HOST" -p "${PG_PORT:-5432}" -U "$PG_USER" -d "$VERIFY_DB" \
        --no-owner --no-acl "${OUT}" >/dev/null 2>&1; then
    echo "[backup] verify OK: ${OUT} restore duoc vao ${VERIFY_DB}"
  else
    echo "[backup] verify FAIL: khong restore duoc ${OUT}" >&2
    psql -h "$PG_HOST" -p "${PG_PORT:-5432}" -U "$PG_USER" -d postgres \
      -c "DROP DATABASE IF EXISTS ${VERIFY_DB}" >/dev/null 2>&1
    exit 1
  fi
  psql -h "$PG_HOST" -p "${PG_PORT:-5432}" -U "$PG_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS ${VERIFY_DB}" >/dev/null 2>&1

  # --- SQLite (dev) ------------------------------------------------------------
else
  DB="${DATABASE_PATH:-./data/bizops.db}"
  OUT="${OUT_DIR}/bizops-${STAMP}.db"
  echo "[backup] sqlite .backup ${DB} -> ${OUT}"
  # Dung .backup (an toàn voi WAL), KHONG dung .dump.
  if ! sqlite3 "$DB" ".backup '${OUT}'"; then
    echo "[backup] sqlite .backup FAIL" >&2
    rm -f "$OUT"
    exit 1
  fi
  # VERIFY: integrity_check tren file backup.
  if [ "$(sqlite3 "$OUT" 'PRAGMA integrity_check;')" != "ok" ]; then
    echo "[backup] verify FAIL: integrity_check khong ok" >&2
    exit 1
  fi
  echo "[backup] verify OK: integrity_check ok"
fi

# --- Retention: xoa file backup cu hon RETENTION_DAYS ------------------------
if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  find "$OUT_DIR" -maxdepth 1 -type f \
       \( -name 'bizops-*.dump' -o -name 'bizops-*.db' \) \
       -mtime "+${RETENTION_DAYS}" -print -delete 2>/dev/null || true
  echo "[backup] retention: giu ${RETENTION_DAYS} ngay"
fi

echo "[backup] xong: ${OUT}"
exit 0
