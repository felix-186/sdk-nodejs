// @ts-nocheck
const path = require('path')
const grpc = require('@grpc/grpc-js')
const protoLoader = require('@grpc/proto-loader')
const log = require('../log')

const definition = protoLoader.loadSync(path.join(__dirname, 'proto', 'data_relay.proto'), {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
})
const Service = grpc.loadPackageDefinition(definition).datarelay.DataRelayInstanceService

class GrpcClient {
  start(app, relay) {
    this.app = app
    this.relay = relay
    this.closed = false
    this.connect()
  }

  metadata() {
    const meta = new grpc.Metadata()
    const fields = {instanceId: this.app.cfg.instanceId, projectId: this.app.cfg.project,
      id: this.app.cfg.service.id, name: this.app.cfg.service.name}
    for (const [key, value] of Object.entries(fields)) meta.add(key, Buffer.from(value).toString('hex'))
    return meta
  }

  connect() {
    const cfg = this.app.cfg.dataRelayGrpc
    this.client = new Service(`${cfg.host}:${cfg.port}`, grpc.credentials.createInsecure())
    this.streams = [this.client.StartStream(this.metadata()), this.client.HttpProxyStream(this.metadata())]
    this.bind(this.streams[0], 'start', request => [this.app, {module: '启动服务'}, request.data])
    this.bind(this.streams[1], 'httpProxy', request => [this.app, {module: 'Http代理'}, request.type,
      request.headers && request.headers.length ? JSON.parse(Buffer.from(request.headers).toString()) : null,
      request.data])
    const interval = cfg.healthInterval || 5000
    this.healthTimer = setInterval(() => this.healthCheck(), interval)
    this.healthCheck()
  }

  bind(stream, method, args) {
    stream.on('data', request => {
      let finished = false
      const reply = (err, result) => {
        if (finished) return
        finished = true
        const response = {request: request.request, status: !err, info: err ? '执行错误' : 'ok',
          detail: err ? String(err) : ''}
        if (!err && result !== undefined) response.result = Buffer.isBuffer(result) ? result : Buffer.from(JSON.stringify(result))
        stream.write(response)
      }
      try {
        if (typeof this.relay[method] !== 'function') throw new Error(`服务未实现 ${method}`)
        this.relay[method](...args(request), reply)
      } catch (err) {
        reply(err)
      }
    })
    stream.on('error', err => {
      if (!this.closed) log.getLogger().detail(err).error('%s stream错误', method)
    })
    stream.on('end', () => this.scheduleReconnect())
  }

  healthCheck() {
    if (this.closed) return
    this.client.HealthCheck({service: this.app.cfg.instanceId, projectId: this.app.cfg.project,
      type: this.app.cfg.service.id}, (err, response) => {
      if (err || !response || response.status !== 'SERVING') {
        this.failures = (this.failures || 0) + 1
        if (this.failures > (this.app.cfg.dataRelayGrpc.healthRetry || 3)) this.scheduleReconnect()
      } else {
        this.failures = 0
      }
    })
  }

  scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.closed) this.connect()
    }, this.app.cfg.dataRelayGrpc.waitTime || 5000)
    this.disconnect()
  }

  disconnect() {
    if (this.healthTimer) clearInterval(this.healthTimer)
    for (const stream of this.streams || []) stream.cancel()
    if (this.client) this.client.close()
  }

  stop() {
    this.closed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.disconnect()
  }
}

export = GrpcClient
