const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

// Wraps an Express route handler that needs a pooled client: acquires it,
// hands it to `handler(client, req, res)`, and always releases it. A
// thrown error rolls back any transaction the handler may have started
// and forwards to `next` -- ROLLBACK is a harmless no-op when the handler
// never ran BEGIN (Postgres just warns), so this is safe to apply whether
// or not the route is transactional.
function withClient(handler) {
  return async (req, res, next) => {
    const client = await pool.connect()
    try {
      await handler(client, req, res)
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      next(err)
    } finally {
      client.release()
    }
  }
}

module.exports = { pool, withClient }
