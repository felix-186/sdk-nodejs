// @ts-nocheck
const {test} = require('node:test')
const assert = require('node:assert/strict')
const MQ = require('./index')

test('local MQ publishes and receives without a broker', async () => {
  const mq = new MQ({type: 'local', local: {logPublish: false}})
  const received = []
  mq.receive(['data', 'project'], (topic, payload) => received.push({topic, payload}))
  await mq.send(['data', 'project'], {value: 5})
  assert.deepEqual(received, [{topic: 'data/project', payload: {value: 5}}])
  await new Promise(resolve => mq.close(resolve))
})
