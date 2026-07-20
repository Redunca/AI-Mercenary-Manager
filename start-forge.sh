#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
  echo ""
  echo "Stopping..."
  kill "$SERVER_PID" "$ANGULAR_PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

echo "Starting the Opera Forge server..."
cd "$ROOT/opera-forge/server" && npm run dev &
SERVER_PID=$!

echo "Starting the Opera Forge frontend..."
cd "$ROOT/opera-forge/client" && npm start &
ANGULAR_PID=$!

wait "$SERVER_PID" "$ANGULAR_PID"
