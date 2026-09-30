// @ts-nocheck
const util = require("util");
const _ = require('lodash')
const {createLogger, format, transports} = require('winston');
const {combine, timestamp} = format;
const moment = require('moment-timezone');
const appendTimestamp = format((info, opts) => {
  // console.log("info", info, opts)
  info.level = info.level.toUpperCase()
  info.msg = "" + info.message
  if (opts.tz) info.time = moment().tz(opts.tz).format('YYYY-MM-DDTHH:mm:ss.SSSSSSSSSZ');
  delete info['message']
  return info;
});

class Logger {
  constructor() {
    this.init()
    this.syslog = {serviceName: '', projectId: '', group: ''}
  }

  init(level = 'info', fmt = 'json', tz = 'Asia/Shanghai') {
    let logFmt = format.simple()
    if (fmt === 'json') {
      logFmt = format.json()
    }
    this.logger = createLogger({
      level: level,
      format: combine(appendTimestamp({tz: tz}), format.splat(), format.errors({stack: true}), logFmt),
      transports: [new transports.Console(),],
    })
  }

  setProjectId(projectId) {
    this.syslog.projectId = projectId
  }

  setServiceName(serviceName) {
    this.syslog.serviceName = serviceName
  }

  setGroup(group) {
    this.syslog.group = group
  }

  debug = (message, ...meta) => {
    this.logger.debug(message, ...meta)
  }

  info = (message, ...meta) => {
    this.logger.info(message, ...meta)
  }

  warn = (message, ...meta) => {
    this.logger.warn(message, ...meta)
  }

  error = (message, ...meta) => {
    this.logger.error(message, ...meta)
  }

  log = (level, message, ...meta) => {
    this.logger.log(level, message, ...meta)
  }

  meta(meta) {
    let service = this.syslog.serviceName
    let projectId = this.syslog.projectId
    let group = this.syslog.group
    if (meta['projectId'] && meta['projectId'] !== '') {
      projectId = meta['projectId']
    }
    if (meta['group'] && meta['group'] !== '') {
      group = meta['group']
    }
    let m = {}
    if (service !== '') {
      m = {"logType": "__syslog__", service}
    }
    let module = meta['module']
    if (module && module !== '') {
      m = {module, ...m}
    }
    if (projectId !== '') {
      m = {projectId, ...m}
    }
    let data = meta['data']
    if (data) {
      m = {data, ...m}
    }
    let table = meta['table']
    if (table && table !== '') {
      m = {table, ...m}
    }
    let flow = meta['flow']
    if (flow && flow !== '') {
      m = {flow, ...m}
    }
    if (group && group !== '') {
      m = {group, ...m}
    }
    let suggest = meta['suggest']
    if (suggest && suggest !== '') {
      m = {suggest, ...m}
    }
    let focus = meta['focus']
    if (focus && _.isNumber(focus)) {
      m = {focus, ...m}
    }
    let tableData = meta['tableData']
    if (tableData && tableData !== '') {
      m = {tableData, ...m}
    }
    let detail = meta['detail']
    if (detail) {
      if (_.isError(detail)) {
        m = {"detail": detail.toString(), ...m}
      } else if (detail !== '') {
        m = {detail, ...m}
      }
    }
    return m
  }

  getLogger(meta) {
    return new log(this, meta)
  }

}

class log {

  constructor(logger, meta) {
    this.logger = logger
    if (!meta) {
      meta = {}
    }
    this.meta = meta
  }

  debug = (format, ...args) => {
    this.logger.debug(util.format(format, ...args), this.logger.meta(this.meta))
  }

  info = (format, ...args) => {
    this.logger.info(util.format(format, ...args), this.logger.meta(this.meta))
  }

  warn = (format, ...args) => {
    this.logger.warn(util.format(format, ...args), this.logger.meta(this.meta))
  }

  error = (format, ...args) => {
    this.logger.error(util.format(format, ...args), this.logger.meta(this.meta))
  }

  projectId(projectId) {
    this.meta = {...this.meta, projectId}
    return this
  }

  module(module) {
    this.meta = {...this.meta, module}
    return this
  }

  data(meta, data) {
    this.meta = {...this.meta, data}
    return this
  }

  service(service) {
    this.meta = {...this.meta, service}
    return this
  }

  table(table) {
    this.meta = {...this.meta, table}
    return this
  }

  flow(flow) {
    this.meta = {...this.meta, flow}
    return this
  }

  group(group) {
    this.meta = {...this.meta, group}
    return this
  }

  suggest(suggest) {
    this.meta = {...this.meta, suggest}
    return this
  }

  focus(focus) {
    this.meta = {...this.meta, focus}
    return this
  }

  tableData(tableData) {
    this.meta = {...this.meta, tableData}
    return this
  }

  detail(detail) {
    this.meta = {...this.meta, detail}
    return this
  }

}

let l = new Logger()

export = l
