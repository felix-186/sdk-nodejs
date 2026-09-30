// @ts-nocheck
const fs = require('fs')
const http = require('http')
const path = require('path')
const express = require('express')
const compression = require('compression')
const {WebSocketServer, WebSocket} = require('ws')

const invoke = (driver, method, ...args) => new Promise((resolve, reject) => {
  if (typeof driver[method] !== 'function') return reject(new Error(`驱动未实现 ${method}`))
  try {
    driver[method](...args, (err, result) => err ? reject(err) : resolve(result))
  } catch (err) {
    reject(err)
  }
})

class DriverHttp {
  constructor(app, driver) {
    this.app = app
    this.driver = driver
    this.router = express()
    this.router.use((req, res, next) => {
      res.set('Access-Control-Allow-Origin', '*')
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      res.set('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept-Encoding, Authorization')
      if (req.method === 'OPTIONS') return res.sendStatus(204)
      next()
    })
    this.router.use(compression())
    this.router.use(express.json({limit: '10mb'}))
    this.router.use(express.raw({type: 'application/octet-stream', limit: '10mb'}))
    this.clients = new Set()
    this.wsServer = new WebSocketServer({noServer: true})
    this.registerRoutes()
  }

  registerRoutes() {
    const router = this.router
    const app = this.app
    const driver = this.driver
    const meta = {module: 'HTTP', group: app.cfg.groupId}
    const handle = (fn) => async (req, res) => {
      try {
        res.json(await fn(req))
      } catch (err) {
        res.status(500).json({error: err.message})
      }
    }

    router.get('/health', (_req, res) => res.json({status: 'ok', service: app.cfg.driver.name}))
    router.get('/info', (_req, res) => res.json({serviceId: app.cfg.serviceId, projectId: app.cfg.project,
      groupId: app.cfg.groupId, driver: app.cfg.driver}))
    router.get('/driver/schema', handle(async req => ({schema: await invoke(driver, 'schema', app, meta,
      req.get('locale') || (req.get('Accept-Language') === '*' ? '' : req.get('Accept-Language')) ||
      req.query.locale || 'zh')})))
    router.get('/driver/config', (_req, res) => res.json(app.dataConfig || {
      id: app.cfg.serviceId, name: app.cfg.driver.name, groupId: app.cfg.project,
      driverType: app.cfg.driver.id, runMode: 'one', device: {commands: [], settings: {}},
      distributed: 'all', ports: '', tables: []
    }))
    router.post('/driver/start', handle(async req => {
      if (!req.body || typeof req.body !== 'object' || Buffer.isBuffer(req.body)) {
        throw new Error('请求参数格式错误')
      }
      await app.startDriver(req.body)
      await app.saveDataConfig(req.body)
      return {result: '启动成功'}
    }))
    router.post('/driver/run', handle(async req => {
      const input = req.body || {}
      return {result: await invoke(driver, 'run', app, meta, {
        table: input.table, id: input.id, serialNo: input.table + input.id, command: input
      })}
    }))
    router.post('/driver/batch-run', handle(async req => ({result: await invoke(driver, 'batchRun', app, meta, req.body)})))
    router.post('/driver/write-tag', handle(async req => ({result: await invoke(driver, 'writeTag', app, meta, req.body)})))
    router.post('/driver/debug', handle(async req => ({result: await invoke(driver, 'debug', app, meta, req.body)})))
    if (typeof driver.registerRoutes === 'function') {
      const custom = express.Router()
      driver.registerRoutes(custom)
      router.use(`/${encodeURIComponent(app.cfg.driver.id)}`, custom)
    }
    const staticDir = app.cfg.http && app.cfg.http.staticDir ||
      (fs.existsSync(path.resolve('index.html')) ? process.cwd() : null)
    if (staticDir) {
      const index = path.join(staticDir, 'index.html')
      router.use(express.static(staticDir))
      router.get('/{*path}', (req, res, next) => {
        if (req.path.startsWith('/driver/') || req.path.startsWith('/debug/')) return next()
        if (!fs.existsSync(index)) return next()
        res.sendFile(path.resolve(index))
      })
    }
  }

  async start() {
    if (this.server) throw new Error('HTTP 服务已在运行')
    const cfg = this.app.cfg.http
    this.server = http.createServer(this.router)
    this.server.on('upgrade', (req, socket, head) => {
      if (new URL(req.url, 'http://localhost').pathname !== '/driver/ws') return socket.destroy()
      this.wsServer.handleUpgrade(req, socket, head, ws => {
        const params = new URL(req.url, 'http://localhost').searchParams
        const client = {ws, type: params.get('type') || 'data', table: params.get('table') || '',
          device: params.get('device') || ''}
        this.clients.add(client)
        ws.on('message', bytes => {
          try {
            const update = JSON.parse(bytes.toString())
            client.table = update.table || ''
            client.device = update.device || ''
          } catch (_) {}
        })
        ws.on('close', () => this.clients.delete(client))
      })
    })
    try {
      await new Promise((resolve, reject) => {
        this.server.once('error', reject)
        this.server.listen(cfg.port ?? 8080, cfg.host || '0.0.0.0', resolve)
      })
    } catch (err) {
      this.server = null
      throw err
    }
    return this.server
  }

  broadcast(type, table, id, data) {
    const payload = JSON.stringify({table, id, ...data})
    for (const client of this.clients) {
      if (client.type !== type || (client.table && client.table !== table) ||
        (client.device && client.device !== id) || client.ws.readyState !== WebSocket.OPEN) continue
      client.ws.send(payload)
    }
  }

  async stop() {
    for (const client of this.clients) client.ws.close()
    this.clients.clear()
    this.wsServer.close()
    if (this.server) await new Promise(resolve => this.server.close(resolve))
    this.server = null
  }
}

export = DriverHttp
