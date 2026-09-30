// @ts-nocheck
const fs = require('fs/promises')
const path = require('path')
const YAML = require('yaml')
const _ = require('lodash')
const {scanConfig} = require('../conn/etcd')
const {decodeConfig} = require('../utils/cipherx')
const {normalize} = require('./normalize')

async function load(source, overrides = {}) {
  let config
  if (typeof source === 'string') {
    const filename = (await fs.stat(source)).isDirectory() ? path.join(source, 'config.yaml') : source
    const content = await fs.readFile(filename, 'utf8')
    config = filename.endsWith('.json') ? JSON.parse(content) : YAML.parse(content)
  } else {
    config = source || {}
  }
  if (config.etcdConfig) {
    const remote = await scanConfig(config.etcdConfig, config.etcd || {})
    config = _.merge({}, remote, config)
  }
  return normalize(decodeConfig(_.merge({}, config, overrides)))
}

export = {load, normalize}
