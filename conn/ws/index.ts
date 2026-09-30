// @ts-nocheck
let ws = require('ws')
let EventEmitter = require('events')
const log = require('../../log')

class WebSocket extends EventEmitter {

  constructor(url) {
    super()
    this.url = url
    this.retryConnect = 0
    this.isReConnect = true
    this.lockReconnect = false
    this.wsConnected = false
    this.init()
  }

  /**
   * @name: init
   * @msg: 初始化WebSocket连接
   */
  init() {
    this.sock = new ws(this.url)
    this.sock.on("open", () => {
      log.info("已连接WebSocket服务器")
      this.retryConnect = 0
      this.wsConnected = true
    });
    this.sock.on("error", (err) => {
      log.warn(`WebSocket服务连接错误,${err}`)
      if (this.isReConnect) {
        this.reConnect()
      }
    })
    this.sock.on("close", (code, reason) => {
      log.info(`WebSocket服务已经断开 [${code}] ${reason}`)
      if ((code === 1006 || code === 1002) && this.isReConnect) {
        this.reConnect()
      }
    })
    this.sock.on("message", (data) => {
      this.emit('data', data)
    })
  }

  /**
   * @name: reConnect
   * @msg: WebSocket重连
   * @return: 
   */
  reConnect() {
    if (!this.lockReconnect) {
      this.lockReconnect = true
      this.retryConnect++
      let timeOut = 5000
      if (this.retryConnect > 5 && this.retryConnect <= 10) {
        timeOut = 60000
      } else if (this.retryConnect > 10) {
        timeOut = 300000
      }
      log.warn(`WebSocket服务 第 [${this.retryConnect}] 次重连`)
      // 进行重连
      setTimeout(() => {
        this.init()
        this.lockReconnect = false
      }, timeOut);
    }
  }

  /**
   * @name: close
   * @msg: 关闭连接
   * @return:
   */
  close() {
    this.isReConnect = false
    this.sock.close()
  }

  /**
   * @name: sendObject
   * @msg: 发送数据
   * @param data object
   * @param cb
   */
  sendObject(data, cb) {
    this.sock.send(JSON.stringify(data), (err) => {
      if (cb) {
        cb(err)
      }
    })
  }

  /**
   * @name: send
   * @msg: 发送数据
   * @param data string
   * @param cb
   * @return:
   */
  send(data, cb) {
    this.sock.send(data, (err) => {
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
    this.on("data", (data) => {
      if (cb) {
        cb(data)
      }
    })
  }
}

export = WebSocket