// @ts-nocheck
class DataRelay {
  start(app, meta, config, callback) { callback(new Error('DataRelay.start 未实现')) }
  httpProxy(app, meta, type, headers, data, callback) { callback(new Error('DataRelay.httpProxy 未实现')) }
}

export = DataRelay
