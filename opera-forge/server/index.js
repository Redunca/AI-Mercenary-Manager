require('dotenv').config()

const express = require('express')
const cors = require('cors')
const graphRoutes = require('./src/routes/graph.routes')

const app = express()
const port = process.env.PORT || 3300

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:4300' }))
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/graphs', graphRoutes)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err.message ?? 'Internal server error' })
})

function start() {
  app.listen(port, () => {
    console.log(`Opera Forge server listening on port ${port}`)
  })
}

if (require.main === module) {
  start()
}

module.exports = { app }
