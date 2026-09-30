// @ts-nocheck
const _ = require('lodash')
const {v4: uuidv4} = require('uuid')
const log = require('../log')
const Mqtt = require('../conn/mqtt')
const Rabbit = require('../conn/rabbit')
const Kafka = require('../conn/kafka')
const LocalMQ = require('../conn/local')
const ApiClient = require('../api')
const GrpcClient = require('./grpc')
const {decodeConfig} = require('../utils/cipherx')

class App {
  static async fromConfig(source, overrides) {
    return new App(await require('../config').load(source, overrides))
  }

  constructor(cfg) {
    cfg = require('../config').normalize(cfg)
    this.cfg = decodeConfig(_.merge({project: 'default', instanceId: '', service: {},
      logger: {level: 'info', fmt: 'json', tz: 'Asia/Shanghai'},
      dataRelayGrpc: {host: 'data-relay', port: 9232, waitTime: 5000, healthInterval: 5000, healthRetry: 3},
      mq: {type: 'mqtt', mqtt: {host: 'mqtt', port: 1883, username: 'admin', password: 'public'},
        rabbit: {host: 'rabbit', port: 5672, username: 'admin', password: 'public'},
        kafka: {brokers: ['kafka:9092']}, local: {}},
      api: {}}, cfg))
    if (!this.cfg.service.id || !this.cfg.service.name) throw new Error('service.id 和 service.name 不能为空')
    if (!this.cfg.instanceId) this.cfg.instanceId = `${this.cfg.service.id}-${uuidv4()}`
    log.init(this.cfg.logger.level, this.cfg.logger.fmt, this.cfg.logger.tz)
    log.setServiceName(`${this.cfg.project}-${this.cfg.instanceId}-${this.cfg.service.id}`)
    log.setProjectId(this.cfg.project)
    this.apiClient = new ApiClient(this.cfg.api)
    const type = this.cfg.mq.type
    this.mqClient = type === 'rabbit' ? new Rabbit(this.cfg.mq.rabbit) :
      type === 'kafka' ? new Kafka(this.cfg.mq.kafka) :
      type === 'local' ? new LocalMQ(this.cfg.mq.local) : new Mqtt(this.cfg.mq.mqtt)
  }

  getProjectId() { return this.cfg.project }
  getAPIClient() { return this.apiClient }
  getMQ() { return this.mqClient }

  start(relay) {
    this.grpcClient = new GrpcClient()
    this.grpcClient.start(this, relay)
    process.stdin.resume()
    this.signalHandler = () => this.stop()
    process.on('SIGINT', this.signalHandler)
    process.on('SIGTERM', this.signalHandler)
  }

  stop() {
    if (this.stopping) return this.stopping
    this.stopping = new Promise(resolve => {
      process.off('SIGINT', this.signalHandler)
      process.off('SIGTERM', this.signalHandler)
      if (this.grpcClient) this.grpcClient.stop()
      this.mqClient.close(resolve)
    })
    return this.stopping
  }
}

export = App
