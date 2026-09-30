// @ts-nocheck
const {test} = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const protoLoader = require('@grpc/proto-loader')
const grpc = require('@grpc/grpc-js')
const {EventEmitter} = require('node:events')
const GrpcClient = require('./grpc')

test('flow protocol includes the Go SDK debug stream', () => {
  const definition = protoLoader.loadSync(path.join(__dirname, 'proto', 'engine.proto'))
  const service = grpc.loadPackageDefinition(definition).engine.PluginService
  assert.equal(typeof service.service.DebugStream, 'object')
})

test('flow debug stream returns logs and values', () => {
  const stream = new EventEmitter()
  const replies = []
  stream.write = reply => replies.push(reply)
  const client = new GrpcClient()
  client.app = {cfg: {flow: {name: 'example', mode: 'service'}}}
  client.flow = {debug: (_app, _meta, request, callback) =>
    callback(null, {logs: [], value: request.config})}
  client.grpcClient = {DebugStream: () => stream}
  client.debugStream()
  stream.emit('data', {elementJob: 'job', config: Buffer.from('{"x":1}')})
  assert.equal(replies[0].elementJob, 'job')
  assert.equal(replies[0].status, true)
  assert.deepEqual(JSON.parse(replies[0].result.toString()), {logs: [], value: {x: 1}})
})
