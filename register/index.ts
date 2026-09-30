// @ts-nocheck
const {v4: uuidv4} = require('uuid');
const _ = require('lodash')
const extract = require('../utils/host');
const log = require("../log");

class Register {
  constructor(client) {
    this.client = client;
    this.leaseSec = 10;
    this.services = [];
  }

  /**
   * @name: stop
   * @msg: 服务注册
   * @param serviceName 服务名
   * @param services
   */
  register = async (serviceName, services) => {
    this.serviceName = serviceName
    for (const service of services) {
      try {
        await this.__reg(service.metadata, service.srv)
      } catch (err) {
        throw err;
      }
    }
  }

  // 内部使用
  __reg = async (metadata, srv) => {
    const serviceId = uuidv4();
    const serviceKey = `/microservices/${this.serviceName}/${serviceId}`;
    let endpoints = [];
    for (let i = 0; i < srv.length; i++) {
      let {schema, hostPort, listener} = srv[i];
      const result = extract(hostPort, listener);
      endpoints.push(`${schema}://${result}`);
    }
    if (endpoints.length === 0) {
      throw new Error("无启动的服务: endpoints为空")
    }
    const serviceValue = JSON.stringify({
      id: serviceId,
      name: this.serviceName,
      version: "",
      metadata: metadata,
      endpoints: endpoints
    });
    // let timer = null;
    try {
      // 创建一个为期10秒的租约
      // console.log(`服务注册: key=${serviceKey},value=${serviceValue},租约时间=${this.leaseSec}. 获取租约`);
      console.log(`服务注册: `, new Date())
      log.getLogger().info(`服务注册: key=${serviceKey},value=${serviceValue}. 获取租约`);
      // const lease = this.client.lease(this.leaseSec, {autoKeepAlive: true});
      // log.getLogger().info(`获取租约成功,服务开始注册: key=${serviceKey}.`);
      // lease.on("keepaliveSucceeded", (res) => {
      //   console.log("keepaliveSucceeded", res);
      //   log.getLogger().info(`服务租约已成功续约: key=%s,租约=%o`, serviceKey, res)
      // })
      // lease.on("keepaliveFailed", (res) => {
      //   console.log("keepaliveFailed", res);
      //   log.getLogger().error(`服务租约续租失败: key=%s,租约=%o`, serviceKey, res)
      // })
      // lease.on("lost", (err) => {
      //   console.log("lost", err);
      // })
      // // 把租约与一个键值对联系起来
      // await lease.put(serviceKey).value(serviceValue);
      await this.leaseService(serviceKey, serviceValue);
      log.getLogger().info(`服务注册成功: key=%s`, serviceKey)
      // console.log(`服务注册成功: key=${serviceKey}`);
      // 每隔一段时间（小于租约时间）续租
      // 这里我们每隔8秒续租一次，以确保它不会过期
      this.services.push({serviceKey});
      // 注意：在实际应用中你需要适当处理程序退出的情况，取消租约或关闭客户端连接
    } catch (err) {
      // console.log(`服务注册错误: key=${serviceKey}. `, err);
      if (_.isError(err)) {
        log.getLogger().error(`服务注册错误: key=${serviceKey}. %s`, err.message);
      } else {
        log.getLogger().error(`服务注册错误: key=${serviceKey}. %o`, err);
      }
      // if (timer) {
      //     clearInterval(timer);
      // }
      throw err;
    }
  }

  leaseService = async (serviceKey, serviceValue) => {
    const lease = this.client.lease(this.leaseSec, {autoKeepAlive: true});
    log.getLogger().info(`获取租约成功,服务开始注册: key=${serviceKey}.`);
    lease.on("keepaliveSucceeded", (res) => {
      console.log("服务 keepaliveSucceeded", new Date(), res);
      log.getLogger().info(`服务租约已成功续约: key=%s,租约=%o`, serviceKey, res)
    })
    lease.on("keepaliveFailed", (res) => {
      console.log("服务 keepaliveFailed", new Date(), res);
      log.getLogger().error(`服务租约续租失败: key=%s,租约=%o`, serviceKey, res)
    })
    lease.on("lost", async (err) => {
      console.log("服务 lost", new Date(),err);
      await this.leaseService(serviceKey, serviceValue)
    })
    await lease.put(serviceKey).value(serviceValue);
  }

  /**
   * @name: stop
   * @msg: 服务注销
   */
  unregister = async () => {
    try {
      for (let i = 0; i < this.services.length; i++) {
        console.log("删除服务", this.services[i].serviceKey)
        // if (this.services[i].timer) {
        //     clearInterval(this.services[i].timer);
        // }
        await this.client.delete().key(this.services[i].serviceKey);
      }
      let logger = log.getLogger();
      logger.info(`服务注销: 服务名=%s`, this.serviceName);
      // console.log(`服务注销: 服务名=${this.serviceName}`)
    } catch (err) {
      throw err;
    } finally {
      this.services = [];
    }
  }
}

export = Register;