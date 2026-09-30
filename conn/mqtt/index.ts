// @ts-nocheck
const mqtt = require('mqtt');
const log = require('../../log')

class Mqtt {

  constructor(cfg) {
    let {host = 'mqtt', port = 1883, username = 'admin', password = 'public', schema, tlsConfig} = cfg

    let connCfg = {
      host: host, port: port, username: username, password: password, protocol: 'mqtt',
    };
    if (schema && schema !== '' && schema !== null && schema !== 'undefined') {
      connCfg['protocol'] = schema;
    }
    if (tlsConfig && tlsConfig.insecureSkipVerify && (tlsConfig.insecureSkipVerify === true || tlsConfig.insecureSkipVerify === 'true')) {
      connCfg['rejectUnauthorized'] = false;
    }

    let client = mqtt.connect(connCfg)
    client.on('connect', () => {
      console.log('消息队列已连接')
    })

    client.on('error', (err) => {
      console.error('消息队列连接错误', err)
    })
    this.client = client
  }

  /**
   * @name: close
   * @msg: 关闭连接
   * @param cb
   */
  close(cb) {
    if (this.client) {
      this.client.end(() => {
        log.info('消息队列已断开')
        if (cb) {
          cb()
        }
      })
    } else {
      if (cb) {
        cb()
      }
    }
  }

  /**
   * @name: send
   * @msg: 发送数据
   * @param topic string 主题
   * @param data json
   */
  send(topic, data) {
    return new Promise((resolve, reject) => {
      this.client.publish(topic.join('/'), JSON.stringify(data), (err, packet) => {
        if (err) {
          return reject(err)
        }
        return resolve(packet)
      })
    })
  }

  /**
   * @name: receive
   * @msg: 订阅并接收消息
   * @param topic string 主题
   * @param qos
   * @param cb
   */
  receive({topic, qos = 0}, cb) {
    this.client.subscribe(topic, {qos: qos})
    this.client.on('message', (topic, payload) => {
      if (cb) {
        cb(null, topic, payload)
      }
    })
  }

  /**
   * @name: subscribe
   * @msg: 订阅主题
   * @param {topic, qos}
   * @param cb
   */
  subscribe({topic, qos = 0}, cb) {
    this.client.subscribe(topic, {qos: qos}, (err) => {
      if (cb) {
        cb(err)
      }
    })
  }

  /**
   * @name: message
   * @msg: 接收消息数据
   * @param cb
   */
  message(cb) {
    this.client.on('message', (topic, payload) => {
      if (cb) {
        cb(topic, payload)
      }
    })
  }
}

export = Mqtt