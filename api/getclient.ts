// @ts-nocheck
const {Etcd3} = require('etcd3')
const ApiClient = require('./client')

function fromValue(endpoint, value) {
  const api = value?.App?.API
  if (!api) throw new Error('etcd 配置缺少 App.API')
  return new ApiClient({endpoint, ak: api.AK, sk: api.SK, projectId: api.ProjectId})
}

async function getClientFromEtcd(endpoint, client, key = '/config/pro.json') {
  const value = await client.get(key || '/config/pro.json').json()
  return fromValue(endpoint, value)
}

async function getClient(endpoint, etcdCfg = {}) {
  const {endpoints = 'etcd:2379', username = 'root', password,
    key = '/config/pro.json'} = etcdCfg
  const client = new Etcd3({hosts: endpoints, auth: {username, password}})
  try {
    return await getClientFromEtcd(endpoint, client, key)
  } finally {
    client.close()
  }
}

function getApi(config) {
  return new ApiClient(config)
}

export = {getClient, getClientFromEtcd, getApi}
