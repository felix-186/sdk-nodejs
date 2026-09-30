// @ts-nocheck
let schedule = require('node-schedule')
const log = require('../log')

class App {

  static async fromConfig(source, overrides) {
    return new App(await require('../config').load(source, overrides))
  }

  constructor(cfg = {}) {
    this.cfg = require('../config').normalize(cfg)
    this.schedule = schedule
  }

  getCron() { return this.schedule }

  start(task) {
    task.start(this)
    process.stdin.resume()

    let handle = (signal) => {
      log.getLogger().info(`停止服务: 信号=${signal}`)
      this.stop(task)
    }

    process.on('SIGINT', handle)
    process.on('SIGTERM', handle)
  }

  stop(task) {
    if (this.stopping) return this.stopping
    this.stopping = Promise.resolve().then(() => task.stop(this))
    return this.stopping
  }

}

export = App
