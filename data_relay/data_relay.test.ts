// @ts-nocheck
const {test} = require('node:test')
const assert = require('node:assert/strict')
const {EventEmitter} = require('node:events')
const GrpcClient = require('./grpc')
const path = require('node:path')
const grpc = require('@grpc/grpc-js')
const protoLoader = require('@grpc/proto-loader')

test('data relay stream replies with the matching request', () => {
  const client = new GrpcClient()
  client.closed = false
  client.relay = {start: (_app, _meta, data, callback) => callback(null, data.toString())}
  client.app = {}
  const stream = new EventEmitter()
  const replies = []
  stream.write = reply => replies.push(reply)
  client.bind(stream, 'start', request => [client.app, {}, request.data])
  stream.emit('data', {request: 'r1', data: Buffer.from('config')})
  assert.equal(replies[0].request, 'r1')
  assert.equal(replies[0].status, true)
  assert.equal(JSON.parse(replies[0].result.toString()), 'config')
})

test('data relay communicates over gRPC streams', async () => {
  let timeoutId
  const definition = protoLoader.loadSync(path.join(__dirname, 'proto', 'data_relay.proto'),
    {keepCase: true, enums: String})
  const Service = grpc.loadPackageDefinition(definition).datarelay.DataRelayInstanceService
  const server = new grpc.Server()
  let received = 0
  let done
  const completed = new Promise(resolve => { done = resolve })
  const accept = call => {
    call.on('data', response => {
      assert.equal(response.status, true)
      received++
      if (received === 2) done()
    })
  }
  server.addService(Service.service, {
    HealthCheck: (_call, callback) => callback(null, {status: 'SERVING'}),
    StartStream: call => { accept(call); call.write({request: 'start', data: Buffer.from('{}')}) },
    HttpProxyStream: call => { accept(call); call.write({request: 'proxy', type: 'echo',
      headers: Buffer.from('{}'), data: Buffer.from('hello')}) }
  })
  const port = await new Promise((resolve, reject) => server.bindAsync('127.0.0.1:0',
    grpc.ServerCredentials.createInsecure(), (err, value) => err ? reject(err) : resolve(value)))
  const client = new GrpcClient()
  try {
    client.start({cfg: {instanceId: 'instance', project: 'project', service: {id: 'relay', name: 'Relay'},
      dataRelayGrpc: {host: '127.0.0.1', port, healthInterval: 1000}}}, {
      start: (_app, _meta, _data, callback) => callback(),
      httpProxy: (_app, _meta, _type, _headers, data, callback) => callback(null, data)
    })
    await Promise.race([completed, new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('gRPC 流响应超时')), 5000)
    })])
    assert.equal(received, 2)
  } finally {
    clearTimeout(timeoutId)
    client.stop()
    server.forceShutdown()
  }
})
