// @ts-nocheck
const {test} = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const ApiClient = require('./index')
const {WebSocketServer} = require('ws')
const {getClientFromEtcd} = require('./getclient')

async function fixture(handler, run) {
  const server = http.createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    return await run(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

function json(response, code, value, headers = {}) {
  response.writeHead(code, {'Content-Type': 'application/json', ...headers})
  response.end(JSON.stringify(value))
}

test('published routes cover business services and omit operation', () => {
  assert.equal(Object.keys(ApiClient.routes).length, 7)
  assert.equal(Object.keys(ApiClient.routes).some(service => service === 'operation'), false)
  assert.equal(Object.values(ApiClient.routes).reduce((n, group) => n + Object.keys(group).length, 0), 563)
  assert.equal(Object.keys(ApiClient.routes.core).some(route => route.startsWith('GET /core/operation/') || route.startsWith('POST /core/operation/')), false)
})

test('Operation environment overrides API client configuration', () => {
  const key = 'production_api__endpoint'
  const previous = process.env[key]
  const projectKey = 'production_api__projectId'
  const previousProject = process.env[projectKey]
  process.env[key] = 'http://kesi.local:3030/rest'
  process.env[projectKey] = 'injected-project'
  try {
    const client = new ApiClient({endpoint: 'http://old.local'})
    assert.equal(client.endpoint, 'http://kesi.local:3030/rest')
    assert.equal(client.projectId, 'injected-project')
    assert.equal(client.setProjectId('another-project').projectId, 'another-project')
  } finally {
    if (previous === undefined) delete process.env[key]
    else process.env[key] = previous
    if (previousProject === undefined) delete process.env[projectKey]
    else process.env[projectKey] = previousProject
  }
})

test('AppKey authentication, project header, JSON query, path encoding and token cache', async () => {
  const seen = []
  await fixture(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    seen.push({path: url.pathname, query: Object.fromEntries(url.searchParams),
      project: request.headers['x-request-project'], auth: request.headers.authorization})
    if (url.pathname === '/core/auth/token') {
      assert.equal(url.searchParams.get('appkey'), 'key')
      assert.equal(url.searchParams.get('appsecret'), 'secret')
      assert.equal(request.headers.authorization, undefined)
      return json(response, 200, {token: 'Bearer valid', expiresAt: Math.floor(Date.now() / 1000) + 3600})
    }
    return json(response, 200, {ok: true}, {count: '3'})
  }, async endpoint => {
    const client = new ApiClient({endpoint, ak: 'key', sk: 'secret', projectId: 'p1'})
    const project = client.setProjectId('p2')
    const [a, b] = await Promise.all([
      project.queryTableData('table / 甲', {filter: {name: '设备'}}),
      project.getTableData('table / 甲', 'dev/1')
    ])
    assert.deepEqual(a.data, {ok: true})
    assert.deepEqual(b.data, {ok: true})
    assert.equal(a.success, true)
    assert.equal(a.status, 200)
    assert.equal(a.message, 'OK')
    assert.equal(a.count, 3)
    assert.equal(seen.filter(item => item.path === '/core/auth/token').length, 1)
    const query = seen.find(item => item.path === '/core/t/table%20%2F%20%E7%94%B2/d')
    const detail = seen.find(item => item.path === '/core/t/table%20%2F%20%E7%94%B2/d/dev%2F1')
    assert.ok(query)
    assert.ok(detail)
    assert.equal(query.project, 'p2')
    assert.equal(query.auth, 'Bearer valid')
    assert.deepEqual(JSON.parse(query.query.query), {filter: {name: '设备'}})
    assert.equal(detail.project, 'p2')
    const response = await project.call('driver', 'GET', '/driver/archiveEvent', {response: true})
    assert.equal(response.headers.get('count'), '3')
    assert.equal(response.count, 3)
    assert.equal(seen.filter(item => item.path === '/core/auth/token').length, 1)
  })
})

test('status codes, error payloads, request body and explicit token', async () => {
  await fixture(async (request, response) => {
    if (request.url === '/core/log') {
      assert.equal(request.headers.authorization, 'Bearer manual')
      let raw = ''
      for await (const chunk of request) raw += chunk
      assert.deepEqual(JSON.parse(raw), {name: 'abc'})
      response.writeHead(204)
      return response.end()
    }
    return json(response, 422, {code: 7, message: 'bad input'})
  }, async endpoint => {
    const client = new ApiClient({endpoint, token: 'manual'})
    const created = await client.createLog({name: 'abc'})
    assert.equal(created.success, true)
    assert.equal(created.status, 204)
    assert.equal(created.message, 'No Content')
    assert.equal(created.data, null)
    assert.equal(created.count, null)
    await assert.rejects(client.getAuthUser(), error => {
      assert.equal(error instanceof ApiClient.ApiError, true)
      assert.equal(error.status, 422)
      assert.deepEqual(error.body, {code: 7, message: 'bad input'})
      assert.equal(error.success, false)
      assert.equal(error.message, 'bad input')
      assert.equal(error.result.data, error.body)
      return true
    })
  })
})

test('project-scoped methods and route validation', async () => {
  await fixture((request, response) => {
    assert.equal(request.headers['x-request-project'], 'project-2')
    assert.equal(request.headers.authorization, 'Bearer manual')
    json(response, 200, {id: 'record'})
  }, async endpoint => {
    const client = new ApiClient({endpoint, token: 'manual'})
    assert.deepEqual((await client.setProjectId('project-2').getTableData('table', 'record')).data, {id: 'record'})
    await assert.rejects(client.call('core', 'GET', '/core/t/{table}/d/{id}', {path: {table: 'x'}}), /缺少路径参数: id/)
    await assert.rejects(client.call('core', 'GET', '/core/not-in-spec'), /未收录接口/)
  })
})

test('warning and system variable methods cover the published routes', async () => {
  const client = new ApiClient()
  const used = new Set()
  const calls = new Map()
  client.call = async (service, method, route, options = {}) => {
    const key = `${method} ${route}`
    assert.ok(ApiClient.routes[service]?.[key], `missing route ${service} ${key}`)
    used.add(`${service} ${key}`)
    calls.set(`${service} ${key}`, options)
  }
  const run = async (methods, ...args) => Promise.all(methods.map(name => client[name](...args)))
  await run(['getSystemVariableImportTemplate', 'getSystemVariableUpdateTemplate',
    'getWarningDescriptions', 'getWarningStats', 'getLatestWarningStats', 'getWarningStatsOverview'])
  await run(['querySystemVariable', 'exportSystemVariable', 'queryWarningRule', 'queryWarning',
    'updateAllWarning', 'queryArchivedWarning', 'archiveWarningNow', 'queryWarningArchiveSetting',
    'queryWarningCleanSetting', 'deleteWarningNow', 'getWarningStatsTimeline'], {filter: {id: 'x'}})
  await run(['getSystemVariable', 'deleteSystemVariable', 'getWarningRule', 'deleteWarningRule',
    'restoreArchivedWarning', 'getWarning', 'deleteWarning', 'getWarningArchiveSetting',
    'deleteWarningArchiveSetting', 'getWarningCleanSetting', 'deleteWarningCleanSetting'], 'a/b')
  await run(['createSystemVariable', 'createWarningRule', 'pullWarningRule', 'createWarning',
    'createWarningBatch', 'updateWarningBatch', 'createWarningArchiveSetting',
    'createWarningCleanSetting', 'postLatestWarningStats'], {id: 'x'})
  await run(['replaceSystemVariable', 'updateSystemVariable', 'replaceWarningRule',
    'updateWarningRule', 'replaceWarning', 'updateWarning', 'replaceWarningArchiveSetting',
    'updateWarningArchiveSetting', 'replaceWarningCleanSetting', 'updateWarningCleanSetting'],
    'a/b', {id: 'x'})
  await client.importSystemVariable(new Blob(['x']), true)
  await client.updateSystemVariableFromExcel(new Blob(['x']))

  const expected = [
    ...Object.keys(ApiClient.routes.warning).map(key => `warning ${key}`),
    ...Object.keys(ApiClient.routes.core).filter(key => key.includes('/core/systemVariable'))
      .map(key => `core ${key}`)
  ]
  assert.deepEqual([...used].sort(), expected.sort())
  assert.deepEqual(calls.get('core GET /core/systemVariable').query.query, {filter: {id: 'x'}})
  assert.equal(calls.get('core POST /core/systemVariable/import/excel/{notSkip}').path.notSkip, 'true')
  assert.equal(calls.get('warning GET /warning/warning/{id}').path.id, 'a/b')
})

test('warning and system variable responses normalize count, message and binary data', async () => {
  await fixture(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    if (url.pathname === '/warning/warning') {
      assert.deepEqual(JSON.parse(url.searchParams.get('query')), {withCount: true})
      assert.equal(request.headers['x-request-project'], 'project-1')
      return json(response, 200, [{id: 'w1'}], {count: '7'})
    }
    if (url.pathname === '/core/systemVariable/import/excel/template') {
      response.writeHead(200, {'Content-Type': 'application/octet-stream'})
      return response.end(Buffer.from([1, 2, 3]))
    }
    if (url.pathname === '/warning/warning/stats') {
      return json(response, 200, {count: 4})
    }
    if (url.pathname === '/core/systemVariable') {
      return json(response, 201, {status: 'OK', message: 'created'})
    }
    return json(response, 404, {message: 'missing'})
  }, async endpoint => {
    const client = new ApiClient({endpoint, token: 'manual', projectId: 'project-1'})
    const warnings = await client.queryWarning({withCount: true})
    assert.equal(warnings.success, true)
    assert.equal(warnings.count, 7)
    assert.deepEqual(warnings.data, [{id: 'w1'}])
    const created = await client.createSystemVariable({name: 'v'})
    assert.equal(created.status, 201)
    assert.equal(created.message, 'created')
    assert.deepEqual(created.data, {status: 'OK', message: 'created'})
    assert.equal((await client.getWarningStats()).count, 4)
    const template = await client.getSystemVariableImportTemplate()
    assert.equal(template.success, true)
    assert.deepEqual(template.data, Buffer.from([1, 2, 3]))
    assert.deepEqual(await client.request('GET', '/warning/warning',
      {auth: false, query: {query: {withCount: true}}, raw: true}), [{id: 'w1'}])
  })
})

test('WebSocket subscription uses the documented project query', async () => {
  const server = new WebSocketServer({host: '127.0.0.1', port: 0})
  await new Promise(resolve => server.once('listening', resolve))
  let request
  server.once('connection', (_socket, incoming) => { request = incoming })
  let socket
  try {
    const client = new ApiClient({endpoint: `http://127.0.0.1:${server.address().port}/rest`, projectId: 'p1'})
    socket = await client.connectWebSocket('time', {auth: false})
    assert.equal(request.headers.authorization, undefined)
    const url = new URL(request.url, 'http://localhost')
    assert.equal(url.pathname, '/rest/ws-data/core/ws/time')
    assert.equal(url.searchParams.get('X-Request-Project'), 'p1')
  } finally {
    if (socket) socket.terminate()
    await new Promise(resolve => server.close(resolve))
  }
})

test('etcd client reads the current platform config key', async () => {
  let key
  const etcd = {get: requested => {
    key = requested
    return {json: async () => ({App: {API: {AK: 'key', SK: 'secret', ProjectId: 'project'}}})}
  }}
  const client = await getClientFromEtcd('http://localhost/rest', etcd)
  assert.equal(key, '/config/pro.json')
  assert.equal(client.projectId, 'project')
})
