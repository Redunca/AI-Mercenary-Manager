const fs = require('fs')
const path = require('path')
const { validateGraphDefinition } = require('./domain/operaGraph')

const OPERA_GRAPH_DIR = path.join(__dirname, '../data/opera-graphs')

let cache = null

// Loaded eagerly (called once from index.js's start(), right after
// migrate()) rather than lazily: a malformed hand-authored opera template
// should crash startup with a clear error, not surface as a mystery 500 on
// the first sync. Templates are published here from opera-forge's own data
// dir via opera-forge/scripts/publish.js -- see that script's header.
function loadOperaDefinitions() {
  if (cache) return cache

  const files = fs.readdirSync(OPERA_GRAPH_DIR).filter(f => f.endsWith('.json'))
  const byId = new Map()
  for (const file of files) {
    const def = JSON.parse(fs.readFileSync(path.join(OPERA_GRAPH_DIR, file), 'utf8'))
    validateGraphDefinition(def)
    if (byId.has(def.id)) {
      throw new Error(`Duplicate opera template id "${def.id}" in ${file}`)
    }
    byId.set(def.id, def)
  }
  cache = byId
  return cache
}

function getOperaDefinition(id) {
  return loadOperaDefinitions().get(id) || null
}

function getAllOperaDefinitions() {
  return [...loadOperaDefinitions().values()]
}

// Every published template except the singleton tutorial (see
// operaGraph.js's "special-cased by id" comment) -- the draw pool for
// OperaService.maintainOperaSlots.
function getGenerationPoolDefinitions() {
  return getAllOperaDefinitions().filter(def => def.id !== 'tutorial')
}

module.exports = { loadOperaDefinitions, getOperaDefinition, getAllOperaDefinitions, getGenerationPoolDefinitions }
