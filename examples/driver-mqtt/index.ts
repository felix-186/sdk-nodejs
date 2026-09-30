// @ts-nocheck
// let schedule = require('node-schedule')
// const fs = require('fs');
const mqtt = require('mqtt')
const vm = require('vm')
const cfg = require('./config')
const {App, Driver} = require('@kesi/sdk-nodejs/driver')
const log = require('@kesi/sdk-nodejs/log')
const commandStatus = require('@kesi/sdk-nodejs/driver/command')
const schema1 = require('./schema')

class MQTTDriver extends Driver {
  schema(app, meta, lang, cb) {
    log.getLogger(meta).debug('schema')
    // let loc = __dirname + '/schema.js'
    // fs.readFile(loc, 'utf8', function (err, data) {
    //   cb(err, data)
    // })
    let s = JSON.stringify(schema1)
    cb(null, "(" + s + ")")
  }

  start(app, meta, config, cb) {
    log.getLogger(meta).debug('解析: 配置=%j', config)
    this.app = app
    this.clear()
    let err = this.parseData(meta, config)
    if (err) {
      // return cb(err)
    }
    cb()
  }

  run(app, meta, command, cb) {
    log.getLogger(meta).debug('执行指令: 指令=%j', command)
    // new ApiClient(cfg.api).setProjectId(cfg.project).getTableData(command.table, command.id)
    //   .then(res => {
    //     console.log('查询设备数据', res)
    //   }).catch(err => {
    //   console.error('查询设备数据错误', err)
    // })

    let {topic, payload} = this.cmdHandler(command.table, command.id, command.command)
    this.client.publish(topic, payload, (err, packet) => {
      if (err) {
        log.getLogger(meta).detail(err).error('发送指令数据错误')
        // return cb(err)
        return
      }
      log.getLogger(meta).debug('发送指令数据: %o', packet)
      // return cb(null, packet)
    })
    return cb(null)
  }

  batchRun(app, meta, command, cb) {
    log.getLogger(meta).debug('批量执行指令: 指令=%j', command)
    cb(null)
  }

  writeTag(app, meta, command, cb) {
    log.getLogger(meta).debug('写数据点: 数据点=%j', command)
    cb(null)
  }

  debug(app, meta, debugConfig, cb) {
    log.getLogger(meta).debug('运行测试: 调试参数=%j', debugConfig)
    cb(null, debugConfig)
  }

  httpProxy(app, meta, type, header, data, cb) {
    app.getCommands(meta, "nodesdk", "nodesdk1")
      .then((commands) => {
        console.log("commands====", commands)
        for (let command of commands) {
          app.updateCommand(meta, command.id, {status: commandStatus.COMMAND_STATUS_SUCCESS})
            .catch(err => console.error("updateCommand err==============", err))
        }
      }).catch(err => console.error("commands err==============", err))

    try {
      let req = JSON.parse(Buffer.from(data).toString())
      log.getLogger(meta).debug('httpProxy: type=%s,header=%j,req=%j', type, header, req)
      if (cb) {
        cb(null, req)
      }
    } catch (e) {
      if (cb) {
        cb(e)
      }
    }
  }

  configUpdate(app, meta, updateData, cb) {
    log.getLogger(meta).debug('configUpdate: updateData=%j', updateData)
    cb(null)
  }

  stop(app, meta, cb) {
    log.getLogger(meta).debug('驱动停止处理')
    this.clear()
    cb(null)
  }

  parseData(meta, config) {
    if (!config.tables || config.tables.length === 0) {
      return new Error('表为空')
    }
    let ops = {}
    let device = config.device
    if (!device || !device.settings || !device.settings.server) {
      return new Error('服务器地址为空')
    }
    if (!device.settings.topic) {
      return new Error('订阅主题为空')
    }
    if (!device.settings.parseScript) {
      return new Error('解析脚本为空')
    }
    if (device.settings.username && device.settings.password) {
      ops["username"] = device.settings.username.trim()
      ops["password"] = device.settings.password.trim()
    }
    if (device.settings.clientId) {
      ops["clientId"] = device.settings.clientId.trim()
    }
    this.client = mqtt.connect(device.settings.server, ops)
    const parseScript = {handler: undefined}
    if (device.settings && device.settings.parseScript) {
      try {
        let s = new vm.Script(device.settings.parseScript)
        s.runInNewContext(parseScript)
      } catch (e) {
        log.getLogger(meta).detail(e).error('解析脚本错误')
        return e
      }
    }
    if (device.settings && device.settings.commandScript) {
      try {
        const commandScript = {handler: undefined}
        let s = new vm.Script(device.settings.commandScript)
        s.runInNewContext(commandScript)
        this.cmdHandler = commandScript.handler
      } catch (e) {
        log.getLogger(meta).detail(e).error('指令脚本错误')
        return e
      }
    }
    config.tables.forEach(ts => {
      this.tables[ts.id] = {}
      let tagMap = {}
      if (ts.device && ts.device.tags) {
        ts.device.tags.forEach(tag => {
          tagMap[tag.id] = tag
        })
      }
      if (ts.devices) {
        ts.devices.forEach(dev => {
          let devTagMap = {...tagMap}
          if (dev.device && dev.device.tags) {
            dev.device.tags.forEach(tag => {
              devTagMap[tag.id] = tag
            })
          }
          this.tables[ts.id][dev.id] = devTagMap
        })
      }
    })
    this.client.on('connect', () => {
      log.getLogger(meta).debug("MQTT Server: 配置=%j. 已经连接", device.settings)
      this.client.subscribe(device.settings.topic)
    })
    this.client.on('message', (topic, message) => {
      log.getLogger(meta).debug('onmessage: topic=%s', topic)
      log.getLogger(meta).debug('onmessage: message=%o', message)
      if (!parseScript.handler) {
        log.getLogger(meta).error('解析脚本为空')
        return
      }
      try {
        let arr = parseScript.handler(topic, message)
        if (arr) {
          arr.forEach(ele => {
            console.log(JSON.stringify(this.app.cacheConfig))
            let tableObj = this.tables[ele.table]
            if (!tableObj) {
              log.getLogger(meta).table(ele.table).error(`解析数据: 表=%s. 未找到表配置`, ele.table)
              return
            }
            let devObj = tableObj[ele.id]
            if (!devObj) {
              log.getLogger(meta).table(ele.table).tableData(ele.id).error(`解析数据: 表=%s,设备=%s. 未找到设备配置`, ele.table, ele.id)
              return
            }
            if (!ele.fields) {
              log.getLogger(meta).table(ele.table).tableData(ele.id).error(`解析数据: 表=%s,设备=%s. 数据为空`, ele.table, ele.id)
              return
            }
            let tags = []
            for (const key in ele.fields) {
              let kt = devObj[key]
              if (!kt) {
                log.getLogger(meta).table(ele.table).tableData(ele.id).error(`解析数据: 表=%s,设备=%s,数据点=%s. 配置中未找到当前设备数据点配置`, ele.table, ele.id, key)
                continue
              }
              tags.push({tag: kt, value: ele.fields[key]})
            }
            if (tags.length === 0) {
              return
            }
            const p = {table: ele.table, id: ele.id, fields: tags, time: ele.time}
            this.app.writePoints(meta, p)
              .catch(err => {
                log.getLogger(meta).table(ele.table).tableData(ele.id).detail(err).error(`解析数据: 表=%s,设备=%s. 保存数据错误`, ele.table, ele.id)
              })
          })
        }
      } catch (e) {
        log.getLogger(meta).error('onmessage err: message=%o', e)
      }
    })
    this.client.on('error', err => {
      log.getLogger(meta).detail(err).error("MQTT Server: 连接错误")
    })
    this.client.on('log', msg => {
      log.getLogger(meta).debug("MQTT Server: log消息=%j", msg)
    })
    this.client.on('close', (reason) => {
      log.getLogger(meta).error(`MQTT Server: 已断开,reason=%o`, reason)
    })
    return null
  }

  clear() {
    this.tables = {}
    if (this.client) {
      this.client.end(true)
    }
  }
}

console.log("配置信息", JSON.stringify(cfg))

// 实例化并开始运行
new App(cfg).start(new MQTTDriver())


