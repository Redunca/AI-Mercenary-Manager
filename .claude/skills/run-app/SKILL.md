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
`shop_items` (the master catalog) is deliberately left untouched by it, so
stale catalog data (see Known quirks below) survives a reboot.

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
for early-game difficulty: EN_ROUTE → EVENT → RETURN → COMPLETED) -- there
is no dev/admin command to fast-forward one. Never busy-wait on this
inline. Use the bundled poller in the background and let its completion
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

- **Stale French shop data.** Two ships ("Corsaire", "Frégate") carry French
  descriptions in the running DB, left over from before the project's
  English-only source-code migration. `seedShopItems()` in
  `shop.service.js` now has English text, but it seeds with `ON CONFLICT DO
  NOTHING`, so a DB seeded under the old data keeps the French rows
  forever -- `dev reboot` doesn't touch `shop_items`. Not something a
  playtest session should try to fix live; flag it, don't chase it.
- **Most non-tutorial Operas' seeded shop items don't exist in the
  catalog.** Only the tutorial's two quest items ("Recruit Training Vest",
  "Encrypted Data Chip") were ever actually inserted into `shop_items` (via
  `server/src/db/migrations/V017__add_opera.sql`). Every other Opera graph
  under `server/data/opera-graphs/*.json` that has a `seed` node targeting
  `shop` (e.g. "Tribute Cache", "Old Debt Note", "Coded Data Chip", "Coded
  Debt Ledger", "Forged Identity Papers", "Cult Origin Data-Shard",
  "Cult-Grade Decryption Rig", "Cognition Killswitch", "Faded Bounty
  Flyer") references an item name with no matching catalog row -- that
  branch is a genuine dead end, not a UI bug. If an Opera you're driving
  seems stuck right after "New item available in the shop.", check
  `shop_items` directly for that name before assuming you did something
  wrong:
  ```bash
  podman exec ai-mercenary-manager_postgres_1 psql -U mercenai -d mercenai -c "SELECT name FROM shop_items WHERE name ILIKE '%<word>%';"
  ```
  If it's empty, pick a different pooled Opera instead (`opera list` shows
  2-3 running in parallel) rather than trying to force that one through.
- **`{securityGroupName}` tag never renders** in `two-gangs-one-contract.json`
  (shows up literally in a choice option label and log text), while the
  sibling tag `{enemyGroupName}` in the same graph renders fine. Cosmetic,
  reproducible, not fixed as of this writing.

## Verification checklist

- [ ] `curl http://localhost:3000/health` → `{"status":"ok"}`
- [ ] `curl http://localhost:4200/api/game/state` → real JSON (proves the
      Angular proxy is actually reaching the backend, not just that both
      ports independently respond)
- [ ] A `pw.js screenshot` actually shows the terminal UI, not a blank page
      or a browser error -- **look at it**, don't just check the exit code
- [ ] `pw.js eval "!!window.ng"` or similar sanity check if the screenshot
      looks suspicious (Angular hydration failed vs. genuinely blank)
