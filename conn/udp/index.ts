// @ts-nocheck
const dgram = require('dgram')
const log = require('../../log')

class UDP {
  constructor(host, port) {
    this.host = host
    this.port = port
    this.sock = dgram.createSocket('udp4')
    this.sock.on('close', () => {
      log.info(`UDP 客户端已经关闭`)
    })

    //错误处理
    this.sock.on('error', (err) => {
      log.warn(`some error on udp client.${err}`)
    })

  }

  /**
   * @name: write
   * @msg: 写数据
   * @param data string 数据
   * @param cb
   */
  send(data, cb) {
    this.sock.send(data, this.port, this.host, (err, b) => {
      if (cb) {
        cb(err, b)
      }
    });
  }

  /**
    * @name: message
    * @msg: 接收消息
    */
  message(cb) {
    // 接收消息
    this.sock.on('message', (msg, rinfo) => {
      if (cb) {
        cb(msg, rinfo)
      }
    })
  }

}

export = UDP