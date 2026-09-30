// @ts-nocheck
const cfg = require('./config')
const {App, Extension} = require('@kesi/sdk-nodejs/flow_extension')
const schema = require('./schema')
const log = require('@kesi/sdk-nodejs/log')
class TestFlow extends Extension {

  schema(app, meta, lang, cb) {
    log.getLogger(meta).debug('schema')
    cb(null,JSON.stringify(schema))
  }

  run(app, meta, req, cb) {
    log.getLogger(meta).debug('执行请求: 参数=%j', req)
    let {num1, num2} = req
    cb(null, {"num1": num1 + num2})
  }

  stop(app, meta, cb) {
    log.getLogger(meta).debug('停止处理')
    cb(null)
  }
}
// 实例化并开始运行
new App(cfg).start(new TestFlow())