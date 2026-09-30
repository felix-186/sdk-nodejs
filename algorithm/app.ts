// @ts-nocheck
const schedule = require('node-schedule')
const {v4: uuidv4} = require('uuid')
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
    // log.getLogger().debug('配置:%j', cfg)
    let defaultCfg = {
      logger: {level: 'info', fmt: 'json', tz: 'Asia/Shanghai'},
      'algorithm-grpc': {
        host: 'algorithm', port: 9236,
      }, api: {
        endpoint: 'http://traefik:80', 'ak': '', 'sk': ''
      }, etcd: {
        host: 'etcd', port: 2379, username: 'root', password: ''
      }
    }
    let mergeCfg = _.merge({}, defaultCfg, cfg)
    if (cfg && cfg.algorithmGrpc) mergeCfg['algorithm-grpc'] = _.merge({}, mergeCfg['algorithm-grpc'], cfg.algorithmGrpc)
    this.cfg = decodeConfig(mergeCfg)
    this.schedule = schedule
    this.init()
  }

  init() {
    let logger = log.getLogger()
    if (this.cfg.algorithm === undefined || this.cfg.algorithm === null) {
      logger.error('算法配置不存在')
      process.exit(1)
    }
    if (this.cfg.algorithm.id === undefined || this.cfg.algorithm.id === '') {
      logger.error('算法id为空')
      process.exit(1)
    }
    if (this.cfg.algorithm.name === undefined || this.cfg.algorithm.name === '') {
      logger.error('算法名称为空')
      process.exit(1)
    }

    if (this.cfg.serviceId === undefined || this.cfg.serviceId === '') {
      this.cfg.serviceId = this.cfg.algorithm.id + '_' + uuidv4()
    }
    // this.log = log(this.cfg.logger.level, this.cfg.logger.fmt, {"service": this.cfg.serviceId}, this.cfg.logger.tz)
    log.init(this.cfg.logger.level, this.cfg.logger.fmt, this.cfg.logger.tz)
    log.setServiceName(this.cfg.serviceId)
  }

  /**
   * @name: start
   * @msg: 驱动启动
   * @param algorithm class 继承Algorithm类
   */
  start(algorithm) {
    let logger = log.getLogger()
    logger.info('启动服务: algorithmId=%s', this.cfg.algorithm.id)
    algorithm.start(this, {module: '启动算法'}, err => {
      if (err) return logger.detail(err).error('启动算法失败')
      this.grpcClient = new GrpcClient()
      this.grpcClient.start(this, algorithm)
    })
    process.stdin.resume()
    let handle = (signal) => {
      logger.info(`停止服务: 信号=${signal}`)
      this.stop(algorithm)
    }
    this.signalHandler = handle
    process.on('SIGINT', handle)
    process.on('SIGTERM', handle)
  }

  stop(algorithm) {
    if (this.stopping) return this.stopping
    this.stopping = new Promise(resolve => {
      if (this.signalHandler) {
        process.off('SIGINT', this.signalHandler)
        process.off('SIGTERM', this.signalHandler)
      }
      algorithm.stop(this, {}, err => {
        if (err) log.getLogger().detail(err).error('停止算法失败')
        if (this.grpcClient) this.grpcClient.stop()
        process.stdin.pause()
        resolve()
      })
    })
    return this.stopping
  }
}

export = App
