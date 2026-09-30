// @ts-nocheck
class Algorithm {

  start(app, meta, callback) {
    callback()
  }

  /**
   * @name: schema
   * @msg: 查询schema
   * @param app
   * @param meta 日志元数据
   * @param lang 国际化语言
   * @param callback (err,'string') 算法配置schema,返回字符串
   */
  schema(app, meta, lang, callback) {
  }

  /**
   * @name: run
   * @msg: 执行算法服务
   * @param app
   * @param meta 日志元数据
   * @param cfg 执行参数 {"function":"算法名","input":{}} input 算法执行参数,应与输出的schema格式相同
   * @param callback (err,result)  result自定义返回的格式,应与输出的schema格式相同
   */
  run(app, meta, cfg, callback) {
  }

  /**
   * @name: stop
   * @msg: 停止算法服务
   * @param app
   * @param meta 日志元数据
   * @param callback (err)
   */
  stop(app, meta, callback) {
  }
}

export = Algorithm
