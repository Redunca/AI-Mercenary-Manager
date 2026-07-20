const fs = require('fs')
const path = require('path')
const { validateOperaDefinition } = require('./domain/opera')

const OPERA_DIR = path.join(__dirname, '../data/operas')

let cache = null

// Loaded eagerly (called once from index.js's start(), right after
// migrate()) rather than lazily: a malformed hand-authored opera file
// should crash startup with a clear error, not surface as a mystery 500 on
// the first sync.
function loadOperaDefinitions() {
  if (cache) return cache

  const files = fs.readdirSync(OPERA_DIR).filter(f => f.endsWith('.json'))
  const byId = new Map()
  for (const file of files) {
    const def = JSON.parse(fs.readFileSync(path.join(OPERA_DIR, file), 'utf8'))
    validateOperaDefinition(def)
    if (byId.has(def.id)) {
      throw new Error(`Duplicate opera id "${def.id}" in ${file}`)
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

module.exports = { loadOperaDefinitions, getOperaDefinition, getAllOperaDefinitions }
