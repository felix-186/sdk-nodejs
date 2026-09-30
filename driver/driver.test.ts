// @ts-nocheck
const {test} = require('node:test')
const assert = require('node:assert/strict')
const App = require('./app')
const GrpcClient = require('./grpc')
const ConvertTag = require('./tag')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const grpc = require('@grpc/grpc-js')
const protoLoader = require('@grpc/proto-loader')

test('driver cache follows full and incremental configuration changes', () => {
  const client = new GrpcClient()
  client.app = {cacheConfig: Object.create(null)}
  client.updateDriverCache({tables: [{id: 'a', devices: [{id: 'one'}, {id: 'shared'}]}, {id: 'b', devices: [{id: 'shared'}]}]})
  assert.deepEqual(Object.keys(client.app.cacheConfig.shared).sort(), ['a', 'b'])
  client.updateTableCache('a', {devices: [{id: 'two'}]})
  assert.equal(client.app.cacheConfig.one, undefined)
  assert.deepEqual(Object.keys(client.app.cacheConfig.shared), ['b'])
  client.delDeviceCache('b', 'missing')
  client.updateDriverCache({tables: []})
  assert.deepEqual(Object.keys(client.app.cacheConfig), [])
})

test('table inference handles missing and ambiguous devices', () => {
  const app = Object.create(App.prototype)
  app.cacheConfig = {one: {a: 0}, shared: {a: 0, b: 0}}
  assert.equal(app.resolveTable('one'), 'a')
  assert.throws(() => app.resolveTable('missing'), /未找到/)
  assert.throws(() => app.resolveTable('shared'), /不唯一/)
})

test('point publishing reports MQ failures', async () => {
  const app = new App({serviceId: 'test', driver: {id: 'test', name: 'test'}, mq: {type: 'kafka'}})
  app.cacheConfig = {one: {a: 0}}
  app.cacheValue = {}
  app.convertTag = new ConvertTag()
  app.cfg = {project: 'p'}
  app.mqClient = {send: () => Promise.reject(new Error('publish failed'))}
  await assert.rejects(app.writePoints({}, {id: 'one', time: Date.now(), fields: [{tag: {id: 'x'}, value: 1}]}), /publish failed/)
})

test('range conversion returns the expected value shape', () => {
  const tag = new ConvertTag()
  assert.equal(tag.convertRange({minValue: 0, maxValue: 10, active: 'fixed', fixedValue: 3}, null, 12).newValue, 3)
  assert.equal(tag.convertRange({minValue: 0, maxValue: 10, active: 'latest'}, 4, 12).newValue, 4)
  assert.equal(tag.convertRange({method: 'invalid', active: 'fixed', fixedValue: 3, invalidAction: 'save', conditions: [{mode: 'number', condition: 'greater', value: 10, invalidType: 'high'}]}, null, 12).rawValue, 12)
})

test('gRPC write callbacks wait for the server result', () => {
  const client = new GrpcClient()
  client.app = {cfg: {project: 'p'}}
  const pending = []
  client.grpcClient = {
    Event: (_request, callback) => pending.push(callback),
    CommandLog: (_request, callback) => pending.push(callback),
    UpdateTableData: (_request, callback) => pending.push(callback),
  }
  const results = []
  client.writeEvent({table: 'a', id: 'one', eventId: 'e'}, err => results.push(err))
  client.runLog({serialNo: 's'}, err => results.push(err))
  client.updateTableData('a', 'one', {x: 1}, err => results.push(err))
  assert.equal(results.length, 0)
  pending[0](null, {status: true})
  pending[1](new Error('failed'))
  pending[2](null, {status: true})
  assert.equal(results.length, 3)
  assert.equal(results[0], null)
  assert.match(results[1].message, /failed/)
  assert.equal(results[2], null)
})

test('local driver mode saves points and detects device timeout', async () => {
  const app = new App({serviceId: 'local', driver: {id: 'local', name: 'Local'},
    mq: {type: 'local', local: {logPublish: false}}, driverGrpc: {enable: false}})
  const published = []
  app.mqClient.send = async (topic, data) => published.push({topic, data})
  app.dataConfig = {device: {settings: {network: {timeout: 1}}}}
  app.http = {broadcast: (...args) => published.push({broadcast: args})}
  await app.savePoints({}, 'a', {id: 'one', fields: {x: 5}})
  assert.deepEqual(published[0].topic, ['data', 'default', 'a', 'one'])
  assert.equal(app.deviceStatus.get('a:one').status, 'online')
  app.deviceStatus.get('a:one').lastSeen = Date.now() - 2000
  app.checkDeviceStatus()
  assert.equal(app.deviceStatus.get('a:one').status, 'offline')
  assert.equal(published.at(-1).broadcast[0], 'status')
})

test('dataFile starts the driver and populates its device cache', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'kesi-driver-'))
  const filename = path.join(folder, 'data.json')
  const config = {tables: [{id: 'model', devices: [{id: 'device'}]}]}
  await fs.writeFile(filename, JSON.stringify(config))
  let started
  const ready = new Promise(resolve => { started = resolve })
  const driver = {start: (_app, _meta, data, callback) => { started(data); callback() },
    stop: (_app, _meta, callback) => callback()}
  const app = new App({serviceId: 'local', driver: {id: 'local', name: 'Local'},
    mq: {type: 'local', local: {logPublish: false}}, driverGrpc: {enable: false},
    dataFile: {enable: true, path: filename}})
  try {
    app.start(driver)
    assert.deepEqual(await ready, config)
    assert.equal(app.resolveTable('device'), 'model')
  } finally {
    await app.stop(driver)
    await fs.rm(folder, {recursive: true, force: true})
  }
})

test('driver start stream sends session metadata and skips heartbeats', async () => {
  const definition = protoLoader.loadSync(path.join(__dirname, 'proto', 'driver.proto'),
    {keepCase: true, enums: String, defaults: true})
  const Service = grpc.loadPackageDefinition(definition).driver.DriverService
  const server = new grpc.Server()
  let sessionId
  let reply
  const response = new Promise(resolve => { reply = resolve })
  server.addService(Service.service, {StartStream: call => {
    sessionId = call.metadata.get('sessionId')[0]
    call.on('data', message => reply(message))
    call.write({request: 'heartbeat'})
    call.write({request: 'start', config: Buffer.from(JSON.stringify({tables: []}))})
  }})
  const port = await new Promise((resolve, reject) => server.bindAsync('127.0.0.1:0',
    grpc.ServerCredentials.createInsecure(), (err, value) => err ? reject(err) : resolve(value)))
  const client = new GrpcClient()
  let starts = 0
  client.app = {cfg: {serviceId: 's', project: 'p', driver: {id: 'd', name: 'Driver'},
    'driver-grpc': {host: '127.0.0.1', port}},
  startDriver: async () => { starts++ }}
  client.driver = {}
  client.sessionId = 'session'
  let timeoutId
  try {
    client.connDriver()
    client.startStream()
    const result = await Promise.race([response, new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('driver start stream 超时')), 5000)
    })])
    assert.equal(Buffer.from(sessionId, 'hex').toString(), 'session')
    assert.equal(result.request, 'start')
    assert.equal(JSON.parse(result.message.toString()).code, 200)
    assert.equal(starts, 1)
  } finally {
    clearTimeout(timeoutId)
    client.stop()
    server.forceShutdown()
  }
})
