#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
  echo ""
  echo "Arrêt en cours..."
  kill "$SERVER_PID" "$ANGULAR_PID" 2>/dev/null
  podman-compose -f "$ROOT/docker-compose.yml" stop
  exit 0
}
trap cleanup INT TERM

echo "Démarrage de PostgreSQL..."
podman-compose -f "$ROOT/docker-compose.yml" up -d

echo "Démarrage du serveur..."
cd "$ROOT/server" && npm run dev &
SERVER_PID=$!

echo "Démarrage du frontend Angular..."
cd "$ROOT/mercenai" && npm start &
ANGULAR_PID=$!

wait "$SERVER_PID" "$ANGULAR_PID"
