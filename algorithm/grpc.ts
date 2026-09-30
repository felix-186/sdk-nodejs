// @ts-nocheck
const path = require('path')
const grpc = require('@grpc/grpc-js')
const protoLoader = require('@grpc/proto-loader')
const PROTO_PATH = path.join(__dirname, 'proto', 'algorithm.proto')
const log = require('../log')

log.getLogger().info("flow grpc path: %s", PROTO_PATH)
let packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
});

const algorithmServiceProto = grpc.loadPackageDefinition(packageDefinition).algorithm;

const MODULE_HEALTHCHECK = "健康检查"
const MODULE_SCHEMA = "Schema"
const MODULE_RUN = "执行算法"

class GrpcClient {

  start(app, algorithm) {
    this.app = app
    this.algorithm = algorithm
    this.startAll()
  }

  startAll() {
    this.retry = 0
    // 连接驱动管理
    this.conn()
    // 健康检查
    this.healthCheck()
    this.schemaStream()
    this.runStream()
  }

  conn() {
    log.getLogger().info('连接算法管理: 配置=%j', this.app.cfg['algorithm-grpc'])
    this.grpcClient = new algorithmServiceProto.AlgorithmService(`${this.app.cfg['algorithm-grpc'].host}:${this.app.cfg['algorithm-grpc'].port}`, grpc.credentials.createInsecure())
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

  getMetadata = () => {
    let meta = new grpc.Metadata()
    meta.add('serviceId', Buffer.from(this.app.cfg.serviceId, 'utf8').toString('hex'))
    meta.add('algorithmId', Buffer.from(this.app.cfg.algorithm.id, 'utf8').toString('hex'))
    meta.add('algorithmName', Buffer.from(this.app.cfg.algorithm.name, 'utf8').toString('hex'))
    return meta
  }

  healthCheck = () => {
    log.getLogger().module(MODULE_HEALTHCHECK).info('健康检查: 启动')
    this.healthCheckJob = this.app.schedule.scheduleJob('*/5 * * * * *', () => {
      log.getLogger().module(MODULE_HEALTHCHECK).debug('健康检查: 开始')
      this.grpcClient.HealthCheck({service: this.app.cfg.serviceId}, (err, data) => {
        if (err) {
          log.getLogger().module(MODULE_HEALTHCHECK).detail(err).error(`健康检查: 第%d次错误`, this.retry)
          if (this.retry > 3) {
            this.restart()
          } else {
            this.retry++
          }
        } else {
          log.getLogger().module(MODULE_HEALTHCHECK).debug('健康检查: 返回值=%j', data)
          if (data.status === 'SERVING') {
            log.getLogger().module(MODULE_HEALTHCHECK).debug('健康检查: 正常')
            if (data.errors !== null && data.errors !== undefined && data.errors.length > 0) {
              log.getLogger().module(MODULE_HEALTHCHECK).error("健康检查: 错误=%j", data.errors)
            }
          } else if (data.status === 'SERVICE_UNKNOWN') {
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
      try {
        this.algorithm.schema(this.app, {module: MODULE_SCHEMA}, response["lang"], (err, data) => {
          let r;
          if (err) {
            r = {code: 400, error: `${err}`}
          } else {
            r = {code: 200, result: data}
          }
          let b1 = Buffer.from(JSON.stringify(r))
          call.write({
            request: response.request, message: b1
          })
        })
      } catch (err) {
        let b1 = Buffer.from(JSON.stringify({code: 400, error: `${err}`}), 'utf8')
        call.write({
          request: response.request, message: b1
        })
      }
    })
    call.on('end', () => {
      // The server has finished sending
      log.getLogger().module(MODULE_SCHEMA).info('schema: stream end')
    })
    call.on('error', (e) => {
      // An error has occurred and the stream has been closed.
      log.getLogger().module(MODULE_SCHEMA).detail(e).error('schema: stream错误')
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
        this.algorithm.run(this.app, {module: MODULE_RUN}, JSON.parse(Buffer.from(data).toString()), (err, result) => {
          let r;
          if (err) {
            r = {code: 400, error: `${err}`}
          } else {
            r = {code: 200, result: result}
          }
          let b1 = Buffer.from(JSON.stringify(r))
          call.write({
            request: request, message: b1
          })
        })
      } catch (err) {
        let b1 = Buffer.from(JSON.stringify({code: 400, error: `${err}`}), 'utf8')
        call.write({
          request: request, message: b1
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