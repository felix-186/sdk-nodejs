// @ts-nocheck
const Mqtt = require('../mqtt')
const Rabbit = require('../rabbit')
const Kafka = require('../kafka')
const Local = require('../local')

class MQ {
  constructor(cfg = {}) {
    switch (cfg.type || 'mqtt') {
      case 'rabbit': this.client = new Rabbit(cfg.rabbit || {}); break
      case 'kafka': this.client = new Kafka(cfg.kafka || {}); break
      case 'local': this.client = new Local(cfg.local || {}); break
      case 'mqtt': this.client = new Mqtt(cfg.mqtt || {}); break
      default: throw new Error(`不支持的 MQ 类型: ${cfg.type}`)
    }
  }

  send(topic, data) { return this.client.send(topic, data) }
  close(callback) { return this.client.close(callback) }
  receive(topic, callback) { return this.client.receive(topic, callback) }
  subscribe(topic, callback) { return this.client.subscribe(topic, callback) }
}

export = MQ
