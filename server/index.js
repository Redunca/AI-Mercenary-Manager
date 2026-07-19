require('dotenv').config()

const express = require('express')
const cors = require('cors')
const { migrate } = require('./src/db/migrate')
const { initGame } = require('./src/services/game.service')
const gameRoutes = require('./src/routes/game.routes')
const shopRoutes = require('./src/routes/shop.routes')
const shipRoutes = require('./src/routes/ship.routes')
const consumableRoutes = require('./src/routes/consumable.routes')
const selfRoutes = require('./src/routes/self.routes')

const app = express()
const port = process.env.PORT || 3000

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:4200' }))
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/game', gameRoutes)
app.use('/api/shop', shopRoutes)
app.use('/api/ships', shipRoutes)
app.use('/api/consumables', consumableRoutes)
app.use('/api/self', selfRoutes)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err.message ?? 'Internal server error' })
})

async function start() {
  await migrate()
  await initGame()
  app.listen(port, () => {
    console.log(`Mercenai server listening on port ${port}`)
  })
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start server:', err)
    process.exit(1)
  })
}

module.exports = { app }
