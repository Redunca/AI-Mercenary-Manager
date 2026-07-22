---
name: opera-template
description: Formalizes the design and authoring workflow for a single AI Mercenary Manager "Opera" template -- opera-forge's OGL graph format -- from a one-line premise to a validated, playable graph JSON file in opera-forge/server/data/opera-graphs/. Use whenever asked to create, author, design, draft, or add an Opera / opera template / narrative arc / questline for the game, or to add content in Opera Forge.
metadata:
  author: opera-forge design session
  version: "1.0.0"
---

# Opera Template Authoring

This skill packages the workflow and hard-won schema rules from designing the
game's first Opera templates. It assumes no prior context -- read it fresh
each time.

## What an Opera is

The game (AI-Mercenary-Manager / MercenAI) has two Opera formats:

1. **The live, shipped engine** (`server/src/domain/opera.js`,
   `server/data/operas/*.json`): a linear or checklist list of steps, each
   waiting for one specific in-game action. Simple, already working,
   exemplified by `server/data/operas/tutorial.json`.
2. **Opera Forge's graph format, OGL** (`opera-forge/server/src/domain/graph.js`):
   a much richer branching node graph that the live game does **not yet
   consume** -- Opera Forge is authoring-time spec-ahead-of-the-engine. This
   skill is about OGL. Node types: `start`, `story`, `check`, `seed`,
   `mission`, `choice`, `end`.

   | Node type | What it does |
   |---|---|
   | `start` | Single entry point. Optional welcome `text`. |
   | `story` | Narrative beat. The **only** node type that can carry `effects` (give_item / apply_perk / apply_flaw / adjust_stat). |
   | `check` | Rolls a `chance` and resolves to success/failure; route outgoing links with `previous_outcome`. |
   | `seed` | Fire-and-forget: declares a shop item, mission, or candidate should exist somewhere. Never blocks, has no direct game effect today -- it's the not-yet-built engine's data to read later. |
   | `mission` | Injects a personalized mission and **blocks the walk** until it resolves in real play, branching on outcome like `check`. |
   | `choice` | Presents the player a decision; blocks until picked, branching on `choice_made`. |
   | `end` | Terminal, with an `outcome` of success/failure/neutral. |

   Voice/tone: dry, factual, third-person AI-log voice throughout (matches
   `tutorial.json`) -- not the dramatic/absurd recruit voice used in mission
   logs elsewhere. English only, per the project's CLAUDE.md.

## The Act / Beat-pool model

A template is not one fixed branching path -- it's an **ordered sequence of
3-5 Acts**, each a themed story checkpoint, and each Act is a **pool of 2-4
interchangeable Beats**: different concrete ways of accomplishing that same
checkpoint. The engine picks one Beat per Act per playthrough. This is what
makes a single template yield many distinct stories rather than just
different flavor text -- see "Estimating story count" below.

Wire each Act as a fan-out/reconverge:

- From the previous Act's convergence point (or `start`), fan out into that
  Act's 2-4 Beats using **cascading `chance`-conditioned links**, in priority
  order, so beats are ~equally likely. Sequential-elimination percentages
  (last option always gets **no condition** -- a guaranteed fallback, so the
  fan-out can never dead-end):

  | Beats in the Act | Link chances, in priority order |
  |---|---|
  | 2 | `[50]`, then unconditioned |
  | 3 | `[33, 50]`, then unconditioned |
  | 4 | `[25, 33, 50]`, then unconditioned |

- Every Beat's own outgoing link(s) reconverge into a single small `story`
  "bridge" node (a line or two of transition text) -- that bridge node is
  both the previous Act's convergence point and the next Act's fan-out
  origin. Use `fanOut()`/`link()` from `scripts/build-operas.js` for this;
  don't hand-roll the percentages.

- **Concentrate real branching stakes at the finale**, not every Act. Early
  Acts' mission/seed beats should mostly reconverge unconditionally
  regardless of outcome -- treat "the player attempted this" as enough to
  advance. The finale is usually a `choice` node with 2-4 options, each
  leading to its own `end`(s). Optionally have one earlier Act's beat grant
  an item via a `give_item` effect that a finale option later checks with a
  stacked `has_item` + `choice_made` condition on one link (see
  `two-gangs-one-contract.json` for a worked example) -- this gives an early
  choice real weight later without multiplying node count everywhere.

## The player-action lens (apply to every single Beat)

Before wiring a Beat's completion, ask: **is there an actual player command
for this?** If the in-game `help` command wouldn't list something a player
literally does to accomplish this Beat, it cannot be a bare gate -- it needs
to become a `mission`, a `seed`+gate pair, a `choice`, or ungated narration.

Player actions detectable today via an `action_performed` condition
(`{actionType, match}}`, matching `server/src/domain/opera.js`'s
`STEP_TYPES`/`ACTION_TYPES`):

| actionType | Real command | Typical match |
|---|---|---|
| `hire_recruit` | `recruit hire <id>` | `{scope:"any"}` or `{recruitId}` or `{seedId}` (seeded candidate) |
| `equip_item` | `equip <equipmentId>` | `{itemName}` |
| `assign_crew_to_ship` | `ship assign <shipId> <recruitId>` | `{scope:"any"}` or `{shipId}`/`{recruitId}` |
| `assign_item_to_ship` | `ship load <shipId> <consumableId>` | `{itemName}` |
| `purchase_item` / `purchase_quest_item` | `shop buy <id>` | `{itemName}` (pair with a `seed` node that puts the item in the shop) |
| `send_recruit_to_quest` → `complete_quest` | `mission start <id> <shipId>` (start → finish) | `{scope:"any"}` or `{templateId}` |
| `execute_command` | any literal typed command | `{command}` -- brittle; only for narrow UI-teaching (as in `tutorial.json`), never as a narrative gate |
| `fire_recruit` | **no live command exists yet** | `{scope:"any"}` -- opera-forge-only addition (see Schema gotchas); flavor-repurposable (e.g. "gift a recruit away") as long as that's an honest stretch, not a lie about what happens |

Decision table for each Beat:

- **Real command fits** → gate a plain `story`/`seed` node's outgoing link
  with `action_performed`.
- **No command, but it's fieldwork/an accomplishment** (negotiate, capture,
  rescue, sabotage, survive an ambush, track someone down...) → a `mission`
  node. This is the majority case for anything that sounds like "go do X."
- **The Beat is "make X available, then have the player go get/hire it"**
  → a `seed` node (`shop`/`mission`/`candidate` target) whose *own outgoing
  link* carries the matching `action_performed` gate (`purchase_quest_item`
  for shop, `hire_recruit` with `{seedId}` for a seeded candidate). The seed
  itself never blocks -- the gate lives on the link after it.
- **A real decision with no "right" mechanical answer** → a `choice` node.
- **Pure scene-setting or an automatic consequence** (a letter arrives, a
  crew member's stat quietly shifts) → an ungated `story` node. Not every
  Beat needs a gate; only ones that were originally phrased as "the player
  accomplishes X."

**Recruit personal arcs are generic/archetypal only.** There are no fixed
named recruits/companions in the game, and OGL deliberately has no
`has_perk`/`has_flaw`/`attribute_threshold` condition -- a personal-arc
template fires for *whichever* recruit triggers it (`scope:"any"`), and
perks/flaws/stat effects are the **payoff**, never the gate.

## Schema gotchas (validated against `opera-forge/server/src/domain/graph.js`)

- **`effects` only live on `story` nodes.** If a Beat's payoff needs
  `give_item`/`apply_perk`/`apply_flaw`/`adjust_stat`, insert a small `story`
  "payoff" node between the triggering node and the `end`/bridge -- an `end`
  node cannot carry effects directly.
- **Identifying params must be literal strings, never `{tagName}`
  placeholders.** `itemName`, `templateId`, `seedId`, `recruitId`, `shipId`,
  `command`, `perkName`, `flawName`, `attribute` are compared by exact string
  equality against real runtime values -- an unresolved tag in one of these
  will simply never match anything. Tags only resolve in **narrative text**:
  `text`, `completionText`, `mission.title`, `mission.description`,
  `choiceOptions[].label`. This is the single easiest mistake to make when a
  template is meant to be tag-heavy -- lean on tags hard in text, never in
  match/seed/effect params.
- **Every node needs a `position`** (`{x, y}`) or the graph-editor client
  defaults it to `(0,0)`, stacking every node on the origin when opened.
  Call `layout(def)` from the bundled script before `writeGraph(def)` unless
  you're hand-placing positions.
- Exactly one `start` node, at least one `end` node, unique node/link ids
  within the graph.
- `fire_recruit` and the `candidate` seed target (with `{seedId}` /
  `action_performed` `{seedId}` matches) are **opera-forge-only additions**
  with no live-game backing today -- see the "not-yet-built engine" comments
  in `graph.js`/`graph.ts`. Using them in a template is legitimate (that's
  how OGL discovers what the real engine needs to grow), but say so plainly
  when reporting the template back, the same way `seed`'s `mission`/`shop`
  targets already are.

## Workflow

1. **Get/confirm the premise.** Faction/world storyline or recruit personal
   arc (generic/archetypal -- see above)? If the user hasn't specified,
   propose 1-3 options and ask, don't guess. Pick an act count: 3 for an
   intimate/personal arc, 5 for a bigger faction/world epic, 4 as a default.
2. **Sketch first, wire second.** Draft the acts and their 2-4 beats as a
   compact `Act: beat OR beat OR beat` list (see `two-gangs-one-contract`'s
   design conversation for the format) and get it confirmed before touching
   any JSON -- this is cheap to iterate on and expensive to redo once wired.
3. **Run the player-action lens over every beat** from the sketch (table
   above); reclassify anything that fails it into a mission / seed+gate /
   choice / ungated form before moving on.
4. **Design the finale** with 2-4 `choice` options, each its own path to one
   or more distinct `end` nodes (branch missions on `previous_outcome` where
   relevant). This is where the template's real stakes should live -- keep
   earlier acts' beats mostly outcome-agnostic.
5. **Build it as a small Node script**, one per template, requiring
   `scripts/build-operas.js` from this skill directory:
   ```js
   const { fanOut, link, layout, writeGraph, autoplay } = require('<skill-dir>/scripts/build-operas');
   const nodes = [ /* ... */ ];
   const links = [];
   fanOut(links, 'start', ['beat-a', 'beat-b', 'beat-c']);
   link(links, 'beat-a', 'bridge-1', [{ type: 'action_performed', params: { actionType: 'purchase_quest_item', match: { itemName: 'Some Item' } } }]);
   // ...
   const def = { id: 'kebab-case-id', title: '...', description: '...', nodes, links };
   layout(def);
   writeGraph(def); // validates + writes opera-forge/server/data/opera-graphs/<id>.json, prints any warnings
   ```
   `writeGraph` runs `validateGraphDefinition` (throws on schema errors) and
   `analyzeGraph` (prints dead-end / unreachable-node / unknown-tag
   warnings) automatically. Fix everything it flags before moving on.
6. **Prove completability, don't just trust the warnings.**
   `analyzeGraph`'s reachability check only confirms the topology is
   connected -- it doesn't confirm a real playthrough can actually finish.
   For every distinct ending, call
   `autoplay(def, { seed, tags, choicesMade, shipCrewCount })` with a fresh
   seed and the `choicesMade` needed to steer toward that ending, and check
   `result.endedAt` matches. If an ending is conditioned on earlier-act
   state (like the evidence-gated bonus ending in
   `two-gangs-one-contract.json`), brute-force a handful of seeds until one
   naturally lands on the right earlier beat -- see that template's build
   script for the pattern.
7. **Report back**: node/link counts, the act-by-act beat-pool sizes, the
   ending list, and the combinatorial story count (see below) -- plus a
   one-line callout for any opera-forge-only mechanic used (`fire_recruit`,
   `candidate` seeding) so the reader knows it needs live-engine work later.

## Estimating "how many different stories"

Tag substitution is cosmetic and never counts. The real number is the
product of each Act's beat-pool size, times the number of distinct realized
endings (count a `choice` option's differently-conditioned outcomes --
e.g. a mission's success vs. failure, or an evidence-gated bonus vs. its
fallback -- as separate endings, since their text/effects differ):

```
total ≈ (beats in Act 1) × (beats in Act 2) × ... × (distinct endings)
```

This is a family-resemblance count, not a strangers count -- two runs that
share every act but the finale are still siblings. If asked for a more
conservative number, report just the distinct-ending count instead.

## Reference files

- Graph schema/validation/walker: `opera-forge/server/src/domain/graph.js`
- Tag catalog: `opera-forge/server/src/domain/tags.js`
- Client model (keep in sync if you change the schema):
  `opera-forge/client/src/app/models/graph.ts`
- Editor UI (update if you add a new node/seed/action type so it's actually
  editable, not just valid JSON): `opera-forge/client/src/app/graph-editor/`
- Existing templates to read as worked examples:
  `opera-forge/server/data/opera-graphs/*.json`
- This skill's helper library: `scripts/build-operas.js`
  (`fanOut`, `link`, `layout`, `writeGraph`, `autoplay`)
