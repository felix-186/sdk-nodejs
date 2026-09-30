import {readEnvironmentConfig} from '../config/env'
import WebSocket = require('ws')

interface ApiConfig {
  endpoint?: string
  projectId?: string
  project?: string
  token?: string
  ak?: string
  sk?: string
  credentials?: {ak?: string; sk?: string}
  type?: string
  timeout?: number
}

interface RequestOptions {
  path?: Record<string, string | number>
  query?: Record<string, unknown>
  headers?: HeadersInit
  body?: unknown
  form?: Record<string, string | Blob>
  projectId?: string
  auth?: boolean
  response?: boolean
  raw?: boolean
  responseType?: 'buffer'
  timeout?: number
  signal?: AbortSignal
}

interface LegacyOptions extends RequestOptions {
  method?: string
  url?: string
  qs?: Record<string, unknown>
  json?: unknown
}

interface TokenData {
  token: string
  expiresAt: number
  [key: string]: unknown
}

interface RouteMeta {
  auth: boolean
  params: Array<{name: string; in: string; required: boolean}>
}

const routes = require('./routes.json') as Record<string, Record<string, RouteMeta>>

class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  readonly headers: Headers
  readonly success = false
  readonly data: unknown
  readonly count: number | null
  readonly result: ApiResult

  constructor(result: ApiResult) {
    super(result.message)
    this.name = 'ApiError'
    this.status = result.status
    this.body = result.data
    this.data = result.data
    this.count = result.count
    this.headers = result.headers
    this.result = result
  }
}

interface ApiResult<T = unknown> {
  success: boolean
  status: number
  message: string
  data: T
  count: number | null
  headers: Headers
}

function resultOf(response: Response, data: unknown): ApiResult {
  const countHeader = response.headers.get('count')
  const body = data && typeof data === 'object' ? data as Record<string, unknown> : null
  const bodyCount = Number(body?.count)
  const count = countHeader !== null && /^\d+$/.test(countHeader) ? Number(countHeader) :
    body?.count !== undefined && body.count !== null && Number.isFinite(bodyCount) ? bodyCount : null
  const bodyMessage = body?.message || body?.detail
  const message = typeof bodyMessage === 'string' && bodyMessage ? bodyMessage :
    response.statusText || `HTTP ${response.status}`
  return {success: response.ok, status: response.status, message, data, count, headers: response.headers}
}

function tokenValue(value: string): string {
  if (!value) return ''
  return /^Bearer\s/i.test(value) ? value : `Bearer ${value}`
}

function expiresAt(value: unknown): number {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return 0
  return num < 1e12 ? num * 1000 : num
}

function encodeQuery(url: URL, query?: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null) continue
    const encoded = typeof value === 'object' ? JSON.stringify(value) : String(value)
    url.searchParams.set(key, encoded)
  }
}

class ApiClient {
  static readonly routes = routes
  static readonly ApiError = ApiError
  readonly cfg: ApiConfig
  readonly endpoint: string
  projectId: string
  token: TokenData | null
  _explicitToken: boolean
  _sessions: Map<string, {token?: TokenData; promise?: Promise<TokenData>}>
  readonly timeout: number

  constructor(config: ApiConfig = {}) {
    config = {...config, ...((readEnvironmentConfig().api || {}) as Partial<ApiConfig>)}
    this.cfg = {...config}
    this.endpoint = String(config.endpoint || '').replace(/\/+$/, '')
    if (this.endpoint && !/^https?:\/\//i.test(this.endpoint)) throw new TypeError('api.endpoint 必须是 HTTP(S) 地址')
    this.projectId = config.projectId || config.project || 'default'
    this.token = config.token ? {token: tokenValue(config.token), expiresAt: 0} : null
    this._explicitToken = Boolean(config.token)
    this._sessions = new Map<string, {token?: TokenData; promise?: Promise<TokenData>}>()
    this.timeout = config.timeout || 30000
  }

  setToken(token: string): ApiClient {
    const clone = this.setProjectId(this.projectId)
    clone.token = token ? {token: tokenValue(token), expiresAt: 0} : this.token
    clone._explicitToken = Boolean(token) || this._explicitToken
    return clone
  }

  setProjectId(projectId: string): ApiClient {
    const clone = new ApiClient({...this.cfg, projectId: projectId || this.projectId})
    clone.projectId = projectId || this.projectId
    clone._sessions = this._sessions
    if (clone.projectId === this.projectId || this._explicitToken) clone.token = this.token
    clone._explicitToken = this._explicitToken
    return clone
  }

  async authToken(callback?: (error: Error | null, token?: TokenData) => void): Promise<TokenData> {
    const promise = this._authToken()
    if (typeof callback === 'function') promise.then(value => callback(null, value), callback)
    return promise
  }

  async _authToken(force = false): Promise<TokenData> {
    const cached = this._sessions.get(this.projectId)
    const token = this._explicitToken ? this.token : cached?.token || this.token
    if (!force && token && (!token.expiresAt || token.expiresAt > Date.now() + 30000)) return token
    if (cached?.promise) return cached.promise
    const ak = this.cfg.ak || this.cfg.credentials?.ak
    const sk = this.cfg.sk || this.cfg.credentials?.sk
    if (!ak || !sk) throw new Error('需要 token 或 api.ak/api.sk')
    if (this.cfg.type && this.cfg.type !== 'project') throw new Error('当前平台只支持项目 AppKey/AppSecret 认证')
    const promise = (async () => {
      // The server requires appsecret in the query string; never include the URL in errors.
      const result = await this._send('GET', '/core/auth/token', {
        query: {appkey: ak, appsecret: sk}, auth: false, response: true
      })
      const body = (result.data || {}) as Record<string, unknown>
      const raw = body.token || result.headers.get('token')
      if (!raw) throw new Error('换取 Token 的响应缺少 token')
      this.token = {...body, token: tokenValue(String(raw)), expiresAt: expiresAt(body.expiresAt)}
      this._sessions.set(this.projectId, {token: this.token})
      return this.token
    })()
    this._sessions.set(this.projectId, {promise})
    try { return await promise } finally {
      const entry = this._sessions.get(this.projectId)
      if (entry?.promise === promise) this._sessions.delete(this.projectId)
    }
  }

  async _send(method: string, path: string, options: RequestOptions = {}): Promise<any> {
    if (!this.endpoint) throw new Error('api.endpoint 未配置')
    const url = new URL(this.endpoint + '/' + path.replace(/^\/+/, ''))
    encodeQuery(url, options.query)
    const headers = new Headers(options.headers || {})
    if (!headers.has('x-request-project')) headers.set('x-request-project', options.projectId || this.projectId)
    if (!headers.has('Accept')) headers.set('Accept', 'application/json')
    if (options.auth !== false && !headers.has('Authorization')) {
      const token = await this._authToken()
      headers.set('Authorization', token.token)
    }
    let body = options.body
    if (body !== undefined && body !== null && !(body instanceof FormData) &&
      !Buffer.isBuffer(body) && typeof body !== 'string' && !(body instanceof ArrayBuffer)) {
      headers.set('Content-Type', headers.get('Content-Type') || 'application/json')
      body = JSON.stringify(body)
    }
    const controller = new AbortController()
    const onAbort = () => controller.abort(options.signal.reason)
    if (options.signal) {
      if (options.signal.aborted) onAbort()
      else options.signal.addEventListener('abort', onAbort, {once: true})
    }
    const timer = setTimeout(() => controller.abort(new Error('API 请求超时')), options.timeout || this.timeout)
    try {
      const response = await fetch(url, {method, headers, body: body as BodyInit, signal: controller.signal})
      const contentType = response.headers.get('content-type') || ''
      let data
      if (options.responseType === 'buffer') data = Buffer.from(await response.arrayBuffer())
      else {
        const raw = await response.text()
        if (!raw) data = null
        else if (contentType.includes('json')) {
          try { data = JSON.parse(raw) } catch { data = raw }
        } else data = raw
      }
      const result = resultOf(response, data)
      if (!response.ok) throw new ApiError(result)
      return options.raw || options.response === false ? data : result
    } finally {
      clearTimeout(timer)
      if (options.signal) options.signal.removeEventListener('abort', onAbort)
    }
  }

  async request(method: string, path: string, options: RequestOptions = {}): Promise<any> {
    if (options.projectId && options.projectId !== this.projectId) {
      return this.setProjectId(options.projectId).request(method, path, {...options, projectId: undefined})
    }
    try {
      return await this._send(method.toUpperCase(), path, options)
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401 || options.auth === false ||
        this._explicitToken || new Headers(options.headers || {}).has('Authorization') ||
        !(this.cfg.ak || this.cfg.credentials?.ak)) throw error
      this._sessions.delete(this.projectId)
      this.token = null
      await this._authToken(true)
      return this._send(method.toUpperCase(), path, options)
    }
  }

  async call(service: string, method: string, route: string, options: RequestOptions = {}): Promise<any> {
    const group = routes[service]
    if (!group) throw new Error(`未知服务: ${service}`)
    const verb = method.toUpperCase()
    const template = route.startsWith('/') ? route : `/${route}`
    const spec = group[`${verb} ${template}`]
    if (!spec) throw new Error(`未收录接口: ${service} ${verb} ${template}`)
    const path = template.replace(/\{([^}]+)\}/g, (_, key: string) => {
      const value = options.path?.[key]
      if (value === undefined || value === null) throw new Error(`缺少路径参数: ${key}`)
      return encodeURIComponent(String(value))
    })
    if (spec.params.some(p => p.in === 'formData') && options.form) {
      const body = new FormData()
      for (const [key, value] of Object.entries(options.form)) body.append(key, value)
      options = {...options, body}
    }
    return this.request(verb, path, {...options, auth: options.auth ?? spec.auth})
  }

  async req(options: LegacyOptions = {}): Promise<any> {
    const path = options.url?.startsWith(this.endpoint) ? options.url.slice(this.endpoint.length) : options.url
    if (!path || !path.startsWith('/')) throw new Error('req.url 必须使用当前 endpoint 下的路径')
    return this.request(options.method || 'GET', path, {
      query: options.qs, body: options.json && options.json !== true ? options.json : options.body,
      headers: options.headers, auth: options.auth, response: options.response, raw: options.raw,
      signal: options.signal, timeout: options.timeout
    })
  }

  async connectWebSocket(type: string, options: RequestOptions = {}): Promise<WebSocket> {
    if (!this.endpoint) throw new Error('api.endpoint 未配置')
    const url = new URL(this.endpoint + `/ws-data/core/ws/${encodeURIComponent(type)}`)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    encodeQuery(url, {...options.query, 'X-Request-Project': options.projectId || this.projectId})
    const headers = new Headers(options.headers || {})
    if (options.auth !== false && !headers.has('Authorization')) {
      headers.set('Authorization', (await this._authToken()).token)
    }
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, {headers: Object.fromEntries(headers.entries())})
      socket.once('open', () => resolve(socket))
      socket.once('error', reject)
    })
  }

  getDataLatest(query = {}) { return this.call('core', 'GET', '/core/data/latest', {query: {query}}) }
  getDataQuery(query = {}) { return this.call('core', 'GET', '/core/data/query', {query: {query}}) }
  querySetting(query = {}) { return this.call('core', 'GET', '/core/setting', {query: {query}}) }
  queryTableSchema(query = {}) { return this.call('core', 'GET', '/core/t/schema', {query: {query}}) }
  getTableSchema(id) { return this.call('core', 'GET', '/core/t/schema/{id}', {path: {id}}) }
  delTableSchema(id) { return this.call('core', 'DELETE', '/core/t/schema/{id}', {path: {id}}) }
  updateTableSchema(id, data) { return this.call('core', 'PATCH', '/core/t/schema/{id}', {path: {id}, body: data}) }
  createLog(data) { return this.call('core', 'POST', '/core/log', {body: data}) }
  updateLog(id, data) { return this.call('core', 'PATCH', '/core/log/{id}', {path: {id}, body: data}) }
  queryTableData(table, query = {}) { return this.call('core', 'GET', '/core/t/{table}/d', {path: {table}, query: {query}}) }
  getTableData(table, id) { return this.call('core', 'GET', '/core/t/{table}/d/{id}', {path: {table, id}}) }
  updateTableData(table, id, data) { return this.call('core', 'PATCH', '/core/t/{table}/d/{id}', {path: {table, id}, body: data}) }
  saveTableData(table, data) { return this.call('core', 'POST', '/core/t/{table}/d', {path: {table}, body: data}) }
  delTableData(table, id) { return this.call('core', 'DELETE', '/core/t/{table}/d/{id}', {path: {table, id}}) }
  getAuthUser() { return this.call('core', 'GET', '/core/auth/user') }

  // System variables (core service)
  querySystemVariable(query = {}, options: {format?: string; [key: string]: unknown} = {}) {
    return this.call('core', 'GET', '/core/systemVariable',
      {query: {query, ...options}, responseType: options.format === 'xls' ? 'buffer' : undefined})
  }
  exportSystemVariable(query = {}) {
    return this.call('core', 'GET', '/core/systemVariable', {query: {query, format: 'xls'}, responseType: 'buffer'})
  }
  createSystemVariable(data) {
    return this.call('core', 'POST', '/core/systemVariable', {body: data})
  }
  getSystemVariable(id) {
    return this.call('core', 'GET', '/core/systemVariable/{id}', {path: {id}})
  }
  replaceSystemVariable(id, data) {
    return this.call('core', 'PUT', '/core/systemVariable/{id}', {path: {id}, body: data})
  }
  updateSystemVariable(id, data) {
    return this.call('core', 'PATCH', '/core/systemVariable/{id}', {path: {id}, body: data})
  }
  deleteSystemVariable(id) {
    return this.call('core', 'DELETE', '/core/systemVariable/{id}', {path: {id}})
  }
  getSystemVariableImportTemplate() {
    return this.call('core', 'GET', '/core/systemVariable/import/excel/template', {responseType: 'buffer'})
  }
  importSystemVariable(file: string | Blob, notSkip = false) {
    return this.call('core', 'POST', '/core/systemVariable/import/excel/{notSkip}',
      {path: {notSkip: String(notSkip)}, form: {file}})
  }
  getSystemVariableUpdateTemplate() {
    return this.call('core', 'GET', '/core/systemVariable/update/excel/template', {responseType: 'buffer'})
  }
  updateSystemVariableFromExcel(file: string | Blob) {
    return this.call('core', 'POST', '/core/systemVariable/update/excel', {form: {file}})
  }

  // Warning rules
  queryWarningRule(query = {}) {
    return this.call('warning', 'GET', '/warning/rule', {query: {query}})
  }
  createWarningRule(data) {
    return this.call('warning', 'POST', '/warning/rule', {body: data})
  }
  pullWarningRule(data) {
    return this.call('warning', 'PATCH', '/warning/rule/pull', {body: data})
  }
  getWarningRule(id) {
    return this.call('warning', 'GET', '/warning/rule/{id}', {path: {id}})
  }
  replaceWarningRule(id, data) {
    return this.call('warning', 'PUT', '/warning/rule/{id}', {path: {id}, body: data})
  }
  updateWarningRule(id, data) {
    return this.call('warning', 'PATCH', '/warning/rule/{id}', {path: {id}, body: data})
  }
  deleteWarningRule(id) {
    return this.call('warning', 'DELETE', '/warning/rule/{id}', {path: {id}})
  }

  // Warning records and archives
  queryWarning(query = {}, options: {format?: string; [key: string]: unknown} = {}) {
    return this.call('warning', 'GET', '/warning/warning',
      {query: {query, ...options}, responseType: ['xls', 'pdf'].includes(options.format) ? 'buffer' : undefined})
  }
  createWarning(data) {
    return this.call('warning', 'POST', '/warning/warning', {body: data})
  }
  updateAllWarning(query = {}, options = {}) {
    return this.call('warning', 'PATCH', '/warning/warning/all', {query: {query, ...options}})
  }
  queryArchivedWarning(query = {}, options: {format?: string; [key: string]: unknown} = {}) {
    return this.call('warning', 'GET', '/warning/warning/archive',
      {query: {query, ...options}, responseType: ['xls', 'pdf'].includes(options.format) ? 'buffer' : undefined})
  }
  restoreArchivedWarning(id) {
    return this.call('warning', 'PATCH', '/warning/warning/archive/restore/{id}', {path: {id}})
  }
  createWarningBatch(data, options = {}) {
    return this.call('warning', 'POST', '/warning/warning/batch', {query: options, body: data})
  }
  updateWarningBatch(ids, options = {}) {
    return this.call('warning', 'PATCH', '/warning/warning/batch', {query: options, body: ids})
  }
  getWarningDescriptions() {
    return this.call('warning', 'GET', '/warning/warning/desc')
  }
  archiveWarningNow(query = {}) {
    return this.call('warning', 'GET', '/warning/warning/instantArchive', {query: {query}})
  }
  getWarning(id, options = {}) {
    return this.call('warning', 'GET', '/warning/warning/{id}', {path: {id}, query: options})
  }
  replaceWarning(id, data, options = {}) {
    return this.call('warning', 'PUT', '/warning/warning/{id}', {path: {id}, query: options, body: data})
  }
  updateWarning(id, data, options = {}) {
    return this.call('warning', 'PATCH', '/warning/warning/{id}', {path: {id}, query: options, body: data})
  }
  deleteWarning(id, options = {}) {
    return this.call('warning', 'DELETE', '/warning/warning/{id}', {path: {id}, query: options})
  }

  // Warning archive and cleanup settings
  queryWarningArchiveSetting(query = {}) {
    return this.call('warning', 'GET', '/warning/warning/archiveSetting', {query: {query}})
  }
  createWarningArchiveSetting(data) {
    return this.call('warning', 'POST', '/warning/warning/archiveSetting', {body: data})
  }
  getWarningArchiveSetting(id) {
    return this.call('warning', 'GET', '/warning/warning/archiveSetting/{id}', {path: {id}})
  }
  replaceWarningArchiveSetting(id, data) {
    return this.call('warning', 'PUT', '/warning/warning/archiveSetting/{id}', {path: {id}, body: data})
  }
  updateWarningArchiveSetting(id, data) {
    return this.call('warning', 'PATCH', '/warning/warning/archiveSetting/{id}', {path: {id}, body: data})
  }
  deleteWarningArchiveSetting(id) {
    return this.call('warning', 'DELETE', '/warning/warning/archiveSetting/{id}', {path: {id}})
  }
  queryWarningCleanSetting(query = {}) {
    return this.call('warning', 'GET', '/warning/warningclean', {query: {query}})
  }
  createWarningCleanSetting(data) {
    return this.call('warning', 'POST', '/warning/warningclean', {body: data})
  }
  getWarningCleanSetting(id) {
    return this.call('warning', 'GET', '/warning/warningclean/{id}', {path: {id}})
  }
  replaceWarningCleanSetting(id, data) {
    return this.call('warning', 'PUT', '/warning/warningclean/{id}', {path: {id}, body: data})
  }
  updateWarningCleanSetting(id, data) {
    return this.call('warning', 'PATCH', '/warning/warningclean/{id}', {path: {id}, body: data})
  }
  deleteWarningCleanSetting(id) {
    return this.call('warning', 'DELETE', '/warning/warningclean/{id}', {path: {id}})
  }
  deleteWarningNow(query = {}) {
    return this.call('warning', 'GET', '/warning/warningclean/instantDelete', {query: {query}})
  }

  // Warning statistics
  getWarningStats(options = {}) {
    return this.call('warning', 'GET', '/warning/warning/stats', {query: options})
  }
  getLatestWarningStats(options = {}) {
    return this.call('warning', 'GET', '/warning/warning/stats/latest', {query: options})
  }
  postLatestWarningStats(data) {
    return this.call('warning', 'POST', '/warning/warning/stats/latest', {body: data})
  }
  getWarningStatsOverview(options = {}) {
    return this.call('warning', 'GET', '/warning/warning/stats/overview', {query: options})
  }
  getWarningStatsTimeline(query = {}, options = {}) {
    return this.call('warning', 'GET', '/warning/warning/stats/timeline', {query: {query, ...options}})
  }
}

export = ApiClient
