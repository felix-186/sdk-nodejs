# KESI Node.js SDK 与示例

[English](./README_en.md) | 简体中文

KESI SDK Node.js 用于开发平台扩展服务，覆盖 Driver、Algorithm、DataRelay、Flow、FlowExtension、Service 和 Task。源码使用 TypeScript，npm 包提供可直接运行的 JavaScript。本仓库同时提供各模块的 TypeScript 示例。

## 目录

- [模块概览](#模块概览)
- [安装](#安装)
- [快速开始](#快速开始)
- [核心接口](#核心接口)
- [各模块开发与部署](#各模块开发与部署)
- [Driver 配置](#driver-配置)
- [示例目录](#示例目录)
- [打包与部署](#打包与部署)
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

TypeScript 项目可直接从上述路径导入；JavaScript 项目可使用 `require('@kesi/sdk-nodejs/driver')`。源码仓库执行 `npm ci && npm run build` 后生成 `dist`。安装发布包的使用方无需编译 SDK。

## 快速开始

```ts
import {App, Driver} from '@kesi/sdk-nodejs/driver'

class MyDriver extends Driver {
  schema(app, meta, locale, callback) { callback(null, '{}') }
  start(app, meta, config, callback) { callback() }
  stop(app, meta, callback) { callback() }
}

new App({driver: {id: 'my-driver', name: 'My Driver'}}).start(new MyDriver())
```

完整的 MQTT 驱动、算法、数据中继、流程、流程扩展、HTTP 服务、定时任务和 API 示例见下文[示例概览](#示例概览)。运行示例前请安装依赖，并按目标环境设置平台地址。

## 核心接口

扩展类使用回调接口，首个回调参数为错误；`meta` 提供当前请求的日志和实例信息。下表列出主要方法，参数和可运行实现见 `examples/` 目录。

| 模块 | 实现方法 | 应用提供的能力 |
| --- | --- | --- |
| Driver | `schema`、`start`、`registerRoutes`、`run`、`batchRun`、`writeTag`、`debug`、`httpProxy`、`configUpdate`、`stop` | `writePoints`、`savePoints`、设备配置、MQ 和 API 客户端 |
| Algorithm | `schema`、`start`、`run`、`stop` | 算法 gRPC 请求处理 |
| DataRelay | `start`、`httpProxy` | `getMQ()`、`getAPIClient()` |
| Flow | `handler`、`debug` | 流程引擎请求处理 |
| FlowExtension | `schema`、`run` | 可配置扩展节点 |
| Service | `start`、`stop` | `getHttpServer()` 返回 Express 应用 |
| Task | `start`、`stop` | `getCron()` 返回调度器 |

`new App(config)` 接受配置对象。`await App.fromConfig('./etc')` 可读取 `config.yaml`，也接受 JSON 文件；第二个参数可覆盖配置。启用 `etcdConfig` 时会先读取 etcd，再应用文件配置。加密字段使用 `KESI_CIPHER_KEY`，也接受 `CONFIG_CIPHER_KEY`。

## 各模块开发与部署

| 模块 | 示例入口 | 主要配置 | 连接方式 |
| --- | --- | --- | --- |
| Driver | [driver-mqtt](./examples/driver-mqtt/index.ts) | `driver.id/name`、`driverGrpc.host/port`、`mq` | 主动连接平台驱动 gRPC 服务 |
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

运行环境可用平台 `ExtraConfig.Env` 约定的环境变量覆盖文件配置，例如 `production_api__endpoint`、`production_api__projectId`、`production_api__ak`、`production_api__sk`、`production_mq__mqtt__host`、`production_driver-grpc__host`。`production_` 形式优先；也支持 `APP.API.*` 等点分隔键。`log.level` 可用 Go SDK 的 0–5 数值级别，`driverGrpc.waitTime` 等时长可写为 `5s`、`1m30s`。本地无消息服务时可使用 `mq.type: local`。

## 示例目录

所有示例均在 `examples/` 目录；入口、运行命令和用途见[示例概览](#示例概览)。SDK npm 包只发布运行库、类型声明和接口路由目录。

## 打包与部署

开发者在 `examples` 目录运行 `npm run build`，将 TypeScript 编译到 `dist/`。原生部署需携带 `dist/`、`package.json` 和生产依赖，并在目标机器安装 Node.js；启动命令示例为 `node dist/driver-mqtt/index.js`。Docker 部署可参考 [驱动 Dockerfile](./examples/driver-mqtt/Dockerfile)。平台 `service.yml` 的 `Command` 应指向实际启动命令；容器包使用镜像入口。仅提供主动连接的平台服务时使用 `Service: None`；提供 HTTP 入站接口时按平台要求配置 `Path` 和 `Ports`。

SDK 自身使用 `npm test` 构建并验证，`npm pack --dry-run` 可检查发布文件；`prepack` 会在打包时自动构建。`dataFile.enable` 可从本地 JSON 文件加载并监听驱动配置；启用 `http.enable` 可提供驱动管理接口和 `/driver/ws`。设置 `license` 或 `licenseLibrary` 时，启动前会加载对应系统的 `license_core` 原生库进行校验。

## API 客户端

`@kesi/sdk-nodejs/api` 导出 `ApiClient`。接口路由目录随 npm 包发布，包含核心、算法、驱动、实时数据、数据源、流程和告警服务，不包含 operation 服务。

```ts
import ApiClient = require('@kesi/sdk-nodejs/api')

const client = new ApiClient({endpoint: 'http://192.168.99.103:31000', projectId: 'default',
  ak: process.env.production_api__ak, sk: process.env.production_api__sk})
const variables = await client.querySystemVariable({limit: 20, withCount: true})
console.log(variables.success, variables.status, variables.message, variables.data, variables.count)

const warnings = await client.queryWarning({filter: {level: 'high'}, withCount: true})
console.log(warnings.data, warnings.count)
```

所有 HTTP 快捷方法默认返回 `{success, status, message, data, count, headers}`。`success` 由 HTTP 2xx 状态决定，`status` 是 HTTP 状态码；`message` 优先使用响应体的 `message`/`detail`，`data` 保留完整业务响应体，`count` 优先读取响应头 `count`，其次读取响应体的 `count`，都没有时为 `null`。失败时抛出 `ApiError`，其 `result` 提供相同结构且 `success=false`。`request()` 和 `call()` 可用 `{raw: true}` 或 `{response: false}` 取得原始响应体。Excel/PDF 下载的 `data` 为 Buffer。

报警接口包括 `queryWarningRule`、`createWarningRule`、`queryWarning`、`updateWarningBatch`、`queryArchivedWarning`、`getWarningStats` 等；系统变量接口包括 `querySystemVariable`、`createSystemVariable`、`updateSystemVariable`、`exportSystemVariable` 和 Excel 导入/模板接口。其余已收录路径可用 `call(service, method, route, options)` 调用。`options.path` 提供路径参数，`options.query` 提供 URL 参数，`options.body` 提供 JSON 请求体。项目切换使用 `setProjectId()`；客户端自动换取并缓存 Token，401 后重新认证一次。`request()` 可访问目录外接口，`connectWebSocket()` 用于实时订阅。更多用法见 [API 示例](./examples/api-client/index.ts)。

## FAQ

### 发布 TypeScript SDK 后，JavaScript 项目如何使用？

发布包包含 `dist` 下的 JavaScript 和类型声明。JavaScript 项目直接 `require('@kesi/sdk-nodejs/api')`；TypeScript 项目可导入同一路径。

### `driverGrpc.host` 要填监听地址吗？

它是 SDK 主动连接的平台地址。只有 Service、开启 HTTP 的 Driver 等入站服务才需要配置自己的监听端口。

### 什么情况下需要授权动态库？

Node.js SDK 仅在配置了 `license` 或 `licenseLibrary` 时调用授权库。`licenseLibrary` 可指定对应系统的动态库路径。

## 环境要求

- Node.js `>=18`
- 从源码构建需安装项目的开发依赖；使用发布包不需要 TypeScript 编译器

SDK 使用 ISC 许可证，参见 `@kesi/sdk-nodejs` 的 `package.json`。

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

需要 Node.js 18 或更新版本。安装发布包后直接运行示例：

```bash
cd examples
npm install
npm run build
npm run dev:service
```

`npm run build` 把所有示例编译到 `dist/`；部署环境只需 JavaScript 产物和生产依赖。例如 `node dist/service/index.js`。开发时 `npm run dev:*` 使用 `tsx` 直接运行 TypeScript。

如果 `@kesi/sdk-nodejs` 尚未发布，可在 `examples` 目录执行 `npm install --no-save ..` 使用上级目录的本地 SDK。SDK 需先在仓库根目录执行 `npm run build`。这仅用于本地验证；`package.json` 仍依赖发布版本。

## 示例配置

各模块的默认配置在其 `config/index.ts` 或入口文件中。Driver、Algorithm、DataRelay、Flow 和 FlowExtension 中的 gRPC 地址是程序主动连接的平台地址。Service 的 `server.port` 是 HTTP 监听端口；Task 默认不监听端口。示例使用 `192.168.99.103` 作为开发地址，部署时请改为目标环境可访问的地址。

平台 `ExtraConfig.Env` 注入的环境变量会覆盖默认配置，常用键如下：

```text
production_api__endpoint=http://192.168.99.103:31000
production_api__projectId=default
production_api__ak=<AppKey>
production_api__sk=<AppSecret>
production_mq__mqtt__host=192.168.99.103
production_driver-grpc__host=192.168.99.103
production_data-relay-grpc__host=192.168.99.103
```

真实密钥只通过环境变量或部署配置传入。API 客户端使用项目 AppKey/AppSecret；切换项目用 `client.setProjectId(projectId)`，调用完整路由用 `client.call(service, method, route, options)`。

## 示例模块开发

### Driver

修改 [MQTT 驱动](./examples/driver-mqtt/index.ts) 中的 `schema`、`start`、`run`、`writeTag` 和 `stop` 等方法。`driver.id`、驱动 Schema 的 `key`、安装包的 `Name` 应使用同一驱动标识。驱动收到设备消息后用 `app.writePoints(meta, point)` 上报数据；指令通过 MQTT 发布。更多消息格式见 [MQTT 驱动测试数据与脚本](#mqtt-驱动测试数据与脚本)。

### Algorithm、DataRelay、Flow、FlowExtension

Algorithm 实现 `schema`、`run`；DataRelay 实现 `start`、`httpProxy`；Flow 实现 `handler`、`debug`；FlowExtension 实现 `schema`、`run`。这些示例主动连接平台服务。需要本地调试时，先确认目标服务地址及端口可访问。

### Service、Task

Service 在 `start` 中通过 `app.getHttpServer()` 注册 Express 路由；示例监听 `9000` 端口，访问 `/health`。Task 通过 `app.getCron().scheduleJob()` 注册定时任务，并在 `stop` 中取消任务。

## 示例打包与部署

先运行 `npm run build`。原生包至少包含 `dist/`、`package.json`、已安装的生产依赖，以及平台要求的 `service.yml`。目标机器必须安装 Node.js。以 MQTT 驱动为例，Windows 原生包可参考 [win.yml](./examples/driver-mqtt/deployments/win.yml)，其命令为 `node dist/driver-mqtt/index.js`，`GroupName` 为 `driver`。

Linux 容器包可从 [Dockerfile](./examples/driver-mqtt/Dockerfile) 构建。镜像安装生产依赖并运行 `dist/driver-mqtt/index.js`；对应 [linux.yml](./examples/driver-mqtt/deployments/linux.yml) 使用 `Service: None`，因为该示例没有入站服务。若驱动开启 HTTP 或其他入站端口，应按平台要求改用 `Internal` 或 `External` 并设置 `Path`、`Ports`。这里的入站端口与程序主动连接平台的 `driverGrpc.host/port` 不同。

Driver 安装包先进入驱动仓库，再在项目中创建驱动实例。DataRelay 安装包进入数据中继仓库，再安装运行实例。其余模块按普通服务安装流程部署。Service 的 `server.port` 是入站端口，需要在平台安装配置中暴露；Task 无需入站端口。

## 示例常见问题

### `npm run build` 成功，但运行时报找不到 SDK？

TypeScript 构建不会把依赖打进 `dist`。部署时安装 `package.json` 中的生产依赖，或使用示例 Dockerfile。

### 环境变量没有生效？

确认变量名使用 `production_` 前缀和双下划线分隔，且在启动 Node.js 进程前设置。SDK 支持 `driverGrpc` 等 Go 风格键及旧的 `driver-grpc` 键。

## MQTT 驱动测试数据与脚本

### 测试数据

topic: test/nodesdk/nodesdk1

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
    let arr = JSON.parse(message.toString())
    console.log("handler arr", arr)
    let topics = topic.split("/");
    let field = {}
    arr.forEach(ele => {
      field[ele.key] = ele.value
    })
    return [
      {"table": topics[1], "id": topics[2], "time": new Date().getTime(), "fields": field}
    ]
  } catch (e) {
    console.error("handler error", e)
    return []
  }
}
```

### 指令脚本

topic: cmd/#

```javascript
function handler(tableId, deviceId, command) {
    return {"topic": "cmd/" + tableId + "/" + deviceId, "payload": JSON.stringify(command.params)}
  }
```
