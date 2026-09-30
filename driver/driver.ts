// @ts-nocheck
class Driver {

  /**
   * @name: schema
   * @msg: 查询返回驱动配置schema js内容
   * @param app
   * @param meta 日志元数据
   * @param locale 国际化语言
   * @param callback (err,"string") 驱动配置schema,返回字符串
   */
  schema(app, meta, locale, callback) {
  }

  /**
   * @name: start
   * @msg: 驱动启动
   * @param app
   * @param meta 日志元数据
   * @param driverConfig 包含实例、模型及设备数据
   * @param callback (err)
   */
  start(app, meta, driverConfig, callback) {
  }

  /** Register optional Express routes under /<driver.id>. */
  registerRoutes(router) {
  }

  /**
   * @name: run
   * @msg: 运行指令,向设备写入数据
   * @param app
   * @param meta 日志元数据
   * @param command 指令参数 {"table":"表标识","id":"设备编号","serialNo":"流水号","command":{}} command 指令内容
   * @param callback (err,result) result自定义返回的格式或者空
   */
  run(app, meta, command, callback) {
  }

  /**
   * @name: batchRun
   * @msg: 批量运行指令,向多设备写入数据
   * @param app
   * @param meta 日志元数据
   * @param command 指令参数 {"table":"表标识", "ids": ["设备编号"], "serialNo": "流水号", 'command': {}}  command 指令内容
   * @param callback (err,result) result自定义返回的格式或者空
   */
  batchRun(app, meta, command, callback) {
  }

  /**
   * @name: writeTag
   * @msg: 数据点写入
   * @param app
   * @param meta 日志元数据
   * @param command 指令参数 {"table":"表标识","id":"设备编号","serialNo":"流水号","command":{}} command 指令内容
   * @param callback (err,result) result自定义返回的格式或者空
   */
  writeTag(app, meta, command, callback) {
  }

  /**
   * @name: debug
   * @msg: 调试驱动
   * @param app
   * @param meta 日志元数据
   * @param debugConfig object 调试参数
   * @param callback (err,result) result调试结果,自定义返回的格式
   */
  debug(app, meta, debugConfig, callback) {
  }

  /**
   * @name: debug
   * @msg: 代理接口
   * @param app
   * @param meta 日志元数据
   * @param type 请求接口标识
   * @param header 请求头
   * @param data 请求数据
   * @param callback (err,result) result) result响应结果,自定义返回的格式
   */
  httpProxy(app, meta, type, header, data, callback) {
  }


  /**
   * @name: configUpdate
   * @msg: 配置更新
   * @param app
   * @param meta 日志元数据
   * @param updateData object 配置数据
   * @param callback (err)
   */
  configUpdate(app, meta, updateData, callback) {

  }

  /**
   * @name: stop
   * @msg: 驱动停止处理
   * @param app
   * @param meta 日志元数据
   * @param callback (err)
   */
  stop(app, meta, callback) {
  }

  /**
   * @name: getVersion
   * @msg: 驱动版本
   * @return: string 驱动版本号
   */
  getVersion() {
  }
}

export = Driver
