// @ts-nocheck
let net = require('net');
const log = require('../../log')

class Socket {

  constructor(host, port) {
    this.retryConnect = 0
    this.options = { host, port }
    this.isReConnect = true
    this.sock = net.Socket()
    this.init()
    this.sock.on('connect', () => {
      log.info("已连接TCP服务器")
      this.retryConnect = 0;
    })

    this.sock.on("error", (err) => {
      log.warn(`TCP服务连接错误,${err}`)
    })

    this.sock.on("close", (had_error) => {
      log.warn(`TCP服务已经断开 ${had_error}`)
      if (this.isReConnect) {
        this.reConnect()
      }
    })
  }

  /**
   * @name: init
   * @msg: 初始化Socket连接
   */
  init() {
    // 连接 tcp server
    this.sock.connect(this.options)
    this.sock.setKeepAlive(true, 1000)
  }

  /**
   * @name: reConnect
   * @msg: Socket重连
   */
  reConnect() {
    this.retryConnect++
    let timeOut = 5000
    if (this.retryConnect > 5 && this.retryConnect <= 10) {
      timeOut = 60000
    } else if (this.retryConnect > 10) {
      timeOut = 300000
    }
    log.warn(`TCP服务 第 [${this.retryConnect}] 次重连`)
    // 进行重连
    setTimeout(() => {
      this.init()
    }, timeOut);
  }

  /**
   * @name: close
   * @msg: 关闭连接
   */
  close() {
    this.isReConnect = false
    this.sock.destroy()
  }

  /**
   * @name: write
   * @msg: 发送数据
   * @param data string 数据
   * @param encoding string 编码
   * @param cb
   * @return:
   */
  write(data, encoding, cb) {
    this.sock.write(data, encoding, (err) => {
      if (cb) {
        cb(err)
      }
    })
  }

  /**
   * @name: write
   * @msg: 发送数据
   * @param data string | Buffer | Uint8Array 数据
   * @param cb
   */
  write(data, cb) {
    this.sock.write(data, (err) => {
      if (cb) {
        cb(err)
      }
    })
  }

  /**
   * @name: message
   * @msg: 接收消息
   */
  message(cb) {
    this.sock.on("data", (data) => {
      if (cb) {
        cb(data)
      }
    })
  }
}

export = Socket