# KESI Node.js SDK 与示例

[English](./README_en.md) | 简体中文

KESI Node.js SDK 用于开发平台扩展服务，覆盖 Driver、Algorithm、DataRelay、Flow、FlowExtension、Service 和 Task，并提供平台 API 客户端。源码使用 TypeScript，npm 包包含编译后的 JavaScript 和类型声明。本仓库同时提供各模块的 TypeScript 示例。

源码仓库：[felix-186/sdk-nodejs](https://github.com/felix-186/sdk-nodejs) · npm 包：[@kesi/sdk-nodejs](https://www.npmjs.com/package/@kesi/sdk-nodejs)

## 目录

- [模块概览](#模块概览)
- [安装](#安装)
- [快速开始](#快速开始)
- [核心接口](#核心接口)
- [各模块开发与部署](#各模块开发与部署)
- [Driver 配置](#driver-配置)
- [从源码构建 SDK](#从源码构建-sdk)
- [API 客户端](#api-客户端)
- [FAQ](#faq)
- [环境要求](#环境要求)
- [示例概览](#示例概览)
- [示例安装与运行](#示例安装与运行)
- [示例配置](#示例配置)
- [示例模块开发](#示例模块开发)
- [示例打包与部署](#示例打包与部署)
- [示例常见问题](#示例常见问题)
- [MQTT 驱动测试数据与脚本](#mqtt-驱动测试数据与脚本)

## 模块概览

| 模块 | 导入路径 | 用途 |
| --- | --- | --- |
| Driver | `@kesi/sdk-nodejs/driver` | 设备接入、数据点上报和指令执行 |
| Algorithm | `@kesi/sdk-nodejs/algorithm` | 算法服务 |
| DataRelay | `@kesi/sdk-nodejs/data_relay` | 数据中继和 HTTP 代理 |
| Flow | `@kesi/sdk-nodejs/flow` | 流程节点 |
| FlowExtension | `@kesi/sdk-nodejs/flow_extension` | 可配置流程扩展 |
| Service | `@kesi/sdk-nodejs/service` | Express HTTP 服务 |
| Task | `@kesi/sdk-nodejs/task` | 定时任务 |
| API | `@kesi/sdk-nodejs/api` | 平台开放接口客户端 |

## 安装

```bash
npm install @kesi/sdk-nodejs
```

安装发布包后，无需自行编译 SDK。TypeScript 项目可以使用同一组导入路径，并通过随包提供的类型声明获得类型提示；使用方自己的 TypeScript 代码仍按项目配置构建。

TypeScript 项目应使用支持 `package.json` 中 `exports` 的模块解析方式，例如 `node16`、`nodenext` 或 `bundler`。本仓库示例使用 `module: "Node16"` 和 `moduleResolution: "Node16"`。

CommonJS 项目使用 `require`：

```js
const {App, Driver} = require('@kesi/sdk-nodejs/driver')
```

JavaScript ES module 项目使用默认导入后解构，因为 SDK 的运行产物是 CommonJS：

```js
import driverSDK from '@kesi/sdk-nodejs/driver'

const {App, Driver} = driverSDK
```

按模块选择导入路径。根路径 `@kesi/sdk-nodejs` 导出 API 客户端，不是所有模块的集合。

## 快速开始

```ts
import {App, Driver} from '@kesi/sdk-nodejs/driver'

class MyDriver extends Driver {
  schema(app, meta, locale, callback) { callback(null, '{}') }
  start(app, meta, config, callback) { callback() }
  stop(app, meta, callback) { callback() }
}

new App({
  project: 'default',
  serviceId: 'my-driver-instance',
  driver: {id: 'my-driver', name: 'My Driver'},
  driverGrpc: {host: '192.168.99.103', port: 9224},
  mq: {type: 'mqtt', mqtt: {host: '192.168.99.103', port: 1883}}
}).start(new MyDriver())
```

这是驱动类的最小骨架，尚未实现设备通信和数据上报。运行前请将 gRPC 和 MQTT 地址改为可访问的平台服务地址；驱动实例配置由平台下发，`schema` 应替换为实际驱动 Schema。完整实现见[示例概览](#示例概览)。首次验证 SDK 安装时，可先运行不依赖平台连接的 Service 示例。

连接平台时，`project` 填写目标项目标识，`serviceId` 填写该项目中对应驱动运行实例的标识，`driver.id` 填写驱动标识。上面的值均为示例，应替换为实际配置。SDK 未收到 `serviceId` 时会生成随机标识，但这不能替代平台已有实例的标识。

## 核心接口

Driver、Algorithm、DataRelay、Flow 和 FlowExtension 的请求处理方法使用回调接口，首个回调参数为错误；`meta` 提供当前请求的上下文信息。Service、Task 的 `start(app)` 和 `stop(app)` 不接收回调，Driver 的 `registerRoutes(router)` 也不接收回调。下表列出主要方法，按需实现；参数和完整示例见 `examples/` 目录。

| 模块 | 实现方法 | 应用提供的能力 |
| --- | --- | --- |
| Driver | `schema`、`start`、`registerRoutes`、`run`、`batchRun`、`writeTag`、`debug`、`httpProxy`、`configUpdate`、`stop` | `writePoints`、`savePoints`、设备配置、MQ 和 API 客户端 |
| Algorithm | `schema`、`start`、`run`、`stop` | 算法 gRPC 请求处理 |
| DataRelay | `start`、`httpProxy` | `getMQ()`、`getAPIClient()` |
| Flow | `handler`、`debug`、`stop` | 流程引擎请求处理 |
| FlowExtension | `schema`、`run`、`stop` | 可配置扩展节点 |
| Service | `start`、`stop` | `getHttpServer()` 返回 Express 应用 |
| Task | `start`、`stop` | `getCron()` 返回调度器 |

各模块的 `new App(config)` 接受配置对象。`App.fromConfig('./etc')` 返回 Promise，读取该目录下的 `config.yaml`；也可传入 YAML 或 JSON 文件路径。第二个参数用于覆盖配置。配置合并优先级从低到高为：etcd 配置（设置 `etcdConfig` 时）、文件配置、第二个参数、环境变量，缺失字段使用各模块的默认值。请在异步函数中通过 `await` 获取 App 实例。

配置中的加密字段使用 `KESI_CIPHER_KEY` 解密；未设置时使用 `CONFIG_CIPHER_KEY`。

## 各模块开发与部署

| 模块 | 示例入口 | 主要配置 | 连接方式 |
| --- | --- | --- | --- |
| Driver | [driver-mqtt](./examples/driver-mqtt/index.ts) | `project`、`serviceId`、`driver.id/name`、`driverGrpc.host/port`、`mq` | 主动连接平台驱动 gRPC 服务 |
| Algorithm | [algorithm](./examples/algorithm/algorithm.ts) | `algorithm.id/name`、`algorithmGrpc.host/port` | 主动连接平台算法 gRPC 服务 |
| DataRelay | [data-relay](./examples/data-relay/index.ts) | `service.id/name`、`dataRelayGrpc.host/port` | 主动连接平台数据中继 gRPC 服务 |
| Flow | [flow](./examples/flow/flow.ts) | `flow.name/mode`、`flowEngine.host/port` | 主动连接流程引擎 |
| FlowExtension | [flow-extension](./examples/flow-extension/flow_extension.ts) | `extension.id/name`、`flowEngine.host/port` | 主动连接流程引擎 |
| Service | [service](./examples/service/index.ts) | `server.port` | 监听 HTTP 端口 |
| Task | [task](./examples/task/index.ts) | 按任务需要配置 | 默认没有入站端口 |

表中的 gRPC `host/port` 是程序主动连接的平台地址，不是要暴露的入站端口。部署到容器时，应使用容器可访问的平台服务地址。平台上传 Driver、DataRelay 安装包后，还需为目标项目创建运行实例；Service、Task 等普通服务按平台的服务安装流程部署。

## Driver 配置

```yaml
project: default
serviceId: my-driver-instance
driver:
  id: my-driver
  name: My Driver
driverGrpc:
  host: 192.168.99.103
  port: 9224
mq:
  type: mqtt
  mqtt:
    host: 192.168.99.103
    port: 1883
dataFile:
  enable: false
http:
  enable: false
```

`project`、`serviceId` 和 `driver.id` 应与平台中的目标驱动实例对应。运行环境可用平台 `ExtraConfig.Env` 约定的环境变量覆盖文件配置，例如 `production_project`、`production_serviceId`、`production_api__endpoint`、`production_api__projectId`、`production_api__ak`、`production_api__sk`、`production_mq__mqtt__host`、`production_driver-grpc__host`。`production_` 形式优先；也支持 `APP.API.*` 等点分隔键。`log.level` 可用 Go SDK 的 0–5 数值级别，`driverGrpc.waitTime` 等时长可写为 `5s`、`1m30s`。本地无消息服务时可使用 `mq.type: local`。

`mq.type: local` 只替换 SDK 的消息通道，不会禁用 gRPC 或 MQTT 驱动示例自身的设备连接。若要脱离平台调试 Driver，可设置 `driverGrpc.enable: false`，并通过 `dataFile.enable: true` 和 `dataFile.path` 加载本地 JSON 实例配置；SDK 会监听文件变更。启用 `http.enable` 后可提供驱动管理接口和 `/driver/ws`。

## 从源码构建 SDK

以下命令在仓库根目录执行，适用于修改 SDK 源码或本地验证：

```bash
npm ci
npm run build
```

产物写入根目录的 `dist/`。`npm test` 会重新构建并运行 SDK 测试；`npm pack --dry-run` 可检查待发布文件，打包和发布时 `prepack` 会自动构建。npm 包包含运行产物、类型声明、协议与接口路由文件、README 和许可证，不包含 `examples/`；示例需从源码仓库获取，部署步骤见[示例打包与部署](#示例打包与部署)。

## API 客户端

`@kesi/sdk-nodejs/api` 导出 `ApiClient`。接口路由目录随 npm 包发布，包含核心、算法、驱动、实时数据、数据源、流程和告警服务，不包含 operation 服务。

```ts
import ApiClient = require('@kesi/sdk-nodejs/api')

const client = new ApiClient({endpoint: 'http://192.168.99.103:31000', projectId: 'default',
  ak: process.env.production_api__ak, sk: process.env.production_api__sk})
async function main() {
  const variables = await client.querySystemVariable({limit: 20, withCount: true})
  console.log(variables.success, variables.status, variables.message, variables.data, variables.count)

  const warnings = await client.queryWarning({filter: {level: 'high'}, withCount: true})
  console.log(warnings.data, warnings.count)
}

main().catch(error => {
  console.error(error.result || error)
  process.exitCode = 1
})
```

HTTP 数据查询和操作方法默认返回 `{success, status, message, data, count, headers}`。`success` 表示 HTTP 状态是否为 2xx，不代表业务响应中的成功标记；`status` 是 HTTP 状态码。`message` 优先使用响应体的 `message`/`detail`；`data` 保留完整业务响应体；`count` 优先读取响应头 `count`，其次读取响应体的 `count`，都没有时为 `null`。

HTTP 非 2xx 响应会抛出 `ApiError`，其 `result` 提供相同结构且 `success=false`；网络、超时或配置错误不一定包含 `result`。`request()` 和 `call()` 可用 `{raw: true}` 或 `{response: false}` 取得原始响应体。Excel/PDF 下载快捷方法返回的 `data` 为 Buffer；自定义下载请求可设置 `responseType: 'buffer'`。

报警接口包括 `queryWarningRule`、`createWarningRule`、`queryWarning`、`updateWarningBatch`、`queryArchivedWarning`、`getWarningStats` 等；系统变量接口包括 `querySystemVariable`、`createSystemVariable`、`updateSystemVariable`、`exportSystemVariable` 和 Excel 导入/模板接口。其余已收录路径可用 `call(service, method, route, options)` 调用。`options.path` 提供路径参数，`options.query` 提供 URL 参数，`options.body` 提供 JSON 请求体。

`setProjectId()` 返回新客户端，不修改原客户端；切换项目时应保存返回值，例如 `const projectClient = client.setProjectId('project-id')`。使用 AppKey/AppSecret 时，客户端自动换取并缓存 Token，收到 401 后重新认证并重试一次；显式传入的 Token 不会自动重新换取。`request()` 可访问目录外接口，`connectWebSocket()` 用于实时订阅。更多用法见 [API 示例](./examples/api-client/index.ts)。

## FAQ

### 发布 TypeScript SDK 后，JavaScript 项目如何使用？

发布包已经包含 JavaScript 和类型声明，无需再次编译 SDK。CommonJS 项目使用 `require`，ES module 项目使用默认导入，示例见[安装](#安装)。请从模块概览列出的公开路径导入，不要依赖包内部的 `dist` 路径。

### `driverGrpc.host` 要填监听地址吗？

它是 SDK 主动连接的平台地址。只有 Service、开启 HTTP 的 Driver 等入站服务才需要配置自己的监听端口。

### 什么情况下需要授权动态库？

Driver 仅在配置了 `license` 或 `licenseLibrary` 时调用授权库。`licenseLibrary` 指定目标系统和架构对应的动态库路径；未指定时会搜索 `license_core_<系统>_<架构>` 库文件。此处是驱动运行授权，与 SDK 的 MIT 开源许可证不同。

## 环境要求

- Node.js `>=18`
- 从源码构建需安装项目的开发依赖；使用发布包不需要 TypeScript 编译器

SDK 使用 [MIT 许可证](./LICENSE)。

## 示例概览

| 模块 | 源码 | 运行命令 | 用途 |
| --- | --- | --- | --- |
| API | [api-client](./examples/api-client/index.ts) | `npm run dev:api` | 查询平台数据和调用开放接口 |
| Driver | [driver-mqtt](./examples/driver-mqtt/index.ts) | `npm run dev:driver` | MQTT 设备接入与数据点上报 |
| Algorithm | [algorithm](./examples/algorithm/algorithm.ts) | `npm run dev:algorithm` | 算法函数处理 |
| DataRelay | [data-relay](./examples/data-relay/index.ts) | `npm run dev:relay` | 中继启动与 HTTP 代理 |
| Flow | [flow](./examples/flow/flow.ts) | `npm run dev:flow` | 流程节点处理与调试 |
| FlowExtension | [flow-extension](./examples/flow-extension/flow_extension.ts) | `npm run dev:extension` | 可配置流程扩展 |
| Service | [service](./examples/service/index.ts) | `npm run dev:service` | Express HTTP 服务 |
| Task | [task](./examples/task/index.ts) | `npm run dev:task` | Cron 定时任务 |

## 示例安装与运行

先获取源码仓库，再进入 `examples/` 安装示例依赖。以 HTTP Service 为例：

```bash
cd examples
npm install
npm run dev:service
```

开发时 `npm run dev:*` 使用 `tsx` 直接运行 TypeScript，无需预先构建。Service 启动后可访问 `http://localhost:9000/health`，按 `Ctrl+C` 停止。其余示例的命令见[示例概览](#示例概览)，需要平台连接的模块应先配置服务地址。

部署前在 `examples/` 执行 `npm run build`，将示例编译到 `examples/dist/`，随后可用 `node dist/service/index.js` 启动。这个目录与 SDK 根目录的 `dist/` 分别属于两个项目。

若要验证尚未发布的 SDK 改动，先在仓库根目录执行 `npm ci` 和 `npm run build`，再在 `examples/` 执行 `npm install --no-save ..` 使用本地 SDK。示例的 `package.json` 仍声明发布版本依赖。

## 示例配置

各模块的默认配置在其 `config/index.ts` 或入口文件中。运行 Driver 前，除服务地址外，还需将 `project`、`serviceId` 和 `driver.id` 设置为目标项目及驱动实例的实际值。Driver、Algorithm、DataRelay、Flow 和 FlowExtension 中的 gRPC 地址是程序主动连接的平台地址。Service 的 `server.port` 是 HTTP 监听端口；Task 默认不监听端口。示例使用 `192.168.99.103` 作为开发地址，部署时请改为目标环境可访问的地址。

平台 `ExtraConfig.Env` 注入的环境变量会覆盖默认配置，常用键如下：

```text
production_project=default
production_serviceId=<驱动运行实例标识>
production_api__endpoint=http://192.168.99.103:31000
production_api__projectId=default
production_api__ak=<AppKey>
production_api__sk=<AppSecret>
production_mq__mqtt__host=192.168.99.103
production_driver-grpc__host=192.168.99.103
production_data-relay-grpc__host=192.168.99.103
```

真实密钥只通过环境变量或部署配置传入。API 客户端使用项目 AppKey/AppSecret；切换项目用 `const projectClient = client.setProjectId(projectId)`，调用完整路由用 `client.call(service, method, route, options)`。

## 示例模块开发

### Driver

修改 [MQTT 驱动](./examples/driver-mqtt/index.ts) 中的 `schema`、`start`、`run`、`writeTag` 和 `stop` 等方法。`driver.id`、驱动 Schema 的 `key`、安装包的 `Name` 应使用同一驱动标识。驱动收到设备消息后用 `app.writePoints(meta, point)` 上报数据；指令通过 MQTT 发布。更多消息格式见 [MQTT 驱动测试数据与脚本](#mqtt-驱动测试数据与脚本)。

### Algorithm、DataRelay、Flow、FlowExtension

Algorithm 实现 `schema`、`run`；DataRelay 实现 `start`、`httpProxy`；Flow 实现 `handler`、`debug`；FlowExtension 实现 `schema`、`run`。这些示例主动连接平台服务。需要本地调试时，先确认目标服务地址及端口可访问。

### Service、Task

Service 在 `start` 中通过 `app.getHttpServer()` 注册 Express 路由；示例监听 `9000` 端口，访问 `/health`。Task 通过 `app.getCron().scheduleJob()` 注册定时任务，并在 `stop` 中取消任务。

## 示例打包与部署

以下命令均在 `examples/` 执行。先运行 `npm run build`，原生包至少包含该目录的 `dist/`、`package.json`、已安装的生产依赖，以及平台要求的 `service.yml`；若应用使用外部配置、证书或授权库，也需随部署提供。生产依赖应在与目标系统和架构兼容的环境中安装。目标机器必须安装 Node.js。以 MQTT 驱动为例，Windows 原生包可参考 [win.yml](./examples/driver-mqtt/deployments/win.yml)，其命令为 `node dist/driver-mqtt/index.js`，`GroupName` 为 `driver`。

Linux 容器包可从 [Dockerfile](./examples/driver-mqtt/Dockerfile) 构建。镜像安装生产依赖并运行 `dist/driver-mqtt/index.js`；对应 [linux.yml](./examples/driver-mqtt/deployments/linux.yml) 使用 `Service: None`，因为该示例没有入站服务。若驱动开启 HTTP 或其他入站端口，应按平台要求改用 `Internal` 或 `External` 并设置 `Path`、`Ports`。这里的入站端口与程序主动连接平台的 `driverGrpc.host/port` 不同。

构建上下文必须是 `examples/`，而不是 `driver-mqtt/`：

```bash
npm run build
docker build -f driver-mqtt/Dockerfile -t kesi-driver-mqtt .
```

Driver 安装包先进入驱动仓库，再在项目中创建驱动实例。DataRelay 安装包进入数据中继仓库，再安装运行实例。其余模块按普通服务安装流程部署。Service 的 `server.port` 是入站端口，需要在平台安装配置中暴露；Task 无需入站端口。

## 示例常见问题

### `npm run build` 成功，但运行时报找不到 SDK？

TypeScript 构建不会把依赖打进 `dist`。部署时安装 `package.json` 中的生产依赖，或使用示例 Dockerfile。

### 环境变量没有生效？

确认变量在启动 Node.js 进程前设置。使用 `production_` 前缀时，通过双下划线表示层级，例如 `production_driver-grpc__host`；也可使用 `APP.API.ENDPOINT` 等点分隔形式，同一字段以 `production_` 形式优先。配置对象支持 `driverGrpc` 等 Go 风格键及旧的 `driver-grpc` 键。

## MQTT 驱动测试数据与脚本

### 测试数据

主题：`test/nodesdk/nodesdk1`。下面的解析脚本将第二段作为工作表标识（`nodesdk`），第三段作为设备编号（`nodesdk1`）；请确保它们与平台配置一致。

```json
[
  {
    "key": "p1",
    "value": 1
  },
  {
    "key": "p2",
    "value": 2
  }
]
```

### 解析脚本

```javascript
// 脚本返回值必须为对象数组
// id: 设备编号
// time: 时间戳(毫秒)
// fields: 数据点数据. 该字段为 JSON 对象, key 为数据点标识, value 为数据点的值
function handler(topic, message) {
  console.log("handler message", message)
  try {
    const points = JSON.parse(message.toString())
    const topics = topic.split("/")
    const fields = {}
    for (const point of points) {
      fields[point.key] = point.value
    }
    return [
      {table: topics[1], id: topics[2], time: Date.now(), fields}
    ]
  } catch (error) {
    console.error("handler error", error)
    return []
  }
}
```

### 指令脚本

设备端可订阅 `cmd/#` 接收指令。脚本返回实际发布主题（例如 `cmd/nodesdk/nodesdk1`）及消息内容。

```javascript
function handler(tableId, deviceId, command) {
  return {topic: "cmd/" + tableId + "/" + deviceId, payload: JSON.stringify(command.params)}
}
```
