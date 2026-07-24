---
name: run-app
description: Launches AI Mercenary Manager (Postgres + Node server + Angular frontend) end to end and drives its terminal-style UI in a headless browser -- for manual playtesting, verifying a change actually works, or scripted walkthroughs (tutorial, an Opera, a shop/mission flow). Use whenever asked to run, start, playtest, or click through this app, or to confirm a change works in the real UI rather than just in tests.
metadata:
  author: playtest session (tutorial + first post-tutorial Opera)
  version: "1.0.0"
---

# Running and driving AI Mercenary Manager

This assumes no prior context -- read it fresh each time. It captures what
had to be discovered/improvised the first time this app was actually run
and clicked through in this environment (headless container, no browser
window, no `chromium-cli`).

## The stack

Three independent pieces, all required:

| Piece | Where | Port | Notes |
|---|---|---|---|
| Postgres | `docker-compose.yml` (root) | 5432 | via `podman-compose`, **not** `docker-compose` -- this environment has `docker` aliased to `podman` and `docker-compose` isn't installed at all. |
| Backend | `server/` | 3000 | Express. Runs DB migrations + `initGame()` itself on boot (`server/index.js`) -- nothing to migrate manually. |
| Frontend | `mercenai/` | 4200 | Angular dev server. `proxy.conf.json` forwards `/api` to `127.0.0.1:3000` -- this is already wired into the default `ng serve` config, don't add another proxy. |

`opera-forge/` (the standalone Opera-graph editor) is a separate app entirely
and irrelevant to running the live game -- ignore it unless asked to edit
Opera content itself.

## Starting it

```bash
# 1. Postgres (idempotent -- safe to run even if already up)
podman-compose -f docker-compose.yml up -d
timeout 30 bash -c 'until podman exec ai-mercenary-manager_postgres_1 pg_isready -U mercenai -d mercenai >/dev/null 2>&1; do sleep 1; done'
# If that container name is ever wrong: podman ps --filter ancestor=docker.io/library/postgres:16-alpine --format '{{.Names}}'

# 2. Backend
cd server && npm run dev > /tmp/server.log 2>&1 &
disown
timeout 30 bash -c 'until curl -sf http://localhost:3000/health >/dev/null; do sleep 1; done'
```

**Before starting the frontend, check whether it's already running** --
`curl -sf http://localhost:4200 >/dev/null`. If something is already
listening on 4200, **use it, don't start a second one**: `ng serve` detects
the port conflict and drops into an interactive
`Would you like to use a different port? (Y/n)` prompt that hangs forever
under a non-interactive shell (no stdin to answer it), leaving an orphaned
process. Only if nothing answers on 4200:

```bash
cd mercenai && npm start > /tmp/mercenai.log 2>&1 &
disown
timeout 60 bash -c 'until curl -sf http://localhost:4200 >/dev/null; do sleep 2; done'
```

Stop backend/frontend with `lsof -ti:3000 -sTCP:LISTEN | xargs -r kill` /
`:4200` -- but if you found a pre-existing frontend on 4200, it's not yours
to kill; leave it running when you're done.

## Driving the UI

`chromium-cli` is not installed in this environment. `puppeteer-core` is
(globally, at `/usr/local/lib/node_modules/puppeteer-core` -- if a fresh
container doesn't have it: `npm install -g puppeteer-core`, see the repo's
memory/prior session for why `-g` needs either `sudo` or a user-writable
npm prefix here). It has no bundled browser, so point it at the system
Chrome:

```bash
mkdir -p /tmp/chrome-profile
/usr/bin/google-chrome \
  --headless=new --no-sandbox --disable-gpu \
  --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 \
  --window-size=1360,900 --user-data-dir=/tmp/chrome-profile \
  about:blank > /tmp/chrome.log 2>&1 &
disown
curl -s http://127.0.0.1:9222/json/version   # confirms it's up
```

Then use this skill's bundled driver, `scripts/pw.js`, instead of writing a
new one:

```bash
node <skill-dir>/scripts/pw.js goto http://localhost:4200
node <skill-dir>/scripts/pw.js type "dev reboot confirm"
node <skill-dir>/scripts/pw.js text          # dump the page's visible text -- more reliable than a screenshot for reading exact game state
node <skill-dir>/scripts/pw.js screenshot 00-dashboard   # -> scripts/../pw-shots/00-dashboard.png; Read the PNG to actually look at it
```

Commands: `goto <url>` · `type <text>` (clicks the terminal textarea, types,
presses Enter) · `focus-panel <index>` (click the Nth panel first) · `text`
· `screenshot <name>` · `wait <ms>` · `eval <js>`.

**Gotcha: multi-panel layouts.** After `split-v`/`split-h` there are multiple
`textarea.command-input` elements; `type` always targets the first one in
DOM order, not whichever panel a human last clicked. Use `focus-panel
<index>` first if you need a specific one, and re-derive the index from a
`text` dump rather than assuming panel order matches split history.

Kill the driver browser when done: `pkill -f "remote-debugging-port=9222"`
-- it's scratch infrastructure, not part of the app.

## Cleaning the database

The in-game `dev reboot confirm` command (typed into the terminal like any
other command) wipes every player-scoped table and rebootstraps a fresh
player -- it's the intended reset path, not gated behind any env check
(single-player local game, see `game.service.js`'s own comment on this).
`shop_items` (the master catalog) is deliberately left untouched by it.

## One representative walkthrough: tutorial + first Opera

This proves the whole stack end-to-end, not just that a page loads.

1. `dev reboot confirm` → dashboard shows a fresh player and a hint
   `[ opera detail <id> ] to continue the tutorial`.
2. `opera detail <id>` shows the tutorial's task checklist and a `[SYS]` log.
   Follow the tasks literally (`split-v`, `split-h`, `help`, `recruit hire
   <id>`, `ship assign <shipId> <recruitId>`, `mission start <templateId>
   <shipId>`, `shop buy <itemId>`, `equip <equipmentId>`, `ship load
   <shipId> <consumableId>`, `self`) -- re-check `opera detail <id>` after
   each action; the task list only ticks once the underlying
   `action_performed` condition is satisfied server-side, which can lag a
   beat behind the command that caused it.
3. Once the tutorial completes, 2-3 more Operas start automatically in
   parallel (`opera list` to see them) -- pick one, `opera detail <id>` to
   read its current task/pending choice, `choose <optionId>` to answer a
   choice, or find its seeded mission via `mission list` (opera-seeded
   missions are always visible regardless of the board's normal cap) and
   run it like any other mission.

**Missions run on real wall-clock timers** (roughly 2-5 minutes end to end
for early-game difficulty: EN_ROUTE → EVENT → RETURN → COMPLETED). Two dev
commands can skip the wait, typed into the terminal like any other command:
`mission start <templateId> <shipId> --dev` backdates a mission's
`started_at` at creation time so it resolves to COMPLETED before the
command even returns; `dev finish-mission <templateId>` does the same to a
mission that's already running (e.g. one started without `--dev`, or one
you're mid-playthrough on). Both just fast-forward the same wall-clock
elapsed-time resolution a real playthrough would hit anyway -- no separate
resolution path, so outcomes (success/failure, events, rewards) are exactly
as real. Never busy-wait inline even when you forget to use these --
fall back to the bundled poller in the background and let its completion
notification bring you back:

```bash
<skill-dir>/scripts/poll-mission.sh <missionId>   # run with run_in_background:true
```

It polls `POST /api/game/sync` and reports `MISSION_DONE:<status>`. Note it
reports the mission as **`gone`**, not `success`/`failed`: `buildGameState`
filters resolved missions out of the live board entirely (see
`game.service.js`'s `nonFinal` filter) -- check `mission -c` / `mission
list --completed` afterward, or query `opera_instances`/`purchase_history`
directly via `podman exec ai-mercenary-manager_postgres_1 psql -U mercenai
-d mercenai -c "..."`, to see the actual outcome.

## Known quirks (don't re-diagnose these as your own bug)

None currently known. Three were found and fixed during the 2026-07-23
tutorial + Opera playtest (stale French shop rows surviving `ON CONFLICT DO
NOTHING` reseeds, fixed by `V022__fix_french_shop_items.sql`; 9 Opera-seeded
shop items missing from the catalog entirely, fixed by
`V023__seed_missing_opera_shop_items.sql`; and `resolveTags()` in
`opera.service.js` only publishing one random mission type's tags instead
of the full set any template might reference, which is why
`{securityGroupName}` used to render literally in
`two-gangs-one-contract.json` about 5 times out of 6) -- if you hit a new
one, add it here.

## Verification checklist

- [ ] `curl http://localhost:3000/health` → `{"status":"ok"}`
- [ ] `curl http://localhost:4200/api/game/state` → real JSON (proves the
      Angular proxy is actually reaching the backend, not just that both
      ports independently respond)
- [ ] A `pw.js screenshot` actually shows the terminal UI, not a blank page
      or a browser error -- **look at it**, don't just check the exit code
- [ ] `pw.js eval "!!window.ng"` or similar sanity check if the screenshot
      looks suspicious (Angular hydration failed vs. genuinely blank)
