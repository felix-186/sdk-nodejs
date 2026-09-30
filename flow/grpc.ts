// @ts-nocheck
const path = require('path')
const grpc = require('@grpc/grpc-js')
const protoLoader = require('@grpc/proto-loader')
const PROTO_PATH = path.join(__dirname, 'proto', 'engine.proto')
const log = require('../log')

log.getLogger().info("flow grpc path: %s", PROTO_PATH)
let packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
});

const flowServiceProto = grpc.loadPackageDefinition(packageDefinition).engine;

const MODULE_HEALTHCHECK = "健康检查"
const MODULE_HANDLER = "执行算法"

class GrpcClient {

  start(app, flow) {
    this.app = app
    this.flow = flow
    this.startAll()
  }

  startAll() {
    this.retry = 0
    // 连接驱动管理
    this.connFlow()
    // console.log('flow stream')
    this.registerStream()
    this.debugStream()
    // 健康检查
    this.healthCheck()
  }

  connFlow() {
    log.getLogger().info('连接流程引擎: 配置=%j', this.app.cfg['flow-engine'])
    this.grpcClient = new flowServiceProto.PluginService(`${this.app.cfg['flow-engine'].host}:${this.app.cfg['flow-engine'].port}`, grpc.credentials.createInsecure())
  }

  stop() {
    if (this.healthCheckJob) {
      this.healthCheckJob.cancel()
    }
    if (this.grpcClient) {
      this.grpcClient.close()
    }
  }

  restart() {
    this.stop()
    this.startAll()
  }

  getMetadata() {
    let meta = new grpc.Metadata()
    meta.add('name', Buffer.from(this.app.cfg.flow.name, 'utf8').toString('hex'))
    meta.add('mode', Buffer.from(this.app.cfg.flow.mode, 'utf8').toString('hex'))
    return meta
  }

  healthCheck = () => {
    log.getLogger().module(MODULE_HEALTHCHECK).info('健康检查: 启动')
    this.healthCheckJob = this.app.schedule.scheduleJob('*/5 * * * * *', () => {
      log.getLogger().module(MODULE_HEALTHCHECK).debug('健康检查: 开始')
      this.grpcClient.HealthCheck({name: this.app.cfg.flow.name}, (err, res) => {
        if (err) {
          log.getLogger().module(MODULE_HEALTHCHECK).detail(err).error(`健康检查: 第%d次错误`, this.retry)
          if (this.retry > 3) {
            this.restart()
          } else {
            this.retry++
          }
        } else {
          log.getLogger().module(MODULE_HEALTHCHECK).debug('健康检查: 返回值=%j', res)
          if (res.status === 'SERVING') {
            log.getLogger().module(MODULE_HEALTHCHECK).debug('健康检查: 正常')
            if (res.errors !== null && res.errors !== undefined && res.errors.length > 0) {
              log.getLogger().module(MODULE_HEALTHCHECK).error("健康检查: 错误=%j", res.errors)
            }
          } else if (res.status === 'SERVICE_UNKNOWN') {
            log.getLogger().module(MODULE_HEALTHCHECK).error("健康检查: 服务端未找到本算法服务")
            this.restart()
          }
        }
      })
    })
  }

  registerStream = () => {
    let call = this.grpcClient.Register(this.getMetadata())
    log.getLogger().module(MODULE_HANDLER).info('handler: stream连接成功')
    call.on('data', (response) => {
      let {projectId, flowId, job, elementId, elementJob, config} = response
      try {
        this.flow.handler(this.app, {module: MODULE_HANDLER}, {
          projectId, flowId, job, elementId, elementJob, 'config': JSON.parse(Buffer.from(config).toString())
        }, (err, data) => {
          let r = '';
          let status = true
          if (err) {
            r = `${err}`
            status = false
          }
          call.write({
            elementJob, status, info: r, result: Buffer.from(JSON.stringify(data))
          })
        })
      } catch (err) {
        call.write({
          elementJob, status: false, info: `${err}`
        })
      }
    })
    call.on('end', () => {
      // The server has finished sending
      log.getLogger().module(MODULE_HANDLER).info('handler: stream end')
    })
    call.on('error', (e) => {
      // An error has occurred and the stream has been closed.
      log.getLogger().module(MODULE_HANDLER).detail(e).error('handler: stream错误')
    })
    call.on('status', (status) => {
      // process status
      log.getLogger().module(MODULE_HANDLER).info('handler: stream status=%j', status)
    })
  }

  debugStream = () => {
    const call = this.grpcClient.DebugStream(this.getMetadata())
    call.on('data', response => {
      const {projectId, flowId, elementId, elementJob, config} = response
      let replied = false
      const reply = (err, result) => {
        if (replied) return
        replied = true
        call.write({elementJob, status: !err, info: err ? String(err) : '',
          result: Buffer.from(JSON.stringify(result || {logs: [], value: {}}))})
      }
      try {
        this.flow.debug(this.app, {module: '调试'}, {
          projectId, flowId, elementId, config: JSON.parse(Buffer.from(config).toString())
        }, reply)
      } catch (err) {
        reply(err)
      }
    })
    call.on('error', err => log.getLogger().detail(err).error('debug stream错误'))
  }
}

export = GrpcClient
