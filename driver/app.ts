// @ts-nocheck
const moment = require('moment')
const schedule = require('node-schedule')
const _ = require('lodash')
const Mqtt = require('../conn/mqtt')
const Rabbit = require('../conn/rabbit')
const KafkaJS = require('../conn/kafka')
const LocalMQ = require('../conn/local')
const log = require('../log')
const GrpcClient = require('./grpc')
const ConvertTag = require('./tag.js')
const util = require("util");
const grpc = require("@grpc/grpc-js");
const {decodeConfig} = require('../utils/cipherx');
const {v4: uuidv4} = require('uuid')
const fs = require('fs')
const DriverHttp = require('./http')
const license = require('./license')

// const {v4: uuidv4} = require('uuid');

class App {
  static async fromConfig(source, overrides) {
    return new App(await require('../config').load(source, overrides))
  }

  constructor(cfg) {
    cfg = require('../config').normalize(cfg)
    let defaultCfg = {
      project: 'default',
      serviceId: '',
      logger: {level: 'info', fmt: 'json', tz: 'Asia/Shanghai'},
      mq: {
        type: 'mqtt',
        mqtt: {host: 'mqtt', port: 1883, username: 'admin', password: 'public'},
        rabbit: {host: 'rabbit', port: 5672, username: 'admin', password: 'public'},
        kafka: {brokers: ['kafka:9092']}, local: {}
      },
      'driver-grpc': {
        host: 'driver', port: 9224,
      },
      http: {enable: false, host: '0.0.0.0', port: 8080},
      dataFile: {enable: false, path: 'data.json'},
      api: {
        host: 'traefik', port: 80, endpoint: 'http://traefik:80', 'ak': '', 'sk': '', credentials: {ak: '', sk: ''}
      },
      etcd: {
        host: 'etcd', port: 2379, username: 'root', password: ''
      }
    }
    let mergeCfg = _.merge({}, defaultCfg, cfg)
    if (cfg && cfg.driverGrpc) mergeCfg['driver-grpc'] = _.merge({}, mergeCfg['driver-grpc'], cfg.driverGrpc)
    this.cfg = decodeConfig(mergeCfg)
    this.cfg.groupId = this.cfg.groupId || this.cfg.group || ''
    this.cacheConfig = Object.create(null)
    this.init()
  }

  init() {
    let logger = log.getLogger()
    if (this.cfg.driver === undefined) {
      logger.error('driver为空')
      process.exit(1)
    }
    if (this.cfg.driver.id === undefined || this.cfg.driver.id === '') {
      logger.error('驱动id为空')
      process.exit(1)
    }
    if (this.cfg.driver.name === undefined || this.cfg.driver.name === '') {
      logger.error('驱动name为空')
      process.exit(1)
    }
    if (!this.cfg.serviceId) this.cfg.serviceId = `${this.cfg.driver.id}-${uuidv4()}`
    this.schedule = schedule
    if (this.cfg.mq.type === 'rabbit') {
      this.mqClient = new Rabbit(this.cfg.mq.rabbit)
    } else if (this.cfg.mq.type === 'kafka') {
      this.mqClient = new KafkaJS(this.cfg.mq.kafka)
    } else if (this.cfg.mq.type === 'local') {
      this.mqClient = new LocalMQ(this.cfg.mq.local)
    } else {
      this.mqClient = new Mqtt(this.cfg.mq.mqtt)
    }
    // let syslog = {"projectId":this.cfg.project,"service":util.format("%s-%s-%s",this.cfg.project,this.cfg.serviceId,this.cfg.driver.id)}
    // this.log = log(this.cfg.logger.level, this.cfg.logger.fmt, syslog, this.cfg.logger.tz)
    log.init(this.cfg.logger.level, this.cfg.logger.fmt, this.cfg.logger.tz)
    log.setServiceName(util.format("%s-%s-%s", this.cfg.project, this.cfg.serviceId, this.cfg.driver.id))
    log.setProjectId(this.cfg.project)
    log.setGroup(this.cfg.groupId)
    this.cacheConfig = Object.create(null)
    this.convertTag = new ConvertTag()
    this.cacheValue = {}
    this.deviceStatus = new Map()
  }

  /**
   * @name: start
   * @msg: 驱动启动
   * @param driver class 继承Driver类
   */
  start(driver) {
    let logger = log.getLogger()
    logger.info('启动服务: serviceId=%s, driverId=%s', this.cfg.serviceId, this.cfg.driver.id)
    this.driver = driver
    this.grpcClient = new GrpcClient()
    this.grpcClient.app = this
    if (this.cfg.http.enable) {
      this.http = new DriverHttp(this, driver)
      this.http.start().catch(err => logger.detail(err).error('HTTP 服务启动失败'))
      this.statusTimer = setInterval(() => this.checkDeviceStatus(), 1000)
    }
    if (this.cfg['driver-grpc'].enable !== false) {
      this.grpcClient.start(this, driver)
    }
    if (this.cfg.dataFile.enable) {
      this.loadDataConfig().catch(err => logger.detail(err).error('加载 data 配置失败'))
      fs.watchFile(this.cfg.dataFile.path, {interval: 1000}, (current, previous) => {
        if (current.mtimeMs && current.mtimeMs !== previous.mtimeMs &&
          current.mtimeMs !== this.savedDataMtime) {
          this.loadDataConfig().catch(err => logger.detail(err).error('重新加载 data 配置失败'))
        }
      })
    }
    process.stdin.resume()
    let handle = (signal) => {
      logger.info(`停止服务: 信号=${signal}`)
      this.stop(driver)
    }
    this.signalHandler = handle
    process.on('SIGINT', handle)
    process.on('SIGTERM', handle)
  }

  /**
   * @name: stop
   * @msg: 停止操作
   * @param driver class 继承Driver类
   */
  stop(driver) {
    let logger = log.getLogger()
    if (this.stopping) return this.stopping
    driver = driver || this.driver
    this.stopping = (async () => {
      if (this.signalHandler) {
        process.off('SIGINT', this.signalHandler)
        process.off('SIGTERM', this.signalHandler)
      }
      if (this.cfg.dataFile.enable) fs.unwatchFile(this.cfg.dataFile.path)
      if (this.statusTimer) clearInterval(this.statusTimer)
      try {
        await new Promise((resolve, reject) => driver.stop(this, {}, err => err ? reject(err) : resolve()))
      } catch (err) {
        logger.detail(err).error('停止驱动错误')
      }
      if (this.cfg['driver-grpc'].enable !== false) this.grpcClient.stop()
      if (this.http) await this.http.stop()
      await new Promise(resolve => this.mqClient.close(resolve))
      process.stdin.pause()
      logger.info('停止服务')
    })()
    return this.stopping
  }

  getProjectId() { return this.cfg.project }
  getGroupID() { return this.cfg.groupId || '' }
  getServiceId() { return this.cfg.serviceId }
  getMQ() { return this.mqClient }
  getRouter() { return this.http && this.http.router }
  startHTTPServer() { return this.http && this.http.start() }

  async startDriver(config) {
    if (this.cfg.license || this.cfg.licenseLibrary) {
      license.verify(this.cfg.license || '', this.cfg.driver.id, config, this.cfg.licenseLibrary)
    }
    this.grpcClient.updateDriverCache(config)
    this.dataConfig = config
    return new Promise((resolve, reject) => {
      this.driver.start(this, {module: '启动驱动', group: this.cfg.groupId}, config,
        err => err ? reject(err) : resolve())
    })
  }

  async loadDataConfig() {
    let content
    try {
      content = await fs.promises.readFile(this.cfg.dataFile.path, 'utf8')
    } catch (err) {
      if (err.code === 'ENOENT') return
      throw err
    }
    if (content.trim()) await this.startDriver(JSON.parse(content))
  }

  async saveDataConfig(config) {
    this.dataConfig = config
    if (!this.cfg.dataFile.enable) return
    await fs.promises.writeFile(this.cfg.dataFile.path, JSON.stringify(config, null, 2))
    this.savedDataMtime = (await fs.promises.stat(this.cfg.dataFile.path)).mtimeMs
  }

  savePoints = async (meta, table, point) => {
    if (!table) throw new Error('表id为空')
    if (!point || !point.id) throw new Error('设备id为空')
    if (!point.fields || Object.keys(point.fields).length === 0) throw new Error('写入值为空')
    const time = point.time || Date.now()
    if (!Number.isFinite(time) || time > 9999999999999 || time < 1000000000000) {
      throw new Error('时间无效')
    }
    const data = {...point, time, source: point.source || 'device'}
    delete data.id
    await this.mqClient.send(['data', this.cfg.project, table, point.id], data)
    if (this.http) {
      this.http.broadcast('data', table, point.id, {fields: point.fields, time})
      this.updateDeviceLastSeen(table, point.id)
    }
  }

  broadcastRealtimeData(table, point) {
    if (this.http) this.http.broadcast('data', table, point.id, {fields: point.fields, time: point.time})
  }

  updateDeviceLastSeen(table, id) {
    const now = Date.now()
    this.deviceStatus.set(`${table}:${id}`, {lastSeen: now, status: 'online'})
    this.broadcastDeviceStatus(table, id, 'online', now)
  }

  broadcastDeviceStatus(table, id, status, lastSeen) {
    if (this.http) this.http.broadcast('status', table, id, {status, lastSeen})
  }

  getDeviceTimeout(table, id) {
    const config = this.dataConfig || {}
    const model = (config.tables || []).find(item => item.id === table)
    const device = model && (model.devices || []).find(item => item.id === id)
    const timeout = item => Number(item && item.device && item.device.settings &&
      item.device.settings.network && item.device.settings.network.timeout) || 0
    return timeout(device) || timeout(model) || timeout(config)
  }

  checkDeviceStatus() {
    for (const [key, record] of this.deviceStatus) {
      const separator = key.indexOf(':')
      const table = key.slice(0, separator)
      const id = key.slice(separator + 1)
      const timeout = this.getDeviceTimeout(table, id)
      if (timeout > 0 && record.status === 'online' && Date.now() - record.lastSeen > timeout * 1000) {
        record.status = 'offline'
        this.broadcastDeviceStatus(table, id, 'offline', record.lastSeen)
      }
    }
  }

  /**
   * @name: event
   * @msg: 写事件
   * @param meta 日志元数据
   * @param event
   */
  writeEvent = (meta, event) => new Promise((resolve, reject) => {
    this.grpcClient.writeEvent(event, (err) => {
      if (err) {
        return reject(err)
      } else {
        return resolve()
      }
    })
  });

  /**
   * @name: runLog
   * @msg: 写日志
   * @param meta
   * @param log
   */
  runLog = (meta, log) => new Promise((resolve, reject) => {
    this.grpcClient.runLog(log, (err) => {
      if (err) {
        return reject(err)
      } else {
        return resolve()
      }
    })
  });

  /**
   * @name: updateNode
   * @msg: 更新设备属性
   * @param meta 日志元数据
   * @param table
   * @param id
   * @param custom
   */
  updateNode = (meta, table, id, custom) => new Promise((resolve, reject) => {
    this.grpcClient.updateTableData(table, id, custom, (err) => {
      if (err) {
        return reject(err)
      } else {
        return resolve()
      }
    })
  });

  findDevice = (meta, table, id) => new Promise((resolve, reject) => {
    this.grpcClient.findDevice(table, id, (err, data) => {
      if (err) {
        return reject(err)
      } else {
        return resolve(data)
      }
    })
  });

  getCommands = (meta, table, id) => new Promise((resolve, reject) => {
    this.grpcClient.getCommands(table, id, (err, data) => {
      if (err) {
        return reject(err)
      } else {
        return resolve(data)
      }
    })
  });

  updateCommand = (meta, id, data) => new Promise((resolve, reject) => {
    this.grpcClient.updateCommand(id, data, (err, data) => {
      if (err) {
        return reject(err)
      } else {
        return resolve(data)
      }
    })
  });

  resolveTable(id) {
    const tables = Object.keys(this.cacheConfig[id] || {})
    if (tables.length === 0) throw new Error('未找到设备所在的表')
    if (tables.length > 1) throw new Error('设备所在的表不唯一')
    return tables[0]
  }

  /**
   * @name: writeWarning
   * @msg: 写报警
   * @param meta 日志元数据
   * @param warning // {"id":"test2","tableId":"modbusrtu","tableDataId":"mr1","level":"中","ruleid":"0049e98e-cbdd-4a06-b0c7-0d1474f3789b","fields":[{"id":"p1","value":1}],"type":["1z875xn8-2237-4544-7770-4kix918vb342"],"pocessed":"已处理","time":"2023-11-24T15:11:19+08:00","alert":false,"status":"未确认","handle":false,"desc":"测试报警"}
   */
  writeWarning = (meta, warning) => new Promise((resolve, reject) => {
    if (!warning) {
      return reject(new Error('报警数据为空'))
    }
    if (!warning.tableDataId || warning.tableDataId === '') {
      return reject(new Error('设备id为空'))
    }
    if (!warning.tableId || warning.tableId === '') {
      try {
        warning.tableId = this.resolveTable(warning.tableDataId)
      } catch (err) {
        return reject(err)
      }
    }
    if (!warning.tableId || warning.tableId === '') {
      return reject(new Error('表id为空'))
    }
    warning['table'] = {'id': warning.tableId}
    warning['tableData'] = {'id': warning.tableDataId}
    if (!warning.time) warning.time = moment().format()
    log.getLogger(meta).table(warning.tableId)
      .tableData(warning.tableDataId).debug(`保存报警数据: 设备表=%s,设备=%s,数据=%j`, warning.tableId, warning.tableDataId, warning)
    Promise.resolve().then(() => this.mqClient.send(['warningStorage', this.cfg.project, warning.tableId, warning.tableDataId], warning))
      .then(resolve, reject)
  });


  /**
   * @name: writeWarningRecovery
   * @msg: 更新报警恢复数据
   * @param meta 日志元数据
   * @param table 表id
   * @param id 设备id
   * @param warning // {"id":["test2"],"data":{"recoveryTime":"2023-11-24T15:08:40+08:00","recoveryFields":[{"id":"p1","value":1}]}}
   */
  writeWarningRecovery = (meta, table, id, warning) => new Promise((resolve, reject) => {
    if (!table || table === '') {
      return reject(new Error('表id为空'))
    }
    if (!id || id === '') {
      return reject(new Error('设备id为空'))
    }
    if (!warning || !(warning.id) || warning.id.length === 0) {
      return reject(new Error('报警数据为空'))
    }
    if (!warning.data) warning.data = {}
    if (!warning.data.recoveryTime) warning.data.recoveryTime = moment().format()
    // if (!warning.id || warning.id.length() === 0) {
    //   return reject(new Error('报警数据id为空'))
    // }
    log.getLogger(meta).table(table).tableData(id).debug(`更新报警恢复数据: 恢复数据=%j`, warning)
    Promise.resolve().then(() => this.mqClient.send(['warningUpdate', this.cfg.project, table, id], warning))
      .then(resolve, reject)
  });

  /**
   * @name: writePoints
   * @msg: 写数据
   * @param meta 日志元数据
   * @param point
   */
  writePoints = (meta, point) => {
    let {table, id, cid, fields, fieldType, fieldTypes, time = moment().valueOf()} = point
    return new Promise((resolve, reject) => {
      if (!id || id === '') {
        return reject(new Error('id为空'))
      }
      if (!table || table === '') {
        try {
          table = this.resolveTable(id)
        } catch (err) {
          return reject(err)
        }
      }
      if (!Number.isFinite(time) || time > 9999999999999 || time < 1000000000000) {
        return reject(new Error('时间无效'))
      }
      if (!table || table === '') {
        return reject(new Error('表id为空'))
      }
      if (!fields || !_.isArray(fields) || fields.length === 0) {
        return reject(new Error('写入值为空'))
      }
      let _fields = {}
      fields.forEach((field) => {
        if (field && field.value !== null && field.value !== undefined &&
          !(typeof field.value === 'number' && !Number.isFinite(field.value)) &&
          field.tag && field.tag.id && field.tag.id !== '') {
          if (field.value instanceof Buffer) {
            _fields[field.tag.id] = 'hex__' + field.value.toString("hex")
          } else {
            if (field.tag.range !== null && field.tag.range !== undefined && (field.tag.range.enable === null || field.tag.range.enable === undefined || field.tag.range.enable === true)) {
              let key = `${table}__${id}__${field.tag.id}`
              let prevVal = this.cacheValue[key]
              let {
                newValue, rawValue, invalidType, isSave
              } = this.convertTag.convertRange(field.tag.range, prevVal, this.convertTag.convert(field.tag, field.value))
              if (newValue !== null && newValue !== undefined) {
                if (typeof newValue === 'boolean') {
                  if (newValue === true) {
                    newValue = 1
                  } else if (newValue === false) {
                    newValue = 0
                  }
                }
                newValue = this.convertTag.valueFormat(field.tag, newValue)
                _fields[field.tag.id] = newValue
                if (isSave) {
                  this.cacheValue[key] = newValue
                }
              }
              if (rawValue !== null && rawValue !== undefined) {
                if (typeof rawValue === 'boolean') {
                  if (rawValue === true) {
                    rawValue = 1
                  } else if (rawValue === false) {
                    rawValue = 0
                  }
                }
                _fields[field.tag.id + '__invalid'] = rawValue
              }
              if (invalidType !== null && invalidType !== undefined && invalidType !== '') {
                _fields[field.tag.id + '__invalid__type'] = invalidType
              }
            } else {
              _fields[field.tag.id] = this.convertTag.valueFormat(field.tag, this.convertTag.convert(field.tag, field.value))
            }
          }
        }
      })
      if (Object.keys(_fields).length === 0) {
        return reject(new Error('数据为空'))
      }
      let data = {fieldType, fieldTypes, fields: _fields, time, cid, source: 'device', id}
      log.getLogger(meta).debug(`保存数据: 设备表=%s,设备=%s,数据=%j`, table, id, data)
      Promise.resolve().then(() => this.savePoints(meta, table, data))
        .then(resolve, reject)
    })
  };

  /**
   * @name: writePointVal
   * @msg: 写数据
   * @param point
   */
  // writePointVal = point => {
  //   let {table, id, fields, fieldType, time = moment().valueOf()} = point
  //   return new Promise((resolve, reject) => {
  //     if (!id || id === '') {
  //       return reject(new Error('id为空'))
  //     }
  //     if (!table || table === '') {
  //       let dev = this.cacheConfig[id]
  //       if (dev.num >= 2) {
  //         return reject(new Error('传入表id为空且在配置中找到多个表id'))
  //       }
  //       table = dev.table
  //     }
  //     if (!table || table === '') {
  //       return reject(new Error('表id为空'))
  //     }
  //     if (!fields || !_.isArray(fields) || fields.length === 0) {
  //       return reject(new Error('写入值为空'))
  //     }
  //     let data = {fieldType, fields, time}
  //     log.debug(`写入数据: ${JSON.stringify(data)}`)
  //     this.mqClient.send(['data', this.cfg.project, table, id], data)
  //       .catch(err => reject(err))
  //     resolve()
  //   })
  // };


  /**
   * @name: logDebug
   * @msg: debug消息
   * @param table
   * @param id
   * @param msg any
   */
  logDebug(table, id, msg) {
    this.mqClient.send(['logs', this.cfg.project, 'debug', id], {
      "time": moment().format('YYYY-MM-DD HH:mm:ss'), "message": msg
    })
      .catch(err => {
        log.error(err)
      })
  }

  /**
   * @name: logInfo
   * @msg: info消息
   * @param table
   * @param id
   * @param msg any
   */
  logInfo(table, id, msg) {
    this.mqClient.send(['logs', this.cfg.project, 'info', id], {
      "time": moment().format('YYYY-MM-DD HH:mm:ss'), "message": msg
    })
      .catch(err => {
        log.error(err)
      })
  }

  /**
   * @name: logWarn
   * @msg: warn消息
   * @param table
   * @param id
   * @param msg any
   */
  logWarn(table, id, msg) {
    this.mqClient.send(['logs', this.cfg.project, 'warn', id], {
      "time": moment().format('YYYY-MM-DD HH:mm:ss'), "message": msg
    })
      .catch(err => {
        log.error(err)
      })
  }

  /**
   * @name: logError
   * @msg: error消息
   * @param table
   * @param id
   * @param msg any
   */
  logError(table, id, msg) {
    this.mqClient.send(['logs', this.cfg.project, 'error', id], {
      "time": moment().format('YYYY-MM-DD HH:mm:ss'), "message": msg
    })
      .catch(err => {
        log.error(err)
      })
  }
}

export = App
