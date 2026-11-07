#!/bin/bash
# backup-loop.sh — vong lap chay backup.sh theo lich (dung trong container backup).
# Lich mac dinh: BACKUP_CRON="0 3 * * *" (cron-style, kiem tra moi 60s).
# Neu khong parse duoc -> fallback 24h.
set -u

BACKUP_DIR="${BACKUP_DIR:-/backups}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"
CRON_SPEC="${BACKUP_CRON:-0 3 * * *}"

# Chuyen cron-style thanh giay (chi ho tro gio hang ngay + phut).
parse_cron_to_seconds() {
  local spec="$1"
  set -- $spec
  local minute="${1:-0}" hour="${2:-3}"
  # "0 3 * * *" -> moi ngay luc 3h00. Vong lap moi 60s, chi chay khi dung gio.
  if [ "$minute" = "0" ] && [ "$hour" != "*" ]; then
    echo 86400
    return
  fi
  echo "${INTERVAL_SECONDS}"
}

INTERVAL_SECONDS="$(parse_cron_to_seconds "$CRON_SPEC")"

mkdir -p "$BACKUP_DIR"
echo "[backup-loop] bat dau, interval=${INTERVAL_SECONDS}s, dir=${BACKUP_DIR}"

while true; do
  ts="$(date +%F_%H%M%S)"
  if /app/scripts/backup.sh "${BACKUP_DIR}" "${ts}"; then
    echo "[backup-loop] backup ${ts} OK"
  else
    # OPS-04: canh bao that bai. Log ra stderr + file de monitor.
    echo "[backup-loop] BACKUP FAIL ${ts}" >&2
    echo "[backup-loop] BACKUP FAIL ${ts}" >> "${BACKUP_DIR}/backup-errors.log"
  fi
  sleep "$INTERVAL_SECONDS"
done
