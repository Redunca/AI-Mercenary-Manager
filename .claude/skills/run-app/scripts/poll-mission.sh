#!/bin/bash
# Polls the live game state until a given mission id leaves the active
# mission board (i.e. it resolved to success or failure -- see SKILL.md's
# "Missions run on real wall-clock timers" section for why this exists and
# why `status` reads as "gone" rather than "success"/"failed").
#
# Usage: poll-mission.sh <missionId> [maxWaitSeconds] [apiBase]
# Always run this via run_in_background:true / Monitor, never inline --
# a mission commonly takes 2-5 real-world minutes end to end.

set -e
MISSION_ID="${1:?Usage: poll-mission.sh <missionId> [maxWaitSeconds] [apiBase]}"
MAX_SECONDS="${2:-600}"
API_BASE="${3:-http://localhost:3000}"
TMP_FILE=$(mktemp)
trap 'rm -f "$TMP_FILE"' EXIT

elapsed=0
while [ "$elapsed" -lt "$MAX_SECONDS" ]; do
  sleep 5
  elapsed=$((elapsed + 5))
  curl -s -X POST "$API_BASE/api/game/sync" -o "$TMP_FILE"
  status=$(node -e "
    const d = require('$TMP_FILE');
    const m = d.missions.find(m => m.id === $MISSION_ID);
    console.log(m ? m.status : 'gone');
  ")
  echo "t=${elapsed}s status=$status"
  if echo "$status" | grep -qE "gone|success|failed"; then
    echo "MISSION_DONE:$status"
    exit 0
  fi
done

echo "MISSION_TIMEOUT after ${MAX_SECONDS}s"
exit 1
