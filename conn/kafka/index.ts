// @ts-nocheck
const {Kafka, CompressionTypes} = require('kafkajs')

const log = require('../../log')
const mqtt = require("mqtt");

class KafkaJS {
  constructor(cfg) {
    let {brokers = ['kafka:9092'], groupId} = cfg
    let newCfg = {
      brokers: brokers
    }
    this.cfg = cfg
    this.client = new Kafka(newCfg)
    this.producer = this.client.producer()
    this.producerReady = null
    if (groupId && groupId !== "") {
      this.consumer = this.client.consumer({groupId: groupId})
    }
  }

  /**
   * @name: close
   * @msg: 关闭连接
   * @param cb
   */
  close(cb) {
    Promise.resolve(this.producerReady).then(() => this.producer.disconnect())
      .then(() => {
        if (cb) {
          cb()
        }
      }).catch(err => {
      if (cb) {
        cb(err)
      }
    })
  }

  /**
   * @name: send
   * @msg: 发送数据
   * @param topic string 主题
   * @param data json
   */
  send = async (topic, data) => {
    if (topic.length === 0) {
      throw new Error('topic为空')
    }
    try {
      if (!this.producerReady) this.producerReady = this.producer.connect()
      await this.producerReady
      return await this.producer.send({
        topic: topic[0],
        compression: CompressionTypes.GZIP,
        messages: [{key: topic.slice(1).join('/'), value: JSON.stringify(data)}],
      })
    } catch (e) {
      throw e
    }
  }

  /**
   * @name: receive
   * @msg: 订阅并接收消息
   * @param topic string 主题
   * @param qos
   * @param cb
   */
  receive = async ({topic, qos = 0}, cb) => {
    let topics = topic.split('/')
    if (topics.length === 0) {
      return cb(new Error('topic为空'))
    }
    await this.consumer.connect()
    await this.consumer.subscribe({topic: topics[0]})
    await this.consumer.run({
      autoCommit: true,
      eachMessage: async ({rTopic, partition, message}) => {
        let resTopic = topics[0] + '/' + message.key.toString()
        if (this.mqttMatch(topic, resTopic)) {
          cb(null, resTopic, message.value)
        }
      },
    })
  }

  mqttMatch = (subscription, topic) => {
    subscription = subscription
      .replace(/\+/g, '[^/]+')
      .replace(/#/g, '.*');
    const regex = new RegExp(`^${subscription}$`);
    return regex.test(topic);
  }
}

export = KafkaJS
