import ApiClient = require('@kesi/sdk-nodejs/api')

// production_api__endpoint、production_api__ak、production_api__sk、
// production_api__projectId 可覆盖以下本地示例配置。
const client = new ApiClient({
  endpoint: process.env.production_api__endpoint || 'http://192.168.99.103:31000',
  projectId: process.env.production_api__projectId || 'default',
  ak: process.env.production_api__ak || '',
  sk: process.env.production_api__sk || ''
})

async function main(): Promise<void> {
  const schema = await client.queryTableSchema({filter: {id: {$in: ['设备表', 'node-driver-mqtt']}}})
  console.log('工作表定义:', schema.data, '总数:', schema.count)

  const variables = await client.querySystemVariable({limit: 20, withCount: true})
  console.log('系统变量:', variables.data, '总数:', variables.count)

  const warnings = await client.queryWarning({limit: 20, withCount: true})
  console.log('报警记录:', warnings.data, '总数:', warnings.count)

  // 其余服务可按文档中收录的路径调用：
  // await client.call('core', 'GET', '/core/t/schema/{id}', {path: {id: '设备表'}})
}

main().catch(error => {
  console.error('请求失败:', error.result || error)
  process.exitCode = 1
})
