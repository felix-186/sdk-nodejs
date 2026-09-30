# KESI Node.js SDK and Examples

English | [Chinese](./README.md)

The KESI Node.js SDK is used to develop platform extension services. It covers Driver, Algorithm, DataRelay, Flow, FlowExtension, Service, and Task modules. The source code is written in TypeScript, while the npm package provides ready-to-run JavaScript. This repository also contains TypeScript examples for every module.

## Table of Contents

- [Module Overview](#module-overview)
- [Install](#install)
- [Quick Start](#quick-start)
- [Core Interfaces](#core-interfaces)
- [Developing and Deploying Modules](#developing-and-deploying-modules)
- [Driver Configuration](#driver-configuration)
- [Example Directory](#example-directory)
- [Packaging and Deployment](#packaging-and-deployment)
- [API Client](#api-client)
- [FAQ](#faq)
- [Requirements](#requirements)
- [Example Overview](#example-overview)
- [Installing and Running Examples](#installing-and-running-examples)
- [Example Configuration](#example-configuration)
- [Developing Example Modules](#developing-example-modules)
- [Example Packaging and Deployment](#example-packaging-and-deployment)
- [Example FAQ](#example-faq)
- [MQTT Driver Test Data and Scripts](#mqtt-driver-test-data-and-scripts)

## Module Overview

| Module | Import path | Description |
| --- | --- | --- |
| Driver | `@kesi/sdk-nodejs/driver` | Device access, point reporting, and command execution |
| Algorithm | `@kesi/sdk-nodejs/algorithm` | Algorithm services |
| DataRelay | `@kesi/sdk-nodejs/data_relay` | Data relay and HTTP proxy |
| Flow | `@kesi/sdk-nodejs/flow` | Flow nodes |
| FlowExtension | `@kesi/sdk-nodejs/flow_extension` | Configurable flow extensions |
| Service | `@kesi/sdk-nodejs/service` | Express HTTP services |
| Task | `@kesi/sdk-nodejs/task` | Scheduled tasks |
| API | `@kesi/sdk-nodejs/api` | Client for platform open APIs |

## Install

```bash
npm install @kesi/sdk-nodejs
```

TypeScript projects can import directly from the paths above. JavaScript projects can use `require('@kesi/sdk-nodejs/driver')`. In the source repository, run `npm ci && npm run build` to generate `dist`. Consumers who install the published package do not need to compile the SDK.

## Quick Start

```ts
import {App, Driver} from '@kesi/sdk-nodejs/driver'

class MyDriver extends Driver {
  schema(app, meta, locale, callback) { callback(null, '{}') }
  start(app, meta, config, callback) { callback() }
  stop(app, meta, callback) { callback() }
}

new App({driver: {id: 'my-driver', name: 'My Driver'}}).start(new MyDriver())
```

See [Example Overview](#example-overview) for complete MQTT driver, algorithm, data relay, flow, flow extension, HTTP service, scheduled task, and API examples. Install the dependencies before running an example, and set the platform addresses for your target environment.

## Core Interfaces

Extension classes use callback-style interfaces. The first callback argument is an error, and `meta` provides logger and instance information for the current request. The main methods are listed below. For parameters and runnable implementations, see the `examples/` directory.

| Module | Methods to implement | Capabilities provided by `App` |
| --- | --- | --- |
| Driver | `schema`, `start`, `registerRoutes`, `run`, `batchRun`, `writeTag`, `debug`, `httpProxy`, `configUpdate`, `stop` | `writePoints`, `savePoints`, device configuration, MQ, and the API client |
| Algorithm | `schema`, `start`, `run`, `stop` | Algorithm gRPC request handling |
| DataRelay | `start`, `httpProxy` | `getMQ()`, `getAPIClient()` |
| Flow | `handler`, `debug` | Flow-engine request handling |
| FlowExtension | `schema`, `run` | Configurable extension nodes |
| Service | `start`, `stop` | `getHttpServer()` returns an Express application |
| Task | `start`, `stop` | `getCron()` returns a scheduler |

`new App(config)` accepts a configuration object. `await App.fromConfig('./etc')` reads `config.yaml` and also accepts JSON files; its second argument overrides configuration values. When `etcdConfig` is enabled, configuration is read from etcd first, followed by file configuration. Encrypted fields use `KESI_CIPHER_KEY`; `CONFIG_CIPHER_KEY` is also accepted.

## Developing and Deploying Modules

| Module | Example entry | Main configuration | Connection mode |
| --- | --- | --- | --- |
| Driver | [driver-mqtt](./examples/driver-mqtt/index.ts) | `driver.id/name`, `driverGrpc.host/port`, `mq` | Actively connects to the platform driver gRPC service |
| Algorithm | [algorithm](./examples/algorithm/algorithm.ts) | `algorithm.id/name`, `algorithmGrpc.host/port` | Actively connects to the platform algorithm gRPC service |
| DataRelay | [data-relay](./examples/data-relay/index.ts) | `service.id/name`, `dataRelayGrpc.host/port` | Actively connects to the platform data-relay gRPC service |
| Flow | [flow](./examples/flow/flow.ts) | `flow.name/mode`, `flowEngine.host/port` | Actively connects to the flow engine |
| FlowExtension | [flow-extension](./examples/flow-extension/flow_extension.ts) | `extension.id/name`, `flowEngine.host/port` | Actively connects to the flow engine |
| Service | [service](./examples/service/index.ts) | `server.port` | Listens on an HTTP port |
| Task | [task](./examples/task/index.ts) | Configure as required by the task | No inbound port by default |

The gRPC `host/port` values in this table are platform addresses that the program actively connects to; they are not inbound ports to expose. When deploying to a container, use platform service addresses reachable from that container. After uploading a Driver or DataRelay package, also create a running instance for the target project. Deploy Service, Task, and other ordinary services through the platform service installation workflow.

## Driver Configuration

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

The runtime can override file configuration through environment variables following the platform `ExtraConfig.Env` convention, for example `production_api__endpoint`, `production_api__projectId`, `production_api__ak`, `production_api__sk`, `production_mq__mqtt__host`, and `production_driver-grpc__host`. The `production_` form takes precedence; dot-separated keys such as `APP.API.*` are also supported. `log.level` accepts the Go SDK's numeric levels 0-5, and durations such as `driverGrpc.waitTime` can be written as `5s` or `1m30s`. Use `mq.type: local` when no message service is available locally.

## Example Directory

All examples are in the `examples/` directory. See [Example Overview](#example-overview) for entry points, run commands, and purposes. The SDK npm package publishes only runtime libraries, type declarations, and the API route catalog.

## Packaging and Deployment

Developers run `npm run build` in the `examples` directory to compile TypeScript into `dist/`. A native deployment must include `dist/`, `package.json`, and production dependencies, and Node.js must be installed on the target machine. A typical start command is `node dist/driver-mqtt/index.js`. For Docker deployment, see the [driver Dockerfile](./examples/driver-mqtt/Dockerfile). The `Command` in the platform `service.yml` must point to the actual start command; container packages use the image entry point. Use `Service: None` when a package only actively connects to platform services. If it provides an inbound HTTP interface, configure `Path` and `Ports` according to platform requirements.

The SDK itself is built and verified with `npm test`; `npm pack --dry-run` checks the files to publish, while `prepack` builds automatically during packaging. When `dataFile.enable` is enabled, driver configuration is loaded from a local JSON file and watched for changes. Enabling `http.enable` provides driver-management APIs and `/driver/ws`. When `license` or `licenseLibrary` is configured, the corresponding platform-specific `license_core` native library is loaded and verified before startup.

## API Client

`@kesi/sdk-nodejs/api` exports `ApiClient`. Its route catalog is published with the npm package and includes core, algorithm, driver, real-time data, data source, flow, and warning services. It does not include the operation service.

```ts
import ApiClient = require('@kesi/sdk-nodejs/api')

const client = new ApiClient({endpoint: 'http://192.168.99.103:31000', projectId: 'default',
  ak: process.env.production_api__ak, sk: process.env.production_api__sk})
const variables = await client.querySystemVariable({limit: 20, withCount: true})
console.log(variables.success, variables.status, variables.message, variables.data, variables.count)

const warnings = await client.queryWarning({filter: {level: 'high'}, withCount: true})
console.log(warnings.data, warnings.count)
```

All HTTP convenience methods return `{success, status, message, data, count, headers}` by default. `success` is determined by an HTTP 2xx status, and `status` is the HTTP status code. `message` prefers the `message`/`detail` field in the response body, `data` retains the complete business response body, and `count` prefers the `count` response header, then the `count` field in the response body; it is `null` when neither exists. On failure, an `ApiError` is thrown; its `result` has the same structure with `success=false`. `request()` and `call()` accept `{raw: true}` or `{response: false}` to obtain the original response body. For Excel/PDF downloads, `data` is a Buffer.

Warning APIs include `queryWarningRule`, `createWarningRule`, `queryWarning`, `updateWarningBatch`, `queryArchivedWarning`, and `getWarningStats`. System-variable APIs include `querySystemVariable`, `createSystemVariable`, `updateSystemVariable`, `exportSystemVariable`, and Excel import/template APIs. Other cataloged routes can be called with `call(service, method, route, options)`. Use `options.path` for path parameters, `options.query` for URL parameters, and `options.body` for a JSON request body. Use `setProjectId()` to switch projects. The client obtains and caches a token automatically and re-authenticates once after a 401 response. `request()` can access APIs outside the catalog, and `connectWebSocket()` supports real-time subscriptions. See the [API example](./examples/api-client/index.ts) for more usage.

## FAQ

### How do JavaScript projects use the published TypeScript SDK?

The published package contains JavaScript files and type declarations under `dist`. JavaScript projects can use `require('@kesi/sdk-nodejs/api')` directly; TypeScript projects import the same path.

### Should `driverGrpc.host` be a listen address?

No. It is the platform address actively connected to by the SDK. Only inbound services such as Service or a Driver with HTTP enabled need to configure their own listen port.

### When is the license native library required?

The Node.js SDK calls the license library only when `license` or `licenseLibrary` is configured. `licenseLibrary` can specify the path to the dynamic library for the target system.

## Requirements

- Node.js `>=18`
- Building from source requires the project development dependencies; consumers of the published package do not need a TypeScript compiler

The SDK uses the ISC license; see `@kesi/sdk-nodejs` in `package.json`.

## Example Overview

| Module | Source | Run command | Description |
| --- | --- | --- | --- |
| API | [api-client](./examples/api-client/index.ts) | `npm run dev:api` | Queries platform data and calls open APIs |
| Driver | [driver-mqtt](./examples/driver-mqtt/index.ts) | `npm run dev:driver` | MQTT device access and point reporting |
| Algorithm | [algorithm](./examples/algorithm/algorithm.ts) | `npm run dev:algorithm` | Algorithm function processing |
| DataRelay | [data-relay](./examples/data-relay/index.ts) | `npm run dev:relay` | Relay startup and HTTP proxy |
| Flow | [flow](./examples/flow/flow.ts) | `npm run dev:flow` | Flow-node processing and debugging |
| FlowExtension | [flow-extension](./examples/flow-extension/flow_extension.ts) | `npm run dev:extension` | Configurable flow extension |
| Service | [service](./examples/service/index.ts) | `npm run dev:service` | Express HTTP service |
| Task | [task](./examples/task/index.ts) | `npm run dev:task` | Cron scheduled task |

## Installing and Running Examples

Node.js 18 or newer is required. After installing the published package, run an example as follows:

```bash
cd examples
npm install
npm run build
npm run dev:service
```

`npm run build` compiles every example into `dist/`. A deployment environment needs only the JavaScript output and production dependencies, for example `node dist/service/index.js`. During development, `npm run dev:*` runs TypeScript directly with `tsx`.

If `@kesi/sdk-nodejs` has not yet been published, run `npm install --no-save ..` in the `examples` directory to use the local SDK from the parent directory. Build the SDK first by running `npm run build` in the repository root. This is intended only for local verification; `package.json` still depends on the published version.

## Example Configuration

Each module's default configuration is in its `config/index.ts` or entry file. For Driver, Algorithm, DataRelay, Flow, and FlowExtension, gRPC addresses are platform addresses actively connected to by the program. For Service, `server.port` is the HTTP listen port; Task does not listen on a port by default. The examples use `192.168.99.103` as a development address. Replace it with an address reachable from your target deployment environment.

Environment variables injected by the platform `ExtraConfig` override default configuration. Common keys are:

```text
production_api__endpoint=http://192.168.99.103:31000
production_api__projectId=default
production_api__ak=<AppKey>
production_api__sk=<AppSecret>
production_mq__mqtt__host=192.168.99.103
production_driver-grpc__host=192.168.99.103
production_data-relay-grpc__host=192.168.99.103
```

Pass real secrets only through environment variables or deployment configuration. The API client uses a project AppKey/AppSecret. Use `client.setProjectId(projectId)` to switch projects and `client.call(service, method, route, options)` to call a full route.

## Developing Example Modules

### Driver

Modify methods such as `schema`, `start`, `run`, `writeTag`, and `stop` in the [MQTT driver](./examples/driver-mqtt/index.ts). Use the same driver identifier for `driver.id`, the driver schema's `key`, and the package's `Name`. After receiving a device message, the driver reports data with `app.writePoints(meta, point)`; commands are published over MQTT. For message formats, see [MQTT Driver Test Data and Scripts](#mqtt-driver-test-data-and-scripts).

### Algorithm, DataRelay, Flow, FlowExtension

Algorithm implements `schema` and `run`; DataRelay implements `start` and `httpProxy`; Flow implements `handler` and `debug`; FlowExtension implements `schema` and `run`. These examples actively connect to platform services. When debugging locally, first confirm that the target service address and port are reachable.

### Service and Task

Service registers Express routes through `app.getHttpServer()` in `start`; the example listens on port `9000` and exposes `/health`. Task registers scheduled jobs with `app.getCron().scheduleJob()` and cancels them in `stop`.

## Example Packaging and Deployment

Run `npm run build` first. A native package must contain at least `dist/`, `package.json`, installed production dependencies, and the platform-required `service.yml`. The target machine must have Node.js installed. For the MQTT driver, see the Windows native-package example [win.yml](./examples/driver-mqtt/deployments/win.yml), whose command is `node dist/driver-mqtt/index.js` and whose `GroupName` is `driver`.

A Linux container package can be built from [Dockerfile](./examples/driver-mqtt/Dockerfile). The image installs production dependencies and runs `dist/driver-mqtt/index.js`; the corresponding [linux.yml](./examples/driver-mqtt/deployments/linux.yml) uses `Service: None` because this example has no inbound service. If the driver enables HTTP or another inbound port, change this to `Internal` or `External` as required by the platform and set `Path` and `Ports`. This inbound port is different from `driverGrpc.host/port`, which the program uses to connect to the platform.

A Driver package is first uploaded to the driver repository, then a driver instance is created in the project. A DataRelay package is uploaded to the data-relay repository, then a running instance is installed. Other modules follow the ordinary service installation workflow. Service's `server.port` is an inbound port and must be exposed in the platform installation configuration; Task needs no inbound port.

## Example FAQ

### `npm run build` succeeds, but the SDK cannot be found at runtime. Why?

TypeScript compilation does not bundle dependencies into `dist`. Install the production dependencies from `package.json` during deployment, or use the example Dockerfile.

### Why are environment variables not taking effect?

Check that variable names use the `production_` prefix and double-underscore separators, and that they are set before the Node.js process starts. The SDK supports Go-style keys such as `driverGrpc` as well as the older `driver-grpc` keys.

## MQTT Driver Test Data and Scripts

### Test data

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

### Parsing script

```javascript
// The script must return an array of objects.
// id: device ID
// time: timestamp in milliseconds
// fields: point data. This field is a JSON object whose keys are point IDs and values are point values.
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

### Command script

topic: cmd/#

```javascript
function handler(tableId, deviceId, command) {
    return {"topic": "cmd/" + tableId + "/" + deviceId, "payload": JSON.stringify(command.params)}
  }
```
