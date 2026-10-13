#!/usr/bin/env bash
set -u

WORKSPACE_DIR="/home/ganesh/Desktop/monad-hackathon"
STATE_DIR="$WORKSPACE_DIR/.monitor-state"
CURRENT_URL_FILE="$STATE_DIR/current_tunnel_url.txt"
mkdir -p "$STATE_DIR"

while true; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting persistent SSH tunnel to localhost.run..."
  ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -R 80:localhost:3000 nokey@localhost.run 2>&1 | while IFS= read -r line; do
    echo "$line"
    if [[ "$line" =~ ([a-zA-Z0-9]+\.lhr\.life) ]]; then
      DOMAIN="${BASH_REMATCH[1]}"
      URL="https://$DOMAIN"
      echo "[TUNNEL DETECTED] $URL"
      echo "$URL" > "$CURRENT_URL_FILE"
    fi
  done
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Tunnel closed. Reconnecting in 3s..."
  sleep 3
done
