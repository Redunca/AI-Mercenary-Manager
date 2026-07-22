#!/usr/bin/env node
'use strict'

// Publishes finished, validated Opera templates from opera-forge's own data
// dir into the live game server's server/data/opera-graphs/ -- the live
// server never reads opera-forge's files directly (see the "Publishing the
// templates" section of the opera-generation plan): this is a plain
// validated copy, not a build step, so opera-forge stays fully standalone.
//
// Usage: node scripts/publish.js <templateId> [...moreIds]

const fs = require('fs')
const path = require('path')
const { validateGraphDefinition, analyzeGraph } = require('../server/src/domain/graph')

const SOURCE_DIR = path.join(__dirname, '../server/data/opera-graphs')
const DEST_DIR = path.join(__dirname, '../../server/data/opera-graphs')

function publish(id) {
  const file = `${id}.json`
  const sourcePath = path.join(SOURCE_DIR, file)
  const def = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))

  validateGraphDefinition(def) // throws on schema errors -- never publish a broken template
  const warnings = analyzeGraph(def)
  if (warnings.length > 0) {
    console.warn(`Warnings for "${id}":`)
    warnings.forEach(w => console.warn(`  - ${w}`))
  }

  fs.mkdirSync(DEST_DIR, { recursive: true })
  fs.copyFileSync(sourcePath, path.join(DEST_DIR, file))
  console.log(`Published "${id}" -> ${path.join(DEST_DIR, file)}`)
}

const ids = process.argv.slice(2)
if (ids.length === 0) {
  console.error('Usage: node scripts/publish.js <templateId> [...moreIds]')
  process.exit(1)
}
for (const id of ids) publish(id)
