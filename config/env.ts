type Config = Record<string, unknown>

const fields: Record<string, string> = {
  api: 'api', mq: 'mq', mqtt: 'mqtt', kafka: 'kafka', rabbit: 'rabbit', etcd: 'etcd',
  log: 'log', logger: 'logger', drivergrpc: 'driverGrpc', algorithmgrpc: 'algorithmGrpc',
  datarelaygrpc: 'dataRelayGrpc', flowengine: 'flowEngine', projectid: 'projectId',
  gatewaygrpc: 'gatewayGrpc', tlsconfig: 'tlsConfig', insecureskipverify: 'insecureSkipVerify',
  waittime: 'waitTime', healthinterval: 'healthInterval', healthrequesttime: 'healthRequestTime',
  healthretry: 'healthRetry', serviceid: 'serviceId', groupid: 'groupId', datafile: 'dataFile'
}

function fieldName(value: string): string {
  return fields[value.replace(/[-_]/g, '').toLowerCase()] ||
    (value === value.toUpperCase() ? value.toLowerCase() : value.charAt(0).toLowerCase() + value.slice(1))
}

function envValue(path: string[], value: string): unknown {
  const leaf = path[path.length - 1]
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true'
  if (['port', 'level', 'retry', 'limit', 'healthRetry', 'healthInterval', 'timeout'].includes(leaf) &&
      /^-?\d+$/.test(value)) return Number(value)
  return value
}

function assign(result: Config, segments: string[], value: string): void {
  if (segments.length === 0) return
  const path = segments.map(fieldName)
  let cursor: Config = result
  for (const segment of path.slice(0, -1)) {
    if (!cursor[segment] || typeof cursor[segment] !== 'object') cursor[segment] = {}
    cursor = cursor[segment] as Config
  }
  cursor[path[path.length - 1]] = envValue(path, value)
}

export function readEnvironmentConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result: Config = {}
  // Operation's ExtraConfig.Env uses both dotted names and production_* names.
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || !name.includes('.')) continue
    const segments = name.split('.')
    if (segments[0].toLowerCase() === 'app') segments.shift()
    const root = fieldName(segments[0])
    if (!['api', 'mq', 'etcd', 'log', 'logger', 'driverGrpc', 'algorithmGrpc', 'dataRelayGrpc', 'flowEngine'].includes(root)) continue
    assign(result, segments, value)
  }
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || !name.toLowerCase().startsWith('production_')) continue
    assign(result, name.slice('production_'.length).split('__'), value)
  }
  const api = result.api as Config | undefined
  if (api?.gateway && !api.endpoint) api.endpoint = api.gateway
  return result
}
