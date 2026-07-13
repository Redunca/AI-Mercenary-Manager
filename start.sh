#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
  echo ""
  echo "Stopping..."
  kill "$SERVER_PID" "$ANGULAR_PID" 2>/dev/null
  podman-compose -f "$ROOT/docker-compose.yml" stop
  exit 0
}
trap cleanup INT TERM

echo "Starting PostgreSQL..."
podman-compose -f "$ROOT/docker-compose.yml" up -d

echo "Starting the server..."
cd "$ROOT/server" && npm run dev &
SERVER_PID=$!

echo "Starting the Angular frontend..."
cd "$ROOT/mercenai" && npm start &
ANGULAR_PID=$!

wait "$SERVER_PID" "$ANGULAR_PID"
