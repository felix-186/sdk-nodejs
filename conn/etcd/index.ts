// @ts-nocheck
const {Etcd3} = require('etcd3')

function createClient(cfg = {}) {
  const endpoints = cfg.endpoints || ['etcd:2379']
  return new Etcd3({hosts: endpoints,
    auth: cfg.username ? {username: cfg.username, password: cfg.password || ''} : undefined})
}

async function scanConfig(key, cfg) {
  if (!key) throw new Error('etcd 配置键为空')
  const client = createClient(cfg)
  try {
    const value = await client.get(key).json()
    if (!value || typeof value !== 'object') throw new Error(`etcd 配置不存在: ${key}`)
    return value
  } finally {
    client.close()
  }
}

export = {createClient, scanConfig}
