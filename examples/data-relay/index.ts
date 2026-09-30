// @ts-nocheck
import {App, DataRelay} from '@kesi/sdk-nodejs/data_relay'

class Relay extends DataRelay {
  start(app, meta, config, callback) {
    console.log('收到中继配置:', Buffer.from(config).toString('utf8'))
    callback()
  }

  httpProxy(app, meta, type, headers, data, callback) {
    callback(null, Buffer.from(data))
  }
}

new App({
  project: 'default',
  service: {id: 'node-data-relay', name: 'Node 数据中继'},
  dataRelayGrpc: {host: '192.168.99.103', port: 9232},
  mq: {type: 'local', local: {logPublish: true}}
}).start(new Relay())
