# TODO — MVP Game Foundation

## Completed issues ✅

These issues can be marked as closed.

| Issue | Notes |
|---|---|
| Angular frontend initialization (console-like UI) | Console theme, components, tmux-like layout |
| Recruit model | `Recruit` interface with `id`, `name`, `stats` (PHY/MEN/SOC at 0/3/5) |
| Mission structure: before → event → return | EN_ROUTE → EVENT → RETURN → COMPLETED phases with timer |
| Launching a mission | `mission start <id> <recruitId>` command, guard against a recruit already on a mission |
| Tracking missions in progress | ASCII bar + phase in MissionDetail and Dashboard |
| Narrative logs (AI + recruits) | Random pool per phase, [IA] and [RECRUIT] voices |
| Console-like interface: dashboard | Overview with counters, active missions, available recruits |
| Console-like interface: recruits | List (Available/In Mission status) + detail with stat bars |
| Console-like interface: available missions | Table with status, progress, assigned recruit |
| Console-like interface: missions in progress | MissionDetail panel with ASCII bar and phases |
| Console-like interface: logs | Global log (start/end) + detailed logs per mission |

---

## Partially complete issues ⚠️

These issues have a working frontend base but need a real backend to be considered closed.

| Issue | What's missing |
|---|---|
| Technical logs | [SYS] logs exist but don't detail dice rolls (since rolls don't exist yet) |
| Node.js backend initialization | The Express project exists (`server/index.js`) but has no routes — needs to be wired up once the DB is ready |

---

## Next steps by block

### Block 1 — Game system (pure logic, frontend)
These three issues form an independent block that can be done without a backend.

1. **Roll system: dice table**
   - Define the stat → number of dice mapping (e.g. stat 0 = 0d6, stat 5 = 2d6, stat 10 = 3d6)
   - Implement `rollDice(stat: number): number` in a dedicated service

2. **Roll system: resolution**
   - During the EVENT phase: roll `1d20 + rollDice(stat)` and compare it to the mission's DC
   - Store the result in `MissionState`
   - Add the DC and the stat used to the Mission model

3. **Recruit death / survival**
   - If the roll < DC: mark the recruit as dead in `GameService`
   - Emit a death [SYS] log and a last-words [RECRUIT] log
   - Prevent a dead recruit from being assigned to a new mission

### Block 2 — Dynamic recruits (frontend)
Depends on Block 1 for state (dead/alive).

4. **Candidate generation**
   - Generate N candidates with random names and stats (0, 3, 5 distributed randomly)
   - `candidate list` command + CandidateList panel

5. **Console-like interface: candidates**
   - Panel displaying available candidates with their stats

6. **Recruiting recruits**
   - `recruit hire <candidateId>` command: moves the candidate into the recruits list

### Block 3 — Backend and persistence
Depends on Blocks 1 and 2 to know the final schema.

7. **Minimal PostgreSQL schema**
   - Tables: `recruits`, `missions_active`, `missions_logs`, `config`
   - Versioned migrations

8. **Real-time system: storing the timestamp**
   - Store `last_updated_at` per session/player in the database

9. **Real-time system: delta calculation**
   - On load: compute `Date.now() - last_updated_at`

10. **Real-time system: time catch-up**
    - Replay missed ticks for missions in progress when the player returns

11. **Node.js backend routes**
    - `GET /state`: full state (recruits, missions, logs)
    - `POST /mission/start`, `POST /mission/stop`
    - `GET /missions/:id/logs`

### Block 4 — DevOps
To be done last, once the backend is functional.

12. **Reading missions from config.json**
    - Move hardcoded missions to `server/config.json`
    - `GET /config/missions` route consumed by the frontend

13. **Containerization with Podman**
    - Multi-stage Podmanfile for frontend and backend
    - Configurable ports exposed via `.env`
