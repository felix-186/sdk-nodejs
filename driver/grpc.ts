// @ts-nocheck
const path = require('path')
const _ = require('lodash')
const moment = require('moment')
const grpc = require('@grpc/grpc-js')
const protoLoader = require('@grpc/proto-loader')
const PROTO_PATH = path.join(__dirname, 'proto', 'driver.proto')
const log = require('../log')
const packageJson = require('../package.json');
const {randomBytes} = require('crypto')

log.getLogger().info("grpc path: %s", PROTO_PATH)
let packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
});

const driverServiceProto = grpc.loadPackageDefinition(packageDefinition).driver;

const MODULE_HEALTHCHECK = "健康检查"
const MODULE_SCHEMA = "Schema"
const MODULE_START = "启动驱动"
const MODULE_RUN = "执行指令"
const MODULE_WRITETAG = "写数据点"
const MODULE_BATCHRUN = "批量执行指令"
const MODULE_DEBUG = "调试"
const MODULE_HTTPPROXY = "Http代理"
const MODULE_CONFIGUPDATE = "配置更新"

class GrpcClient {

  start(app, driver) {
    this.app = app
    this.driver = driver
    this.startAll()
  }

  startAll() {
    this.stopped = false
    this.generation = (this.generation || 0) + 1
    this.streams = []
    this.retry = 0
    this.sessionId = randomBytes(12).toString('hex')
    // 连接驱动管理
    this.connDriver()
    // 健康检查
    this.healthCheck()
    this.schemaStream()
    this.startStream()
    this.runStream()
    this.writeTagStream()
    this.batchRunStream()
    this.debugStream()
    this.httpProxyStream()
    this.configUpdateStream()
  }

  connDriver() {
    log.getLogger().info('连接驱动: 配置=%j', this.app.cfg['driver-grpc'])
    this.grpcClient = new driverServiceProto.DriverService(`${this.app.cfg['driver-grpc'].host}:${this.app.cfg['driver-grpc'].port}`, grpc.credentials.createInsecure())
    this.driverInstructClient = new driverServiceProto.DriverInstructService(`${this.app.cfg['driver-grpc'].host}:${this.app.cfg['driver-grpc'].port}`, grpc.credentials.createInsecure())
  }

  stop() {
    this.stopped = true
    this.generation = (this.generation || 0) + 1
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    if (this.healthCheckJob) {
      this.healthCheckJob.cancel()
    }
    for (const stream of this.streams || []) stream.cancel()
    if (this.grpcClient) {
      this.grpcClient.close()
    }
    if (this.driverInstructClient) {
      this.driverInstructClient.close()
    }
  }

  restart() {
    this.stop()
    this.startAll()
  }

  track(call) {
    const generation = this.generation
    if (!this.streams) this.streams = []
    this.streams.push(call)
    const reconnect = () => {
      if (this.stopped || generation !== this.generation || this.reconnectTimer) return
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null
        if (!this.stopped && generation === this.generation) this.restart()
      }, this.app.cfg['driver-grpc'].waitTime || 5000)
    }
    call.on('end', reconnect)
    call.on('error', reconnect)
    return call
  }

  getMetadata = () => {
    let meta = new grpc.Metadata()
    meta.add('serviceId', Buffer.from(this.app.cfg.serviceId, 'utf8').toString('hex'))
    meta.add('projectId', Buffer.from(this.app.cfg.project, 'utf8').toString('hex'))
    meta.add('driverId', Buffer.from(this.app.cfg.driver.id, 'utf8').toString('hex'))
    meta.add('driverName', Buffer.from(this.app.cfg.driver.name, 'utf8').toString('hex'))
    meta.add('sessionId', Buffer.from(this.sessionId, 'utf8').toString('hex'))
    return meta
  }

  healthCheck = () => {
    log.getLogger().module(MODULE_HEALTHCHECK).group(this.app.cfg.groupId).info('健康检查: 启动')
    this.healthCheckJob = this.app.schedule.scheduleJob('*/5 * * * * *', () => {
      log.getLogger().module(MODULE_HEALTHCHECK).group(this.app.cfg.groupId).debug('健康检查: 开始')
      this.grpcClient.HealthCheck({
        service: this.app.cfg.serviceId, projectId: this.app.cfg.project, driverId: this.app.cfg.driver.id
      }, (err, res) => {
        if (err) {
          log.getLogger().module(MODULE_HEALTHCHECK).group(this.app.cfg.groupId).detail(err).error(`健康检查: 第%d次错误`, this.retry)
          if (this.retry > 3) {
            this.restart()
          } else {
            this.retry++
          }
        } else {
          log.getLogger().module(MODULE_HEALTHCHECK).group(this.app.cfg.groupId).debug('健康检查: 返回值=%j', res)
          if (res.status === 'SERVING') {
            this.retry = 0
            log.getLogger().module(MODULE_HEALTHCHECK).group(this.app.cfg.groupId).debug('健康检查: 正常')
            if (res.errors !== null && res.errors !== undefined && res.errors.length > 0) {
              log.getLogger().module(MODULE_HEALTHCHECK).group(this.app.cfg.groupId).error("健康检查: 错误=%j", res.errors)
              res.errors.forEach(err => {
                if (err.code === 'Start') {
                  this.restart()
                }
              })
            }
          } else if (res.status === 'SERVICE_UNKNOWN') {
            log.getLogger().module(MODULE_HEALTHCHECK).group(this.app.cfg.groupId).error("健康检查: 服务端未找到本算法服务")
            this.restart()
          }
        }
      })
    })
  }

  writeEvent = (event, cb) => {
    if (!event) {
      return cb(new Error('事件为空'))
    }
    let {table, id, eventId, time = moment().valueOf()} = event
    if (!table || table === '') {
      return cb(new Error('表id为空'))
    }
    if (!id || id === '') {
      return cb(new Error('设备id为空'))
    }
    if (!eventId || eventId === '') {
      return cb(new Error('事件id为空'))
    }
    event.time = time
    let b1 = Buffer.from(JSON.stringify(event))
    this.grpcClient.Event({project: this.app.cfg.project, data: b1}, (err, response) => {
      cb(err || (response && response.status ? null : new Error(response && response.info || '事件写入失败')))
    })
  }

  runLog = (log, cb) => {
    if (!log) {
      return cb(new Error('日志为空'))
    }
    let {serialNo, time = moment().valueOf()} = log
    if (!serialNo || serialNo === '') {
      return cb(new Error('流水号为空'))
    }
    log.time = time
    let b1 = Buffer.from(JSON.stringify(log))
    this.grpcClient.CommandLog({project: this.app.cfg.project, data: b1}, (err, response) => {
      cb(err || (response && response.status ? null : new Error(response && response.info || '指令日志写入失败')))
    })
  }

  updateTableData = (table, id, data, cb) => {
    if (!table || table === '') {
      return cb(new Error('表id为空'))
    }
    if (!id || id === '') {
      return cb(new Error('设备id为空'))
    }
    if (!data) {
      return cb(new Error('设备数据为空'))
    }
    let b1 = Buffer.from(JSON.stringify({table, id, data}))
    this.grpcClient.UpdateTableData({project: this.app.cfg.project, data: b1}, (err, response) => {
      cb(err || (response && response.status ? null : new Error(response && response.info || '设备更新失败')))
    })
  }

  findDevice = (table, id, cb) => {
    if (!id || id === '') {
      return cb(new Error('设备id为空'))
    }
    this.grpcClient.FindTableData({
      projectId: this.app.cfg.project,
      service: this.app.cfg.serviceId,
      driverId: this.app.cfg.driver.id,
      tableId: table,
      tableDataId: id
    }, (err, data) => {
      if (err) {
        return cb(err)
      }
      if (!data.status) {
        return cb(new Error(data.info + "," + data.detail))
      }
      try {
        let ret = JSON.parse(data.result.toString())
        return cb(null, ret)
      } catch (e) {
        return cb(e)
      }
    })
  }

  getCommands = (table, id, cb) => {
    if (!table || table === '') {
      return cb(new Error('表id为空'))
    }
    if (!id || id === '') {
      return cb(new Error('设备id为空'))
    }
    const metadata = new grpc.Metadata();
    metadata.add('x-request-project', this.app.cfg.project);
    this.driverInstructClient.GetCommands({"tableId": table, "tableDataId": id}, metadata, (err, result) => {
      if (err) {
        return cb(err)
      }
      if (!result.status) {
        return cb(new Error(result.info + "," + result.detail))
      }
      try {
        let r = JSON.parse(Buffer.from(result.result).toString('utf-8'))
        return cb(err, r);
      } catch (e) {
        return cb(e)
      }

    })
  }

  updateCommand = (id, data, cb) => {
    if (!id || id === '') {
      return cb(new Error('id为空'))
    }
    if (!data) {
      return cb(new Error('数据为空'))
    }
    const metadata = new grpc.Metadata();
    metadata.add('x-request-project', this.app.cfg.project);
    this.driverInstructClient.Update({"id": id, "data": Buffer.from(JSON.stringify(data))}, metadata, (err, result) => {
      if (err) {
        return cb(err)
      }
      if (!result.status) {
        return cb(new Error(result.info + "," + result.detail))
      }
      return cb(null)
    })
  }

  schemaStream = () => {
    let call = this.track(this.grpcClient.SchemaStream(this.getMetadata()))
    log.getLogger().module(MODULE_SCHEMA).group(this.app.cfg.groupId).info('schema: stream连接成功')
    call.on('data', (response) => {
      if (response.request === 'heartbeat') return
      try {
        log.getLogger().module(MODULE_SCHEMA).group(this.app.cfg.groupId).debug('schema: 接收到查询请求')
        this.driver.schema(this.app, {
          module: MODULE_SCHEMA, group: this.app.cfg.groupId
        }, response['locale'], (err, data) => {
          let r;
          if (err) {
            r = {code: 400, error: `${err}`}
          } else {
            data = data.replace("__version__", this.driver.getVersion()).replace("__sdk_version__", packageJson.version)
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
      log.getLogger().module(MODULE_SCHEMA).group(this.app.cfg.groupId).info('schema: stream end')
    })
    call.on('error', (e) => {
      // An error has occurred and the stream has been closed.
      log.getLogger().module(MODULE_SCHEMA).group(this.app.cfg.groupId).detail(e).error('schema: stream错误')
    })
    call.on('status', (status) => {
      // process status
      log.getLogger().module(MODULE_SCHEMA).group(this.app.cfg.groupId).info('schema: stream status=%j', status)
    })
  }

  startStream = () => {
    let call = this.track(this.grpcClient.StartStream(this.getMetadata()))
    log.getLogger().module(MODULE_START).group(this.app.cfg.groupId).info('start: stream连接成功')
    call.on('data', (response) => {
      if (response.request === 'heartbeat') return
      try {
        log.getLogger().module(MODULE_START).group(this.app.cfg.groupId).debug('start: 接收到开始请求')
        let config = JSON.parse(Buffer.from(response.config).toString())
        this.app.startDriver(config).then(() => {
          let r = {code: 200}
          let b1 = Buffer.from(JSON.stringify(r), 'utf8')
          call.write({
            request: response.request, message: b1
          })
        }).catch(err => {
          call.write({request: response.request,
            message: Buffer.from(JSON.stringify({code: 400, error: String(err)}))})
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
      log.getLogger().module(MODULE_START).group(this.app.cfg.groupId).info('start: stream end')
    })
    call.on('error', (e) => {
      // An error has occurred and the stream has been closed.
      log.getLogger().module(MODULE_START).group(this.app.cfg.groupId).detail(e).error('start: stream错误')
    })
    call.on('status', (status) => {
      // process status
      log.getLogger().module(MODULE_START).group(this.app.cfg.groupId).info('start: stream status=%j', status)
    })
  }

  runStream() {
    let call = this.track(this.grpcClient.RunStream(this.getMetadata()))
    log.getLogger().module(MODULE_RUN).group(this.app.cfg.groupId).info('执行指令: stream连接成功')
    call.on('data', (response) => {
      if (response.request === 'heartbeat') return
      let {request, tableId, id, command, serialNo} = response
      try {
        log.getLogger().module(MODULE_RUN).group(this.app.cfg.groupId).debug('执行指令: 设备表=%s,设备=%s,指令=%j', tableId, id, command)
        this.driver.run(this.app, {
          module: MODULE_RUN, group: this.app.cfg.groupId, table: tableId, tableData: id,
        }, {
          'table': tableId, 'id': id, 'serialNo': serialNo, 'command': JSON.parse(Buffer.from(command).toString())
        }, (err, data) => {
          let r;
          if (err) {
            r = {code: 400, error: `${err}`}
          } else {
            r = {code: 200, result: data}
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
      log.getLogger().module(MODULE_RUN).group(this.app.cfg.groupId).info('执行指令: stream end')
    })
    call.on('error', (e) => {
      // An error has occurred and the stream has been closed.
      log.getLogger().module(MODULE_RUN).group(this.app.cfg.groupId).detail(e).error('执行指令: stream错误')
    })
    call.on('status', (status) => {
      // process status
      log.getLogger().module(MODULE_RUN).group(this.app.cfg.groupId).info('执行指令: stream status=%j', status)
    })
  }

  writeTagStream = () => {
    let call = this.track(this.grpcClient.WriteTagStream(this.getMetadata()))
    log.getLogger().module(MODULE_WRITETAG).group(this.app.cfg.groupId).info('写数据点: stream连接成功')
    call.on('data', (response) => {
      if (response.request === 'heartbeat') return
      let {request, tableId, id, command, serialNo} = response
      try {
        log.getLogger().module(MODULE_WRITETAG).group(this.app.cfg.groupId).debug('写数据点: 设备表=%s,设备=%s,指令=%j', tableId, id, command)
        this.driver.writeTag(this.app, {
          module: MODULE_WRITETAG, group: this.app.cfg.groupId, table: tableId, tableData: id,
        }, {
          'table': tableId, 'id': id, 'serialNo': serialNo, 'command': JSON.parse(Buffer.from(command).toString())
        }, (err, data) => {
          let r;
          if (err) {
            r = {code: 400, error: `${err}`}
          } else {
            r = {code: 200, result: data}
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
      log.getLogger().module(MODULE_WRITETAG).group(this.app.cfg.groupId).info('写数据点: stream end')
    })
    call.on('error', (e) => {
      // An error has occurred and the stream has been closed.
      log.getLogger().module(MODULE_WRITETAG).group(this.app.cfg.groupId).detail(e).error('写数据点: stream错误')
    })
    call.on('status', (status) => {
      // process status
      log.getLogger().module(MODULE_WRITETAG).group(this.app.cfg.groupId).info('写数据点: stream status=%j', status)
    })
  }

  batchRunStream = () => {
    let call = this.track(this.grpcClient.BatchRunStream(this.getMetadata()))
    log.getLogger().module(MODULE_BATCHRUN).group(this.app.cfg.groupId).info('批量执行指令: stream连接成功')
    call.on('data', (response) => {
      if (response.request === 'heartbeat') return
      let {request, tableId, id, command, serialNo} = response
      try {
        log.getLogger().module(MODULE_BATCHRUN).group(this.app.cfg.groupId).debug('批量执行指令: 设备表=%s,设备=%j,指令=%j', tableId, id, command)
        this.driver.batchRun(this.app, {
          module: MODULE_BATCHRUN, group: this.app.cfg.groupId, table: tableId,
        }, {
          'table': tableId, 'ids': id, 'serialNo': serialNo, 'command': JSON.parse(Buffer.from(command).toString())
        }, (err, data) => {
          let r;
          if (err) {
            r = {code: 400, error: `${err}`}
          } else {
            r = {code: 200, result: data}
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
      log.getLogger().module(MODULE_BATCHRUN).group(this.app.cfg.groupId).info('批量执行指令: stream end')
    })
    call.on('error', (e) => {
      // An error has occurred and the stream has been closed.
      log.getLogger().module(MODULE_BATCHRUN).group(this.app.cfg.groupId).detail(e).error('批量执行指令: stream错误')
    })
    call.on('status', (status) => {
      // process status
      log.getLogger().module(MODULE_BATCHRUN).group(this.app.cfg.groupId).info('批量执行指令: stream status=%j', status)
    })
  }

  debugStream = () => {
    let call = this.track(this.grpcClient.DebugStream(this.getMetadata()))
    log.getLogger().module(MODULE_DEBUG).group(this.app.cfg.groupId).info('调试: stream连接成功')
    call.on('data', (response) => {
      if (response.request === 'heartbeat') return
      try {
        let data = Buffer.from(response.data).toString()
        log.getLogger().module(MODULE_DEBUG).group(this.app.cfg.groupId).debug('调试: 数据=%s', data)
        this.driver.debug(this.app, {
          module: MODULE_DEBUG, group: this.app.cfg.groupId,
        }, JSON.parse(data), (err, data) => {
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
      log.getLogger().module(MODULE_DEBUG).group(this.app.cfg.groupId).info('调试: stream end')
    })
    call.on('error', (e) => {
      // An error has occurred and the stream has been closed.
      log.getLogger().module(MODULE_DEBUG).group(this.app.cfg.groupId).detail(e).error('调试: stream错误')
    })
    call.on('status', (status) => {
      // process status
      log.getLogger().module(MODULE_DEBUG).group(this.app.cfg.groupId).info('调试: stream status=%j', status)
    })
  }

  httpProxyStream = () => {
    let call = this.track(this.grpcClient.HttpProxyStream(this.getMetadata()))
    log.getLogger().module(MODULE_HTTPPROXY).group(this.app.cfg.groupId).info('httpProxy: stream连接成功')
    call.on('data', (response) => {
      if (response.request === 'heartbeat') return
      try {
        let header = null
        if (response.headers) {
          header = JSON.parse(Buffer.from(response.headers).toString())
        }
        log.getLogger().module(MODULE_HTTPPROXY).group(this.app.cfg.groupId).debug('httpProxy: type=%s,header=%j,请求数据=%s', response.type, header, Buffer.from(response.data).toString())
        this.driver.httpProxy(this.app, {
          module: MODULE_HTTPPROXY, group: this.app.cfg.groupId,
        }, response.type, header, response.data, (err, data) => {
          let r;
          if (err) {
            r = {code: 400, error: `${err}`}
          } else {
            r = {code: 200, result: data}
          }
          let b1 = Buffer.from(JSON.stringify(r))
          call.write({
            request: response.request, data: b1
          })
        })
      } catch (err) {
        let b1 = Buffer.from(JSON.stringify({code: 400, error: `${err}`}), 'utf8')
        call.write({
          request: response.request, data: b1
        })
      }

    })
    call.on('end', () => {
      // The server has finished sending
      log.getLogger().module(MODULE_HTTPPROXY).group(this.app.cfg.groupId).info('httpProxy: stream end')
    })
    call.on('error', (e) => {
      // An error has occurred and the stream has been closed.
      log.getLogger().module(MODULE_HTTPPROXY).group(this.app.cfg.groupId).detail(e).error('httpProxy: stream错误')
    })
    call.on('status', (status) => {
      // process status
      log.getLogger().module(MODULE_HTTPPROXY).group(this.app.cfg.groupId).info('httpProxy: stream status=%j', status)
    })
  }

  configUpdateStream = () => {
    let call = this.track(this.grpcClient.ConfigUpdateStream(this.getMetadata()))
    log.getLogger().module(MODULE_CONFIGUPDATE).group(this.app.cfg.groupId).info('配置更新: stream连接成功')
    call.on('data', (response) => {
      if (response.request === 'heartbeat') return
      try {
        log.getLogger().module(MODULE_CONFIGUPDATE).group(this.app.cfg.groupId).debug('配置更新: 请求数据=%j', response)
        switch (response.opsType) {
          case "EDIT_DRIVER":
            let config = JSON.parse(response.edit_driver.driver.toString());
            this.updateDriverCache(config);
            break
          case "ADD_TABLE":
            let configAdd = JSON.parse(response.add_table.table.toString());
            this.updateTableCache(response.add_table.tableId, configAdd);
            break
          case "EDIT_TABLE":
            let configEdit = JSON.parse(response.edit_table.table.toString());
            this.updateTableCache(response.edit_table.tableId, configEdit);
            break
          case "DEL_TABLE":
            this.delTableCache(response.del_table.tableId);
            break
          case "ADD_DEVICE":
            let addDevice = response.add_device_data;
            this.addDeviceCache(addDevice.tableId, addDevice.tableDataId);
            break
          case "DEL_DEVICE":
            let delDevice = response.del_device_data;
            this.delDeviceCache(delDevice.tableId, delDevice.tableDataId);
            break
        }
        this.driver.configUpdate(this.app, {
          module: MODULE_CONFIGUPDATE, group: this.app.cfg.groupId,
        }, response, (err) => {
          let r = {request: response.request, status: true}
          if (err) {
            r.status = false
            r.detail = `${err}`
          }
          call.write(r)
        })
      } catch (err) {
        call.write({
          request: response.request, status: false, detail: `${err}`
        })
      }

    })
    call.on('end', () => {
      // The server has finished sending
      log.getLogger().module(MODULE_CONFIGUPDATE).group(this.app.cfg.groupId).info('配置更新: stream end')
    })
    call.on('error', (e) => {
      // An error has occurred and the stream has been closed.
      log.getLogger().module(MODULE_CONFIGUPDATE).group(this.app.cfg.groupId).detail(e).error('配置更新: stream错误')
    })
    call.on('status', (status) => {
      // process status
      log.getLogger().module(MODULE_CONFIGUPDATE).group(this.app.cfg.groupId).info('配置更新: stream status=%j', status)
    })
  }

  updateDriverCache = (config) => {
    this.app.cacheConfig = Object.create(null)
    if (config.tables && _.isArray(config.tables)) {
      config.tables.forEach(t => {
        if (t.devices && _.isArray(t.devices)) {
          t.devices.forEach(d => {
            let dev = this.app.cacheConfig[d.id]
            if (dev) {
              dev[t.id] = 0
            } else {
              dev = Object.create(null)
              dev[t.id] = 0
            }
            this.app.cacheConfig[d.id] = dev
          })
        }
      })
    }
  }

  updateTableCache = (tableId, t) => {
    this.delTableCache(tableId)
    if (t && t.devices && _.isArray(t.devices)) {
      t.devices.forEach(d => {
        let dev = this.app.cacheConfig[d.id]
        if (dev) {
          dev[tableId] = 0
        } else {
          dev = Object.create(null)
          dev[tableId] = 0
        }
        this.app.cacheConfig[d.id] = dev
      })
    }
  }

  delTableCache = (tableId) => {
    for (const devId in this.app.cacheConfig) {
      let tables = this.app.cacheConfig[devId];
      for (const table in tables) {
        if (tableId === table) {
          delete tables[table];
        }
      }
      if (Object.keys(tables).length === 0) {
        delete this.app.cacheConfig[devId];
      }
    }
  }

  addDeviceCache = (tableId, deviceId) => {
    let devAdd = this.app.cacheConfig[deviceId]
    if (devAdd) {
      devAdd[tableId] = 0
    } else {
      devAdd = Object.create(null)
      devAdd[tableId] = 0
    }
    this.app.cacheConfig[deviceId] = devAdd
  }

  delDeviceCache = (tableId, deviceId) => {
    let tables = this.app.cacheConfig[deviceId];
    if (!tables) return
    delete tables[tableId];
    if (Object.keys(tables).length === 0) {
      delete this.app.cacheConfig[deviceId];
    }
  }
}

export = GrpcClient
