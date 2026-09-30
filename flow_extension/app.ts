// @ts-nocheck
const schedule = require('node-schedule')
const log = require('../log')
const GrpcClient = require('./grpc')
const {decodeConfig} = require("../utils/cipherx");
const _ = require("lodash");

class App {
  static async fromConfig(source, overrides) {
    return new App(await require('../config').load(source, overrides))
  }

  constructor(cfg) {
    cfg = require('../config').normalize(cfg)
    // console.log('启动配置', cfg)
    let defaultCfg = {
      logger: {level: 'info', fmt: 'json', tz: 'Asia/Shanghai'},
      'flow-engine': {
        host: 'flow-engine', port: 2333,
      }, api: {
        endpoint: 'http://traefik:80', 'ak': '', 'sk': ''
      }, etcd: {
        host: 'etcd', port: 2379, username: 'root', password: ''
      }
    }
    let mergeCfg = _.merge({}, defaultCfg, cfg)
    if (cfg && cfg.flowEngine) mergeCfg['flow-engine'] = _.merge({}, mergeCfg['flow-engine'], cfg.flowEngine)
    this.cfg = decodeConfig(mergeCfg)
    this.schedule = schedule
    this.init()
  }

  init() {
    let logger = log.getLogger()
    if (this.cfg.extension === undefined) {
      logger.error('流程节点扩展服务配置不存在')
      process.exit(1)
    }
    if (this.cfg.extension.id === undefined || this.cfg.extension.id === '') {
      logger.error('流程节点扩展服务id为空')
      process.exit(1)
    }
    if (this.cfg.extension.name === undefined || this.cfg.extension.name === '') {
      logger.error('流程节点扩展服务name为空')
      process.exit(1)
    }
    // this.log = log(this.cfg.logger.level, this.cfg.logger.fmt, {"service": this.cfg.extension.id}, this.cfg.logger.tz)
    log.init(this.cfg.logger.level, this.cfg.logger.fmt, this.cfg.logger.tz)
    log.setServiceName(this.cfg.extension.id)
  }

  /**
   * @name: start
   * @msg: 驱动启动
   * @param flow class 继承Flow类
   * @return:
   */
  start(flow) {
    let logger = log.getLogger()
    logger.info('启动服务: extension=%s', this.cfg.extension.id)
    this.grpcClient = new GrpcClient()
    this.grpcClient.start(this, flow)
    process.stdin.resume()
    let handle =  (signal) =>{
      logger.info(`停止服务: 信号=${signal}`)
      this.stop(flow)
    }
    this.signalHandler = handle
    process.on('SIGINT', handle)
    process.on('SIGTERM', handle)
  }

  stop(flow) {
    if (this.stopping) return this.stopping
    this.stopping = new Promise(resolve => {
      if (this.signalHandler) {
        process.off('SIGINT', this.signalHandler)
        process.off('SIGTERM', this.signalHandler)
      }
      flow.stop(this, {}, err => {
        if (err) log.getLogger().detail(err).error('停止扩展失败')
        if (this.grpcClient) this.grpcClient.stop()
        process.stdin.pause()
        resolve()
      })
    })
    return this.stopping
  }
}

export = App
