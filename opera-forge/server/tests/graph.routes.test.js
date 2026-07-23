const fs = require('fs/promises')
const os = require('os')
const path = require('path')

let app
let tmpDir

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opera-forge-test-'))
  process.env.OPERA_GRAPHS_DIR = tmpDir
  ;({ app } = require('../index'))
})

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const request = require('supertest')

describe('graph routes', () => {
  test('GET / returns an empty list initially', async () => {
    const res = await request(app).get('/api/graphs')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  test('POST / creates a blank valid graph', async () => {
    const res = await request(app).post('/api/graphs').send({ id: 'my-opera', title: 'My Opera' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBe('my-opera')
    expect(res.body.nodes.some((n) => n.type === 'start')).toBe(true)
    expect(res.body.nodes.some((n) => n.type === 'end')).toBe(true)
  })

  test('POST / rejects a duplicate id', async () => {
    const res = await request(app).post('/api/graphs').send({ id: 'my-opera', title: 'Dup' })
    expect(res.status).toBe(409)
  })

  test('POST / rejects an unsafe id', async () => {
    const res = await request(app).post('/api/graphs').send({ id: '../evil', title: 'Evil' })
    expect(res.status).toBe(400)
  })

  test('GET /:id returns the created graph', async () => {
    const res = await request(app).get('/api/graphs/my-opera')
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('My Opera')
  })

  test('GET /:id 404s for a missing graph', async () => {
    const res = await request(app).get('/api/graphs/does-not-exist')
    expect(res.status).toBe(404)
  })

  test('PUT /:id saves an edited, valid graph', async () => {
    const existing = (await request(app).get('/api/graphs/my-opera')).body
    existing.title = 'Renamed Opera'
    const res = await request(app).put('/api/graphs/my-opera').send(existing)
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('Renamed Opera')
  })

  test('PUT /:id rejects an invalid graph', async () => {
    const res = await request(app)
      .put('/api/graphs/my-opera')
      .send({ id: 'my-opera', title: 'Bad', nodes: [], links: [] })
    expect(res.status).toBe(400)
  })

  test('GET /:id/analyze returns structural warnings', async () => {
    const res = await request(app).get('/api/graphs/my-opera/analyze')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.warnings)).toBe(true)
  })

  test('POST /:id/generate runs a walk and returns a path', async () => {
    const res = await request(app).post('/api/graphs/my-opera/generate').send({ seed: 'demo' })
    expect(res.status).toBe(200)
    expect(res.body.reason).toBe('end')
    expect(res.body.path.length).toBeGreaterThan(0)
  })

  test('DELETE /:id removes the graph', async () => {
    const res = await request(app).delete('/api/graphs/my-opera')
    expect(res.status).toBe(204)
    const followUp = await request(app).get('/api/graphs/my-opera')
    expect(followUp.status).toBe(404)
  })

  test('DELETE /:id 404s when already gone', async () => {
    const res = await request(app).delete('/api/graphs/my-opera')
    expect(res.status).toBe(404)
  })
})
