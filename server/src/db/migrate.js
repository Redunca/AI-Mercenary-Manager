const fs = require('fs')
const path = require('path')
const { pool } = require('./pool')

const MIGRATIONS_DIR = path.join(__dirname, 'migrations')

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  const applied = new Set(
    (await pool.query('SELECT version FROM schema_migrations')).rows.map(r => r.version),
  )

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    if (applied.has(file)) continue

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`Migration appliquée : ${file}`)
    } catch (err) {
      await client.query('ROLLBACK')
      throw new Error(`Échec migration ${file} : ${err.message}`)
    } finally {
      client.release()
    }
  }
}

module.exports = { migrate }
