const fs = require('fs/promises')
const path = require('path')
const { validateGraphDefinition } = require('../domain/graph')

const DATA_DIR = process.env.OPERA_GRAPHS_DIR || path.join(__dirname, '../../data/opera-graphs')
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

function filePathFor(id) {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw Object.assign(new Error('Graph id must be lowercase alphanumeric with hyphens'), {
      statusCode: 400,
    })
  }
  return path.join(DATA_DIR, `${id}.json`)
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

async function listGraphs() {
  await ensureDataDir()
  const files = (await fs.readdir(DATA_DIR)).filter((f) => f.endsWith('.json'))
  const summaries = await Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(path.join(DATA_DIR, file), 'utf8')
      const def = JSON.parse(raw)
      const stat = await fs.stat(path.join(DATA_DIR, file))
      return {
        id: def.id,
        title: def.title,
        description: def.description ?? '',
        updatedAt: stat.mtime.toISOString(),
      }
    }),
  )
  return summaries.sort((a, b) => a.title.localeCompare(b.title))
}

async function readGraph(id) {
  await ensureDataDir()
  try {
    const raw = await fs.readFile(filePathFor(id), 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

async function graphExists(id) {
  return (await readGraph(id)) !== null
}

function makeBlankGraph(id, title, description) {
  return {
    id,
    title,
    description: description ?? '',
    nodes: [
      { id: 'start', type: 'start', position: { x: 80, y: 160 } },
      {
        id: 'end',
        type: 'end',
        outcome: 'neutral',
        text: 'The end.',
        position: { x: 400, y: 160 },
      },
    ],
    links: [{ id: 'start-to-end', from: 'start', to: 'end', priority: 0, conditions: [] }],
  }
}

async function createGraph({ id, title, description }) {
  if (await graphExists(id)) {
    throw Object.assign(new Error(`Graph "${id}" already exists`), { statusCode: 409 })
  }
  const def = makeBlankGraph(id, title, description)
  validateGraphDefinition(def)
  await fs.writeFile(filePathFor(id), JSON.stringify(def, null, 2))
  return def
}

async function saveGraph(id, def) {
  if (def.id !== id) {
    throw Object.assign(new Error(`Body id "${def.id}" does not match URL id "${id}"`), {
      statusCode: 400,
    })
  }
  validateGraphDefinition(def)
  await ensureDataDir()
  await fs.writeFile(filePathFor(id), JSON.stringify(def, null, 2))
  return def
}

async function deleteGraph(id) {
  try {
    await fs.unlink(filePathFor(id))
  } catch (err) {
    if (err.code === 'ENOENT') return false
    throw err
  }
  return true
}

module.exports = {
  DATA_DIR,
  listGraphs,
  readGraph,
  createGraph,
  saveGraph,
  deleteGraph,
}
