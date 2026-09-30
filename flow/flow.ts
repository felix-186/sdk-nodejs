// @ts-nocheck
class Flow {
  /**
   * @name: handler
   * @msg: 执行流程插件
   * @param app
   * @param meta 日志元数据
   * @param req 执行参数 {"projectId":"项目id","flowId":"流程id","job":"流程实例id","elementId":"节点id","elementJob":"节点的实例id","config":{}} config 节点配置
   * @param callback (err,result) result 自定义格式,节点执行结果
   */
  handler(app, meta, req, callback) {
  }

  debug(app, meta, req, callback) {
    callback(new Error('Flow.debug 未实现'))
  }

  /**
   * @name: stop
   * @msg: 停止流程服务
   * @param app
   * @param meta 日志元数据
   * @param callback (err)
   */
  stop(app, meta, callback) {
  }
}

export = Flow
