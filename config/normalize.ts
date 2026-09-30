// @ts-nocheck
const _ = require('lodash')
const {readEnvironmentConfig} = require('./env')

const goLevels = ['error', 'error', 'error', 'warn', 'info', 'debug']

function durationMs(value) {
  if (typeof value !== 'string') return value
  const units = {ns: 0.000001, us: 0.001, 'µs': 0.001, ms: 1, s: 1000, m: 60000, h: 3600000}
  let total = 0
  let cursor = 0
  const pattern = /([+-]?\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g
  for (const match of value.matchAll(pattern)) {
    if (match.index !== cursor) return value
    total += Number(match[1]) * units[match[2]]
    cursor = match.index + match[0].length
  }
  return cursor === value.length && cursor > 0 ? total : value
}

function normalize(config = {}) {
  const result = _.merge({}, _.cloneDeep(config), readEnvironmentConfig())
  if (!result.project && result.api?.projectId) result.project = result.api.projectId
  if (result.log) {
    const logger = {...result.log}
    if (logger.format !== undefined) logger.fmt = logger.format
    result.logger = _.merge({}, logger, result.logger)
  }
  if (result.logger && Number.isInteger(result.logger.level)) {
    result.logger.level = goLevels[result.logger.level] || 'debug'
  }
  for (const key of ['driverGrpc', 'driver-grpc', 'dataRelayGrpc', 'algorithmGrpc', 'algorithm-grpc', 'flowEngine', 'flow-engine']) {
    const grpc = result[key]
    if (!grpc || typeof grpc !== 'object') continue
    for (const field of ['waitTime', 'timeout', 'healthInterval', 'healthRequestTime']) {
      if (grpc[field] !== undefined) grpc[field] = durationMs(grpc[field])
    }
    if (grpc.health && grpc.health.requestTime !== undefined) {
      grpc.health.requestTime = durationMs(grpc.health.requestTime)
    }
    if (grpc.stream && grpc.stream.heartbeat !== undefined) {
      grpc.stream.heartbeat = durationMs(grpc.stream.heartbeat)
    }
  }
  return result
}

export = {normalize, durationMs}
