// @ts-nocheck
const log = require('../../log')

class LocalMQ {
  constructor(cfg = {}) {
    this.cfg = cfg
    this.subscribers = new Map()
  }

  async send(topic, data) {
    const name = Array.isArray(topic) ? topic.join('/') : String(topic)
    if (this.cfg.logPublish !== false) {
      log.getLogger().info('[MQ-Publish] topic=%s%s', name,
        this.cfg.showPayload ? ` data=${JSON.stringify(data)}` : '')
    }
    for (const callback of this.subscribers.get(name) || []) callback(name, data)
  }

  subscribe(topic, callback) {
    const selected = topic && topic.topic || topic
    const name = Array.isArray(selected) ? selected.join('/') : String(selected)
    if (!this.subscribers.has(name)) this.subscribers.set(name, new Set())
    if (callback) this.subscribers.get(name).add(callback)
  }

  receive(topic, callback) { this.subscribe(topic, callback) }

  close(callback) {
    this.subscribers.clear()
    if (callback) callback()
  }
}

export = LocalMQ
