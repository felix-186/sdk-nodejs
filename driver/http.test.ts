// @ts-nocheck
const {test} = require('node:test')
const assert = require('node:assert/strict')
const DriverHttp = require('./http')
const {WebSocket} = require('ws')
const {once} = require('node:events')

test('driver HTTP routes invoke the driver and expose config', async () => {
  const calls = []
  const app = {cfg: {serviceId: 'instance', project: 'project', driver: {id: 'test', name: 'Test'},
    http: {host: '127.0.0.1', port: 0}},
  startDriver: async config => { calls.push(config); app.dataConfig = config }, saveDataConfig: async () => {}}
  const driver = {
    schema: (_app, _meta, locale, callback) => callback(null, locale),
    run: (_app, _meta, command, callback) => callback(null, command.id),
    registerRoutes: router => router.get('/custom', (_req, res) => res.json({ok: true}))
  }
  const server = new DriverHttp(app, driver)
  await server.start()
  const base = `http://127.0.0.1:${server.server.address().port}`
  try {
    assert.equal((await (await fetch(`${base}/health`)).json()).status, 'ok')
    assert.equal((await (await fetch(`${base}/driver/schema?locale=en`)).json()).schema, 'en')
    assert.equal((await (await fetch(`${base}/test/custom`)).json()).ok, true)
    const config = {tables: []}
    const response = await fetch(`${base}/driver/start`, {method: 'POST',
      headers: {'content-type': 'application/json'}, body: JSON.stringify(config)})
    assert.equal(response.status, 200)
    assert.deepEqual(calls, [config])
    assert.deepEqual(await (await fetch(`${base}/driver/config`)).json(), config)
  } finally {
    await server.stop()
  }
})

test('realtime websocket filters by table, device, and message type', async () => {
  const app = {cfg: {driver: {id: 'test', name: 'Test'}, http: {host: '127.0.0.1', port: 0}}}
  const server = new DriverHttp(app, {})
  await server.start()
  const ws = new WebSocket(`ws://127.0.0.1:${server.server.address().port}/driver/ws?type=status&table=a&device=one`)
  try {
    await once(ws, 'open')
    const message = once(ws, 'message')
    server.broadcast('data', 'a', 'one', {fields: {x: 1}})
    server.broadcast('status', 'b', 'one', {status: 'online'})
    server.broadcast('status', 'a', 'one', {status: 'offline', lastSeen: 123})
    assert.deepEqual(JSON.parse((await message)[0].toString()),
      {table: 'a', id: 'one', status: 'offline', lastSeen: 123})
  } finally {
    ws.close()
    await server.stop()
  }
})
