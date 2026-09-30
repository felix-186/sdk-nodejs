// @ts-nocheck
const express = require('express')
const log = require('../log')

class App {

  static async fromConfig(source, overrides) {
    return new App(await require('../config').load(source, overrides))
  }

  constructor(cfg = {}) {
    this.cfg = require('../config').normalize(cfg)
    this.http = express()
  }

  getHttpServer() { return this.http }

  start(service, port = this.cfg.server && this.cfg.server.port || 8080) {
    let logger = log.getLogger()
    service.start(this)
    process.stdin.resume()
    let handle =  (signal)=> {
      logger.info(`停止服务: 信号=${signal}`)
      this.stop(service)
    }
    this.server = this.http.listen(port, () => {
      logger.info(`app listening on port ${port}!`)
    })
    process.on('SIGINT', handle)
    process.on('SIGTERM', handle)
  }

  stop(service) {
    if (this.stopping) return this.stopping
    this.stopping = Promise.resolve().then(() => service.stop(this))
      .finally(() => new Promise(resolve => this.server ? this.server.close(resolve) : resolve()))
    return this.stopping
  }
}

export = App
