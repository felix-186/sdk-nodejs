// @ts-nocheck
const path = require('path')
const grpc = require('@grpc/grpc-js')
const protoLoader = require('@grpc/proto-loader')
const packageJson = require("../package.json");
const PROTO_PATH = path.join(__dirname, 'proto', 'engine.proto')
const log = require('../log')

log.getLogger().debug("flow grpc path: %s", PROTO_PATH)
let packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
});

const MODULE_HEALTHCHECK = "健康检查"
const MODULE_SCHEMA = "Schema"
const MODULE_RUN = "执行扩展节点"

const flowServiceProto = grpc.loadPackageDefinition(packageDefinition).engine;

class GrpcClient {

  start(app, extension) {
    this.app = app
    this.extension = extension
    this.startAll()
  }

  startAll() {
    this.retry = 0
    // 连接驱动管理
    this.connFlow()
    // console.log('flow extension stream')
    this.schemaStream()
    this.runStream()
    // 健康检查
    this.healthCheck()
  }

  connFlow() {
    log.getLogger().info('连接流程引擎: 配置=%j', this.app.cfg['flow-engine'])
    this.grpcClient = new flowServiceProto.ExtensionService(`${this.app.cfg['flow-engine'].host}:${this.app.cfg['flow-engine'].port}`, grpc.credentials.createInsecure())
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
    meta.add('id', Buffer.from(this.app.cfg.extension.id, 'utf8').toString('hex'))
    meta.add('name', Buffer.from(this.app.cfg.extension.name, 'utf8').toString('hex'))
    return meta
  }

  healthCheck = () => {
    log.getLogger().info('健康检查: 启动')
    this.healthCheckJob = this.app.schedule.scheduleJob('*/5 * * * * *', () => {
      log.getLogger().module(MODULE_HEALTHCHECK).debug('健康检查: 开始')
      this.grpcClient.HealthCheck({id: this.app.cfg.extension.id}, (err, res) => {
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

  schemaStream = () => {
    let call = this.grpcClient.SchemaStream(this.getMetadata())
    log.getLogger().module(MODULE_SCHEMA).info('schema: stream连接成功')
    call.on('data', (response) => {
      let {request} = response
      try {
        this.extension.schema(this.app, {module: MODULE_SCHEMA}, response['locale'], (err, data) => {
          let r = {request}
          if (err) {
            r = {...r, status: false, info: `${err}`}
          } else {
            r = {...r, status: true, result: Buffer.from(data)}
          }
          call.write(r)
        })
      } catch (err) {
        call.write({
          request: request, status: false, info: `${err}`
        })
      }
    })
    call.on('end', () => {
      // The server has finished sending
      log.getLogger().module(MODULE_SCHEMA).info('schema: stream end')
    })
    call.on('error', (e) => {
      // An error has occurred and the stream has been closed.
      log.getLogger().module(MODULE_SCHEMA).detail(e).error('schema: stream 错误')
    })
    call.on('status', (status) => {
      // process status
      log.getLogger().module(MODULE_SCHEMA).info('schema: stream status=%j', status)
    })
  }

  runStream = () => {
    let call = this.grpcClient.RunStream(this.getMetadata())
    log.getLogger().module(MODULE_RUN).info('run: stream连接成功')
    call.on('data', (response) => {
      let {request, data} = response
      try {
        this.extension.run(this.app, {module: MODULE_RUN}, JSON.parse(Buffer.from(data).toString()), (err, ret) => {
          let r = {request}
          if (err) {
            r = {...r, status: false, info: `${err}`}
          } else {
            if (!ret) {
              ret = {}
            }
            r = {...r, status: true, result: Buffer.from(JSON.stringify(ret))}
          }
          call.write(r)
        })
      } catch (err) {
        call.write({
          request: request, status: false, info: `${err}`
        })
      }

    })
    call.on('end', () => {
      // The server has finished sending
      log.getLogger().module(MODULE_RUN).info('run: stream end')
    })
    call.on('error', (e) => {
      // An error has occurred and the stream has been closed.
      log.getLogger().module(MODULE_RUN).detail(e).error('run: stream错误')
    })
    call.on('status', (status) => {
      // process status
      log.getLogger().module(MODULE_RUN).info('run: stream status=%j', status)
    })
  }
}

export = GrpcClient