'use strict'

// Mirrors the {tagName} placeholder vocabulary the main game's mission
// generation engine resolves and interpolates into flavor text -- see
// server/src/engine/planetGenerator.js, missionGenerator.js and
// server/src/utils/template.js. Hand-copied rather than imported: opera-forge
// is a standalone app (see graph.js's own header comment and models/graph.ts
// in the client) and this catalog is authoring-time reference data, not
// shared runtime code. Regenerate by hand if the game adds new `provides`
// keys to server/data/planets.json or server/data/mission-types.json.
//
// Each entry is a tag an opera author can drop into node text/completionText
// as "{name}" -- exactly the same syntax server/src/utils/template.js uses --
// plus an example value used to pre-fill Quick Generation's tag editor so a
// tagged opera can be previewed immediately.
const TAG_CATALOG = [
  {
    category: 'Planet',
    tags: [
      { name: 'planetName', example: 'W466875-2 "Kestrel\'s Rest"', description: 'Display name of the mission/opera\'s planet.' },
      { name: 'planetIdentifier', example: 'W466875-2', description: 'System id + orbital position, no nickname.' },
      { name: 'planetNickname', example: 'Kestrel\'s Rest', description: 'Generated nickname (only exists for populous, advanced planets).' },
      { name: 'climate', example: 'arid', description: 'Planet template\'s climate descriptor.' },
      { name: 'colonizationLevel', example: 'frontier outpost', description: 'Planet template\'s settlement descriptor.' },
      { name: 'faction', example: 'the Void Brotherhood', description: 'Group in control of the planet.' },
      { name: 'distance', example: 'at the edge of the sector, several jump-days out', description: 'Planet template\'s distance flavor phrase.' },
    ],
  },
  {
    category: 'Mission',
    tags: [
      { name: 'difficulty', example: 'STANDARD', description: 'ROUTINE / STANDARD / HARD / PERILOUS / EPIC.' },
      { name: 'missionType', example: 'ESCORT', description: 'Mission type identifier (ESCORT, HEIST, SABOTAGE, RECON, DIPLOMACY, EXTRACTION_OP).' },
      { name: 'clientName', example: 'Kael Voss', description: 'Person who hired the crew.' },
      { name: 'targetName', example: 'Ambassador Tolven', description: 'Person the mission is centered on (escort/diplomacy/extraction).' },
      { name: 'targetCorpName', example: 'the Halden Consortium', description: 'Corporation targeted by a heist/sabotage.' },
      { name: 'enemyGroupName', example: 'the Red Dogs', description: 'Hostile group opposing the crew.' },
      { name: 'securityGroupName', example: 'the Wolves of Kethar', description: 'Security force guarding a heist target.' },
    ],
  },
]

function findTag(name) {
  for (const group of TAG_CATALOG) {
    const tag = group.tags.find(t => t.name === name)
    if (tag) return tag
  }
  return null
}

function exampleContext() {
  const context = {}
  for (const group of TAG_CATALOG) {
    for (const tag of group.tags) context[tag.name] = tag.example
  }
  return context
}

/** Extracts the set of {placeholder} names referenced by a template string. */
function extractPlaceholders(template) {
  if (typeof template !== 'string') return []
  const matches = template.matchAll(/\{(\w+)\}/g)
  return [...new Set([...matches].map(m => m[1]))]
}

/**
 * Renders a template's {tagName} placeholders from context, same {word}
 * syntax as server/src/utils/template.js. Unlike the game engine's render()
 * (which throws on an unresolved tag -- appropriate once, at generation
 * time, for finished data), this is a *preview* renderer for a
 * work-in-progress opera: an author is expected to have gaps while they're
 * still filling out the tag editor, so unresolved placeholders are left
 * untouched in the text and reported in `missing` instead of throwing.
 */
function renderPreview(template, context) {
  const missing = []
  if (typeof template !== 'string') return { text: template, missing }
  const text = template.replace(/\{(\w+)\}/g, (match, key) => {
    if (!(key in context) || context[key] === undefined || context[key] === '') {
      missing.push(key)
      return match
    }
    return context[key]
  })
  return { text, missing: [...new Set(missing)] }
}

module.exports = { TAG_CATALOG, findTag, exampleContext, extractPlaceholders, renderPreview }
