// @ts-nocheck

let amqp = require('amqplib');
const log = require('../../log')

class RabbitMQ {

  constructor({host = 'rabbit', port = 5672, username, password}) {
    this.client = amqp.connect(`amqp://${username}:${password}@${host}:${port}`)
    this.channelPromise = this.createChannel()
    this.channelPromise.catch(err => log.getLogger().detail(err).error('RabbitMQ 连接失败'))
  }

  /**
   * @name: close
   * @msg: 关闭连接
   * @return:
   */
  createChannel() {
    return new Promise((resolve, reject) => {
      this.client.then(conn => {
        return conn.createChannel()
      })
        .then(ch => {
          this.ch = ch
          resolve(ch)
        })
        .catch(err => reject(err))
    })
  }

  /**
   * @name: close
   * @msg: 关闭连接
   * @param cb
   */
  close(cb) {
    Promise.allSettled([this.channelPromise, this.client]).then(async results => {
      const channel = results[0].status === 'fulfilled' ? results[0].value : null
      const connection = results[1].status === 'fulfilled' ? results[1].value : null
      if (channel) await channel.close()
      if (connection) await connection.close()
      if (cb) cb()
    }).catch(err => { if (cb) cb(err) })
  }

  /**
   * @name: send
   * @msg: 发送数据
   * @param topic
   * @param data  Buffer
   */
  async send(topic, data) {
    const channel = await this.channelPromise
    channel.publish('data', topic.join('.'), Buffer.from(JSON.stringify(data)), {
      persistent: false, mandatory: false
    })
  }

  /**
   * @name: receive
   * @msg: 订阅并接收消息
   * @param queue string 队列
   * @param cb
   */
  receive(queue, cb) {

    if (this.ch) {
      this.ch.assertQueue(queue)
        .then(ok => {
          this.ch.consume(queue, (msg) => {
            cb(null, msg)
          })
        })
        .catch(err => cb(err))
    } else {
      this.createChannel()
        .then((ch) => {
          ch.assertQueue(queue)
            .then(ok => {
              ch.consume(queue, (msg) => {
                cb(null, msg)
              })
            })
            .catch(err => cb(err))
        })
        .catch(err => cb(err))
    }
  }

}

export = RabbitMQ
