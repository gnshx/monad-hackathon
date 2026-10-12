#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_DIR="/home/ganesh/Desktop/monad-hackathon"
STATE_DIR="$WORKSPACE_DIR/.monitor-state"
mkdir -p "$STATE_DIR"

LAST_CHANGE_FILE="$STATE_DIR/last_change_timestamp.txt"
LAST_STATUS_FILE="$STATE_DIR/last_git_status.txt"
LAST_COMMIT_FILE="$STATE_DIR/last_commit_hash.txt"

NOW=$(date +%s)
CURRENT_HOUR=$(date +%H)

# Initialize state files if missing
if [ ! -f "$LAST_CHANGE_FILE" ]; then
  echo "$NOW" > "$LAST_CHANGE_FILE"
fi

cd "$WORKSPACE_DIR"
git fetch origin main --quiet || true

LOCAL_DIFF=$(git status --porcelain)
CURRENT_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/main)

PREV_STATUS=""
[ -f "$LAST_STATUS_FILE" ] && PREV_STATUS=$(cat "$LAST_STATUS_FILE")

PREV_COMMIT=""
[ -f "$LAST_COMMIT_FILE" ] && PREV_COMMIT=$(cat "$LAST_COMMIT_FILE")

HAS_CHANGE=false

if [ "$LOCAL_DIFF" != "$PREV_STATUS" ]; then
  HAS_CHANGE=true
  echo "[ACTIVITY DETECTED] Local files modified or changed:"
  git status --short
fi

if [ "$CURRENT_COMMIT" != "$PREV_COMMIT" ] || [ "$CURRENT_COMMIT" != "$REMOTE_COMMIT" ]; then
  HAS_CHANGE=true
  echo "[ACTIVITY DETECTED] Git commit changed or diverged (HEAD=$CURRENT_COMMIT, REMOTE=$REMOTE_COMMIT)"
fi

if [ "$HAS_CHANGE" = true ]; then
  echo "$NOW" > "$LAST_CHANGE_FILE"
  echo "$LOCAL_DIFF" > "$LAST_STATUS_FILE"
  echo "$CURRENT_COMMIT" > "$LAST_COMMIT_FILE"
  echo "[VERIFICATION] Validating TypeScript types..."
  npx tsc --project apps/web/tsconfig.json --noEmit
  echo "[VERIFICATION PASSED] Type check clean."
else
  LAST_CHANGE=$(cat "$LAST_CHANGE_FILE")
  DIFF_SECONDS=$((NOW - LAST_CHANGE))
  DIFF_MINUTES=$((DIFF_SECONDS / 60))
  echo "[STABLE] No local or remote modifications detected. Idle time: ${DIFF_MINUTES} minutes."

  if [ "$DIFF_SECONDS" -ge 7200 ]; then
    echo "[INACTIVITY TIMEOUT] No changes detected for 2 hours (>= 7200s). Auto-stopping timer as requested."
    exit 2
  fi
fi

if [ "$CURRENT_HOUR" -ge 10 ] && [ "$CURRENT_HOUR" -lt 20 ]; then
  echo "[MORNING COMPLETE] Reached 10:00 AM morning target. Stopping monitor."
  exit 3
fi

exit 0
