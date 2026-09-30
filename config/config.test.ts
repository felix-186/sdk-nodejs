// @ts-nocheck
const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const {load} = require('./index')
const {normalize, durationMs} = require('./normalize')

test('Go SDK log and duration settings are normalized', () => {
  const config = normalize({log: {level: 5, format: 'json'}, driverGrpc: {
    waitTime: '5s', health: {requestTime: '10s'}, stream: {heartbeat: '1m30s'}}})
  assert.equal(config.logger.level, 'debug')
  assert.equal(config.logger.fmt, 'json')
  assert.equal(config.driverGrpc.waitTime, 5000)
  assert.equal(config.driverGrpc.health.requestTime, 10000)
  assert.equal(config.driverGrpc.stream.heartbeat, 90000)
  assert.equal(durationMs('invalid'), 'invalid')
})

test('load config.yaml and apply explicit overrides', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'kesi-config-'))
  try {
    await fs.writeFile(path.join(folder, 'config.yaml'),
      'project: original\ndriver:\n  id: sensor\n  name: Sensor\n')
    const config = await load(folder, {project: 'override'})
    assert.equal(config.project, 'override')
    assert.equal(config.driver.id, 'sensor')
  } finally {
    await fs.rm(folder, {recursive: true, force: true})
  }
})
