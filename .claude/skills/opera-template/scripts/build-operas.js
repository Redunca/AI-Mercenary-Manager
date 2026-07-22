'use strict';

// Reusable helpers for authoring opera-forge OGL graphs (see ../SKILL.md for
// the full workflow). Require this from a small throwaway script, one per
// template, that builds a `def` object and calls writeGraph(def). Paths are
// resolved relative to this file so it works from any checkout.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const GRAPH_DOMAIN = path.join(REPO_ROOT, 'opera-forge', 'server', 'src', 'domain', 'graph');
const OUT_DIR = path.join(REPO_ROOT, 'opera-forge', 'server', 'data', 'opera-graphs');

const { validateGraphDefinition, analyzeGraph, runGeneration } = require(GRAPH_DOMAIN);

// Sequential-elimination percentages so N fanned-out beats are ~equally
// likely: each link's chance is normalized against the probability
// remaining after every earlier (lower-priority) link already failed. The
// last option always gets no condition at all -- a guaranteed fallback, so
// the fan-out can never dead-end regardless of chance draws.
const FANOUT_PCT = { 2: [50], 3: [33, 50], 4: [25, 33, 50] };

/** Fans `from` out into 2-4 `targets`, appending the links to `links`. */
function fanOut(links, from, targets) {
  const pcts = FANOUT_PCT[targets.length];
  if (!pcts) throw new Error(`fanOut: unsupported target count ${targets.length} (must be 2-4)`);
  targets.forEach((to, i) => {
    const conditions = i < pcts.length ? [{ type: 'chance', params: { percentage: pcts[i] } }] : [];
    links.push({ id: `${from}--${to}`, from, to, priority: i, conditions });
  });
}

/** A single link with an auto-generated unique id. */
function link(links, from, to, conditions = [], priority = 0) {
  links.push({ id: `${from}--${to}--${links.length}`, from, to, priority, conditions });
}

// The graph-editor client defaults any node with no `position` to (0,0) --
// see graph-editor.component.ts's `node.position ?? {x:0,y:0}` -- so an
// unpositioned graph opens with every node stacked on the origin.
// Longest-path layering (depth = 1 + max predecessor depth) gives a
// left-to-right column per "distance from start", which reads as the act
// structure; nodes within a column are stacked and centered vertically.
// Run this before writeGraph() unless you're hand-authoring positions.
function layout(def, { xSpacing = 300, ySpacing = 150 } = {}) {
  const preds = new Map(def.nodes.map(n => [n.id, []]));
  for (const l of def.links) preds.get(l.to)?.push(l.from);

  const depth = new Map();
  function getDepth(id, guard) {
    if (depth.has(id)) return depth.get(id);
    if (guard.has(id)) return 0;
    guard.add(id);
    const ps = preds.get(id) ?? [];
    const d = ps.length === 0 ? 0 : 1 + Math.max(...ps.map(p => getDepth(p, guard)));
    depth.set(id, d);
    return d;
  }
  for (const n of def.nodes) getDepth(n.id, new Set());

  const byDepth = new Map();
  for (const n of def.nodes) {
    const d = depth.get(n.id);
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d).push(n);
  }
  for (const ns of byDepth.values()) {
    const totalHeight = (ns.length - 1) * ySpacing;
    ns.forEach((n, i) => {
      n.position = { x: depth.get(n.id) * xSpacing, y: i * ySpacing - totalHeight / 2 };
    });
  }
}

/** Validates + writes `def` to opera-forge/server/data/opera-graphs/<id>.json, logging any analyzeGraph warnings. */
function writeGraph(def) {
  validateGraphDefinition(def);
  const warnings = analyzeGraph(def);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${def.id}.json`);
  fs.writeFileSync(file, JSON.stringify(def, null, 2) + '\n');
  console.log(`Wrote ${file} (${def.nodes.length} nodes, ${def.links.length} links)`);
  if (warnings.length) {
    console.log(`  Warnings (${warnings.length}):`);
    warnings.forEach(w => console.log(`   - ${w}`));
  } else {
    console.log('  No warnings.');
  }
  return def;
}

// Iteratively discovers a working script for a deterministic seed: on each
// dead end, inspects the stuck node's lowest-priority outgoing link, figures
// out the one unmet condition it knows how to satisfy (action_performed /
// previous_outcome / has_item), appends it to the running script, and
// re-walks from scratch. Converges because chance-gated fan-out picks are
// deterministic per seed and unaffected by the script. Use one call per
// ending you want to prove reachable (steer via `choicesMade`); don't rely
// on analyzeGraph's reachability check alone -- it confirms the topology is
// connected, not that a real playthrough can actually complete it.
function autoplay(def, { seed, tags = {}, choicesMade = [], shipCrewCount = 0, maxAttempts = 80 } = {}) {
  const actionsPerformed = [];
  const missionOutcomes = [];
  const items = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = runGeneration(def, {
      seed,
      initialState: { tags, choicesMade, shipCrewCount, actionsPerformed: [...actionsPerformed], missionOutcomes: [...missionOutcomes], items: [...items] },
    });
    if (result.reason === 'end') return { result, actionsPerformed, missionOutcomes, items, attempts: attempt + 1 };
    if (result.reason === 'max_steps_exceeded') throw new Error(`autoplay(${def.id}, seed=${seed}): max_steps_exceeded (cyclic graph)`);

    const stuckId = result.endedAt;
    const outgoing = def.links.filter(l => l.from === stuckId).sort((a, b) => a.priority - b.priority);
    if (outgoing.length === 0) throw new Error(`autoplay(${def.id}, seed=${seed}): node "${stuckId}" has no outgoing links at all`);

    let progressed = false;
    for (const l of outgoing) {
      for (const c of l.conditions ?? []) {
        if (c.type === 'action_performed') {
          const p = c.params;
          const payload = p.actionType === 'execute_command'
            ? { command: p.match.command, ...(p.match.args ? { args: p.match.args } : {}) }
            : p.match.scope === 'any' ? { recruitId: 'auto-recruit', shipId: 'auto-ship' }
              : { ...p.match };
          actionsPerformed.push({ actionType: p.actionType, payload });
          progressed = true;
        } else if (c.type === 'previous_outcome') {
          missionOutcomes.push(c.params.equals);
          progressed = true;
        } else if (c.type === 'has_item') {
          items.push(c.params.itemName);
          progressed = true;
        }
        if (progressed) break;
      }
      if (progressed) break;
    }
    if (!progressed) {
      throw new Error(`autoplay(${def.id}, seed=${seed}): stuck at "${stuckId}", no satisfiable condition found. Outgoing: ${JSON.stringify(outgoing)}`);
    }
  }
  throw new Error(`autoplay(${def.id}, seed=${seed}): exceeded ${maxAttempts} attempts without reaching an end`);
}

module.exports = { OUT_DIR, fanOut, link, layout, writeGraph, autoplay };
