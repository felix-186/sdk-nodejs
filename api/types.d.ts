declare class ApiHttpError extends Error {
  status: number
  body: unknown
  success: false
  data: unknown
  count: number | null
  headers: Headers
  result: ApiClient.Result<unknown>
}

declare namespace ApiClient {
  type Service = 'core' | 'algorithm' | 'driver' | 'ws-data' | 'data-source' | 'flow' | 'warning'
  interface Config {
    endpoint: string
    projectId?: string
    project?: string
    token?: string
    ak?: string
    sk?: string
    credentials?: {ak: string; sk: string}
    type?: 'project'
    timeout?: number
  }
  interface RequestOptions {
    path?: Record<string, string | number>
    query?: Record<string, unknown>
    headers?: Record<string, string>
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
  interface LegacyOptions {
    method?: string
    url: string
    qs?: Record<string, unknown>
    json?: boolean | unknown
    body?: unknown
    headers?: Record<string, string>
    auth?: boolean
    response?: boolean
    raw?: boolean
    timeout?: number
    signal?: AbortSignal
  }
  interface Result<T> {
    success: boolean
    message: string
    data: T
    status: number
    count: number | null
    headers: Headers
  }
  type Response<T> = Result<T>
  interface Token { token: string; expiresAt?: number }
}

declare class ApiClient {
  constructor(config: ApiClient.Config)
  static routes: Record<ApiClient.Service, Record<string, unknown>>
  static ApiError: typeof ApiHttpError
  endpoint: string
  projectId: string
  setToken(token: string): this
  setProjectId(projectId: string): this
  authToken(callback?: (error: Error | null, token?: ApiClient.Token) => void): Promise<ApiClient.Token>
  request<T = unknown>(method: string, path: string,
    options: ApiClient.RequestOptions & ({raw: true} | {response: false})): Promise<T>
  request<T = unknown>(method: string, path: string, options?: ApiClient.RequestOptions): Promise<ApiClient.Result<T>>
  call<T = unknown>(service: ApiClient.Service, method: string, route: string,
    options: ApiClient.RequestOptions & ({raw: true} | {response: false})): Promise<T>
  call<T = unknown>(service: ApiClient.Service, method: string, route: string,
    options?: ApiClient.RequestOptions): Promise<ApiClient.Result<T>>
  req<T = unknown>(options: ApiClient.LegacyOptions & ({raw: true} | {response: false})): Promise<T>
  req<T = unknown>(options: ApiClient.LegacyOptions): Promise<ApiClient.Result<T>>
  connectWebSocket(type: string, options?: ApiClient.RequestOptions): Promise<{
    send(data: string | ArrayBuffer | Uint8Array): void
    close(): void
    on(event: string, listener: (...args: any[]) => void): unknown
  }>
  getDataLatest(query?: unknown): Promise<ApiClient.Result<unknown>>
  getDataQuery(query?: unknown): Promise<ApiClient.Result<unknown>>
  querySetting(query?: unknown): Promise<ApiClient.Result<unknown>>
  queryTableSchema(query?: unknown): Promise<ApiClient.Result<unknown>>
  getTableSchema(id: string): Promise<ApiClient.Result<unknown>>
  delTableSchema(id: string): Promise<ApiClient.Result<unknown>>
  updateTableSchema(id: string, data: unknown): Promise<ApiClient.Result<unknown>>
  createLog(data: unknown): Promise<ApiClient.Result<unknown>>
  updateLog(id: string, data: unknown): Promise<ApiClient.Result<unknown>>
  queryTableData(table: string, query?: unknown): Promise<ApiClient.Result<unknown>>
  getTableData(table: string, id: string): Promise<ApiClient.Result<unknown>>
  updateTableData(table: string, id: string, data: unknown): Promise<ApiClient.Result<unknown>>
  saveTableData(table: string, data: unknown): Promise<ApiClient.Result<unknown>>
  delTableData(table: string, id: string): Promise<ApiClient.Result<unknown>>
  getAuthUser(): Promise<ApiClient.Result<unknown>>
  querySystemVariable(query?: unknown, options?: Record<string, unknown>): Promise<ApiClient.Result<unknown>>
  exportSystemVariable(query?: unknown): Promise<ApiClient.Result<unknown>>
  createSystemVariable(data: unknown): Promise<ApiClient.Result<unknown>>
  getSystemVariable(id: string): Promise<ApiClient.Result<unknown>>
  replaceSystemVariable(id: string, data: unknown): Promise<ApiClient.Result<unknown>>
  updateSystemVariable(id: string, data: unknown): Promise<ApiClient.Result<unknown>>
  deleteSystemVariable(id: string): Promise<ApiClient.Result<unknown>>
  getSystemVariableImportTemplate(): Promise<ApiClient.Result<unknown>>
  importSystemVariable(file: string | Blob, notSkip?: boolean): Promise<ApiClient.Result<unknown>>
  getSystemVariableUpdateTemplate(): Promise<ApiClient.Result<unknown>>
  updateSystemVariableFromExcel(file: string | Blob): Promise<ApiClient.Result<unknown>>
  queryWarningRule(query?: unknown): Promise<ApiClient.Result<unknown>>
  createWarningRule(data: unknown): Promise<ApiClient.Result<unknown>>
  pullWarningRule(data: unknown): Promise<ApiClient.Result<unknown>>
  getWarningRule(id: string): Promise<ApiClient.Result<unknown>>
  replaceWarningRule(id: string, data: unknown): Promise<ApiClient.Result<unknown>>
  updateWarningRule(id: string, data: unknown): Promise<ApiClient.Result<unknown>>
  deleteWarningRule(id: string): Promise<ApiClient.Result<unknown>>
  queryWarning(query?: unknown, options?: Record<string, unknown>): Promise<ApiClient.Result<unknown>>
  createWarning(data: unknown): Promise<ApiClient.Result<unknown>>
  updateAllWarning(query?: unknown, options?: Record<string, unknown>): Promise<ApiClient.Result<unknown>>
  queryArchivedWarning(query?: unknown, options?: Record<string, unknown>): Promise<ApiClient.Result<unknown>>
  restoreArchivedWarning(id: string): Promise<ApiClient.Result<unknown>>
  createWarningBatch(data: unknown, options?: Record<string, unknown>): Promise<ApiClient.Result<unknown>>
  updateWarningBatch(ids: string[], options?: Record<string, unknown>): Promise<ApiClient.Result<unknown>>
  getWarningDescriptions(): Promise<ApiClient.Result<unknown>>
  archiveWarningNow(query?: unknown): Promise<ApiClient.Result<unknown>>
  getWarning(id: string, options?: Record<string, unknown>): Promise<ApiClient.Result<unknown>>
  replaceWarning(id: string, data: unknown, options?: Record<string, unknown>): Promise<ApiClient.Result<unknown>>
  updateWarning(id: string, data: unknown, options?: Record<string, unknown>): Promise<ApiClient.Result<unknown>>
  deleteWarning(id: string, options?: Record<string, unknown>): Promise<ApiClient.Result<unknown>>
  queryWarningArchiveSetting(query?: unknown): Promise<ApiClient.Result<unknown>>
  createWarningArchiveSetting(data: unknown): Promise<ApiClient.Result<unknown>>
  getWarningArchiveSetting(id: string): Promise<ApiClient.Result<unknown>>
  replaceWarningArchiveSetting(id: string, data: unknown): Promise<ApiClient.Result<unknown>>
  updateWarningArchiveSetting(id: string, data: unknown): Promise<ApiClient.Result<unknown>>
  deleteWarningArchiveSetting(id: string): Promise<ApiClient.Result<unknown>>
  queryWarningCleanSetting(query?: unknown): Promise<ApiClient.Result<unknown>>
  createWarningCleanSetting(data: unknown): Promise<ApiClient.Result<unknown>>
  getWarningCleanSetting(id: string): Promise<ApiClient.Result<unknown>>
  replaceWarningCleanSetting(id: string, data: unknown): Promise<ApiClient.Result<unknown>>
  updateWarningCleanSetting(id: string, data: unknown): Promise<ApiClient.Result<unknown>>
  deleteWarningCleanSetting(id: string): Promise<ApiClient.Result<unknown>>
  deleteWarningNow(query?: unknown): Promise<ApiClient.Result<unknown>>
  getWarningStats(options?: Record<string, unknown>): Promise<ApiClient.Result<unknown>>
  getLatestWarningStats(options?: Record<string, unknown>): Promise<ApiClient.Result<unknown>>
  postLatestWarningStats(data: unknown): Promise<ApiClient.Result<unknown>>
  getWarningStatsOverview(options?: Record<string, unknown>): Promise<ApiClient.Result<unknown>>
  getWarningStatsTimeline(query?: unknown, options?: Record<string, unknown>): Promise<ApiClient.Result<unknown>>
}

export = ApiClient
