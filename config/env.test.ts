import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readEnvironmentConfig} from './env'

test('Operation ExtraConfig environment names map to SDK config', () => {
  const config = readEnvironmentConfig({
    'APP.API.AK': 'app-key',
    'API.GATEWAY': 'http://gateway/rest',
    'MQ.MQTT.HOST': 'mqtt.local',
    'production_api__endpoint': 'http://kesi:3030/rest',
    'production_api__projectId': 'project-1',
    'production_api__sk': 'secret',
    'production_mq__mqtt__port': '1883',
    'production_mq__mqtt__tlsConfig__insecureSkipVerify': 'true',
    'production_driver-grpc__host': 'driver.local',
    'DRIVERGRPC.HOST': 'old-driver'
  })
  assert.deepEqual(config.api, {ak: 'app-key', gateway: 'http://gateway/rest',
    endpoint: 'http://kesi:3030/rest', projectId: 'project-1', sk: 'secret'})
  assert.deepEqual(config.mq, {mqtt: {host: 'mqtt.local', port: 1883,
    tlsConfig: {insecureSkipVerify: true}}})
  assert.deepEqual(config.driverGrpc, {host: 'driver.local'})
})
