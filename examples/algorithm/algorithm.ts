// @ts-nocheck
const cfg = require('./config')
const {App, Algorithm} = require('@kesi/sdk-nodejs/algorithm')
const log = require('@kesi/sdk-nodejs/log')
const schema1 = require('./schema')

class TestAlgorithm extends Algorithm {
  schema(app, meta, lang, cb) {
    log.getLogger(meta).debug('schema')
    cb(null, JSON.stringify(schema1))
  }

  run(app, meta, req, cb) {
    log.getLogger(meta).debug('执行请求: %o', req)
    let input = req['input']
    switch (req['function']) {
      case 'add':
        return cb(null, {num1: input['num1'] + input['num2']})
      case 'abs':
        return cb(null, {res: Math.abs(input['num1'])})
      default:
        return cb('未知函数')
    }
  }

  stop(app, meta, cb) {
    log.getLogger(meta).debug('算法停止处理')
    cb(null)
  }
}

// 实例化并开始运行
new App(cfg).start(new TestAlgorithm())