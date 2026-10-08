# KESI Node.js SDK and Examples

English | [Chinese](./README.md)

The KESI Node.js SDK is used to develop platform extension services. It covers Driver, Algorithm, DataRelay, Flow, FlowExtension, Service, and Task modules and provides a platform API client. The source is written in TypeScript; the npm package includes compiled JavaScript and type declarations. This repository also contains TypeScript examples for every module.

Source: [felix-186/sdk-nodejs](https://github.com/felix-186/sdk-nodejs) · npm package: [@kesi/sdk-nodejs](https://www.npmjs.com/package/@kesi/sdk-nodejs)

## Table of Contents

- [Module Overview](#module-overview)
- [Install](#install)
- [Quick Start](#quick-start)
- [Core Interfaces](#core-interfaces)
- [Developing and Deploying Modules](#developing-and-deploying-modules)
- [Driver Configuration](#driver-configuration)
- [Building the SDK from Source](#building-the-sdk-from-source)
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

The published package does not need to be compiled after installation. TypeScript projects use the same import paths and receive type information from the included declarations. Your own TypeScript application still follows its normal build process.

Use a TypeScript module resolution mode that supports `exports` in `package.json`, such as `node16`, `nodenext`, or `bundler`. The repository examples use `module: "Node16"` and `moduleResolution: "Node16"`.

CommonJS projects use `require`:

```js
const {App, Driver} = require('@kesi/sdk-nodejs/driver')
```

JavaScript ES module projects use a default import and destructure it, because the SDK runtime is CommonJS:

```js
import driverSDK from '@kesi/sdk-nodejs/driver'

const {App, Driver} = driverSDK
```

Choose the import path for the module you need. The root path `@kesi/sdk-nodejs` exports the API client, rather than a collection of all modules.

## Quick Start

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

This is a minimal driver skeleton; it does not implement device communication or point reporting. Before running it, replace the gRPC and MQTT addresses with reachable platform service addresses. The platform supplies driver instance configuration; replace `schema` with your actual driver schema. See [Example Overview](#example-overview) for complete implementations. To verify installation first, run the Service example, which does not require a platform connection.

When connecting to the platform, set `project` to the target project ID, `serviceId` to the corresponding driver runtime instance ID in that project, and `driver.id` to the driver ID. Replace the example values above with your actual configuration. The SDK generates a random identifier when `serviceId` is omitted, but that cannot replace an existing platform instance ID.

## Core Interfaces

Request handlers in Driver, Algorithm, DataRelay, Flow, and FlowExtension use callbacks whose first argument is an error. `meta` provides request context. Service and Task use `start(app)` and `stop(app)` without callbacks; Driver's `registerRoutes(router)` also has no callback. Implement the methods you need from the table below. See `examples/` for parameters and complete implementations.

| Module | Methods to implement | Capabilities provided by `App` |
| --- | --- | --- |
| Driver | `schema`, `start`, `registerRoutes`, `run`, `batchRun`, `writeTag`, `debug`, `httpProxy`, `configUpdate`, `stop` | `writePoints`, `savePoints`, device configuration, MQ, and the API client |
| Algorithm | `schema`, `start`, `run`, `stop` | Algorithm gRPC request handling |
| DataRelay | `start`, `httpProxy` | `getMQ()`, `getAPIClient()` |
| Flow | `handler`, `debug`, `stop` | Flow-engine request handling |
| FlowExtension | `schema`, `run`, `stop` | Configurable extension nodes |
| Service | `start`, `stop` | `getHttpServer()` returns an Express application |
| Task | `start`, `stop` | `getCron()` returns a scheduler |

Each module's `new App(config)` accepts a configuration object. `App.fromConfig('./etc')` returns a Promise and reads `config.yaml` from that directory; it also accepts a YAML or JSON file path. The second argument overrides configuration values. Precedence from lowest to highest is: etcd configuration (when `etcdConfig` is set), file configuration, the second argument, then environment variables. Missing fields use module defaults. Use `await` inside an async function to obtain the App instance.

Encrypted configuration fields use `KESI_CIPHER_KEY`, falling back to `CONFIG_CIPHER_KEY` when it is not set.

## Developing and Deploying Modules

| Module | Example entry | Main configuration | Connection mode |
| --- | --- | --- | --- |
| Driver | [driver-mqtt](./examples/driver-mqtt/index.ts) | `project`, `serviceId`, `driver.id/name`, `driverGrpc.host/port`, `mq` | Actively connects to the platform driver gRPC service |
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

`project`, `serviceId`, and `driver.id` must correspond to the target platform driver instance. The runtime can override file configuration through environment variables following the platform `ExtraConfig.Env` convention, for example `production_project`, `production_serviceId`, `production_api__endpoint`, `production_api__projectId`, `production_api__ak`, `production_api__sk`, `production_mq__mqtt__host`, and `production_driver-grpc__host`. The `production_` form takes precedence; dot-separated keys such as `APP.API.*` are also supported. `log.level` accepts the Go SDK's numeric levels 0-5, and durations such as `driverGrpc.waitTime` can be written as `5s` or `1m30s`. Use `mq.type: local` when no message service is available locally.

`mq.type: local` replaces only the SDK message channel; it does not disable gRPC or the MQTT driver example's own device connection. To debug a Driver without the platform, set `driverGrpc.enable: false` and use `dataFile.enable: true` with `dataFile.path` to load local JSON instance configuration. The SDK watches that file for changes. Enabling `http.enable` provides driver-management APIs and `/driver/ws`.

## Building the SDK from Source

Run these commands in the repository root when modifying the SDK or verifying local changes:

```bash
npm ci
npm run build
```

Output is written to the root `dist/` directory. `npm test` rebuilds and runs SDK tests. `npm pack --dry-run` checks the files to publish; `prepack` builds automatically during packaging and publishing. The npm package includes runtime output, type declarations, protocol and API route files, READMEs, and the license, but not `examples/`. Obtain examples from the source repository and see [Example Packaging and Deployment](#example-packaging-and-deployment).

## API Client

`@kesi/sdk-nodejs/api` exports `ApiClient`. Its route catalog is published with the npm package and includes core, algorithm, driver, real-time data, data source, flow, and warning services. It does not include the operation service.

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

HTTP data query and operation methods return `{success, status, message, data, count, headers}` by default. `success` indicates an HTTP 2xx status, not a business-level success flag in the response body. `status` is the HTTP status code. `message` prefers the response body's `message`/`detail`. `data` retains the complete business response body. `count` prefers the `count` response header, then the response body's `count`; it is `null` when neither exists.

HTTP non-2xx responses throw `ApiError`, whose `result` has the same structure with `success=false`. Network, timeout, and configuration errors may not contain `result`. `request()` and `call()` accept `{raw: true}` or `{response: false}` to obtain the original response body. Excel/PDF download helpers return a Buffer in `data`; set `responseType: 'buffer'` for custom download requests.

Warning APIs include `queryWarningRule`, `createWarningRule`, `queryWarning`, `updateWarningBatch`, `queryArchivedWarning`, and `getWarningStats`. System-variable APIs include `querySystemVariable`, `createSystemVariable`, `updateSystemVariable`, `exportSystemVariable`, and Excel import/template APIs. Call other cataloged routes with `call(service, method, route, options)`. Use `options.path` for path parameters, `options.query` for URL parameters, and `options.body` for a JSON request body.

`setProjectId()` returns a new client without changing the original. Retain its return value, for example `const projectClient = client.setProjectId('project-id')`. With AppKey/AppSecret authentication, the client obtains and caches a token and re-authenticates and retries once after a 401 response. Explicitly supplied tokens are not automatically renewed. `request()` accesses APIs outside the catalog, and `connectWebSocket()` supports real-time subscriptions. See the [API example](./examples/api-client/index.ts) for more usage.

## FAQ

### How do JavaScript projects use the published TypeScript SDK?

The published package includes JavaScript and type declarations and does not need to be compiled again. CommonJS projects use `require`; ES module projects use a default import. See [Install](#install) for examples. Use the public paths in Module Overview rather than internal `dist` paths.

### Should `driverGrpc.host` be a listen address?

No. It is the platform address actively connected to by the SDK. Only inbound services such as Service or a Driver with HTTP enabled need to configure their own listen port.

### When is the license native library required?

Driver calls the license library only when `license` or `licenseLibrary` is configured. `licenseLibrary` specifies the dynamic library for the target system and architecture; otherwise, the SDK searches for a `license_core_<system>_<architecture>` library file. Driver runtime licensing is separate from the SDK's MIT open-source license.

## Requirements

- Node.js `>=18`
- Building from source requires the project development dependencies; consumers of the published package do not need a TypeScript compiler

The SDK uses the [MIT license](./LICENSE).

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

Obtain the source repository, then install example dependencies in `examples/`. To run the HTTP Service example:

```bash
cd examples
npm install
npm run dev:service
```

During development, `npm run dev:*` runs TypeScript directly with `tsx`; no build is required first. Visit `http://localhost:9000/health` after Service starts, and press `Ctrl+C` to stop it. See [Example Overview](#example-overview) for other commands; configure service addresses before running modules that require platform connections.

Before deployment, run `npm run build` in `examples/` to compile examples into `examples/dist/`, then start a compiled example with `node dist/service/index.js`. This directory and the root SDK `dist/` belong to separate projects.

To verify unpublished SDK changes, first run `npm ci` and `npm run build` in the repository root. Then run `npm install --no-save ..` in `examples/` to use the local SDK. The examples' `package.json` still declares a dependency on the published version.

## Example Configuration

Each module's default configuration is in its `config/index.ts` or entry file. Before running Driver, set `project`, `serviceId`, and `driver.id` to the actual values for your target project and driver instance, in addition to configuring service addresses. For Driver, Algorithm, DataRelay, Flow, and FlowExtension, gRPC addresses are platform addresses actively connected to by the program. For Service, `server.port` is the HTTP listen port; Task does not listen on a port by default. The examples use `192.168.99.103` as a development address. Replace it with an address reachable from your target deployment environment.

Environment variables injected by the platform `ExtraConfig` override default configuration. Common keys are:

```text
production_project=default
production_serviceId=<DriverRuntimeInstanceId>
production_api__endpoint=http://192.168.99.103:31000
production_api__projectId=default
production_api__ak=<AppKey>
production_api__sk=<AppSecret>
production_mq__mqtt__host=192.168.99.103
production_driver-grpc__host=192.168.99.103
production_data-relay-grpc__host=192.168.99.103
```

Pass real secrets only through environment variables or deployment configuration. The API client uses a project AppKey/AppSecret. Use `const projectClient = client.setProjectId(projectId)` to switch projects and `client.call(service, method, route, options)` to call a full route.

## Developing Example Modules

### Driver

Modify methods such as `schema`, `start`, `run`, `writeTag`, and `stop` in the [MQTT driver](./examples/driver-mqtt/index.ts). Use the same driver identifier for `driver.id`, the driver schema's `key`, and the package's `Name`. After receiving a device message, the driver reports data with `app.writePoints(meta, point)`; commands are published over MQTT. For message formats, see [MQTT Driver Test Data and Scripts](#mqtt-driver-test-data-and-scripts).

### Algorithm, DataRelay, Flow, FlowExtension

Algorithm implements `schema` and `run`; DataRelay implements `start` and `httpProxy`; Flow implements `handler` and `debug`; FlowExtension implements `schema` and `run`. These examples actively connect to platform services. When debugging locally, first confirm that the target service address and port are reachable.

### Service and Task

Service registers Express routes through `app.getHttpServer()` in `start`; the example listens on port `9000` and exposes `/health`. Task registers scheduled jobs with `app.getCron().scheduleJob()` and cancels them in `stop`.

## Example Packaging and Deployment

Run the following commands in `examples/`. Build with `npm run build` first. A native package must contain that directory's `dist/`, `package.json`, installed production dependencies, and the platform-required `service.yml`. Include external configuration, certificates, or license libraries when your application uses them. Install production dependencies in an environment compatible with the target system and architecture. The target machine must have Node.js installed. For the MQTT driver, see the Windows native-package example [win.yml](./examples/driver-mqtt/deployments/win.yml), whose command is `node dist/driver-mqtt/index.js` and whose `GroupName` is `driver`.

A Linux container package can be built from [Dockerfile](./examples/driver-mqtt/Dockerfile). The image installs production dependencies and runs `dist/driver-mqtt/index.js`; the corresponding [linux.yml](./examples/driver-mqtt/deployments/linux.yml) uses `Service: None` because this example has no inbound service. If the driver enables HTTP or another inbound port, change this to `Internal` or `External` as required by the platform and set `Path` and `Ports`. This inbound port is different from `driverGrpc.host/port`, which the program uses to connect to the platform.

Use `examples/` as the build context, rather than `driver-mqtt/`:

```bash
npm run build
docker build -f driver-mqtt/Dockerfile -t kesi-driver-mqtt .
```

A Driver package is first uploaded to the driver repository, then a driver instance is created in the project. A DataRelay package is uploaded to the data-relay repository, then a running instance is installed. Other modules follow the ordinary service installation workflow. Service's `server.port` is an inbound port and must be exposed in the platform installation configuration; Task needs no inbound port.

## Example FAQ

### `npm run build` succeeds, but the SDK cannot be found at runtime. Why?

TypeScript compilation does not bundle dependencies into `dist`. Install the production dependencies from `package.json` during deployment, or use the example Dockerfile.

### Why are environment variables not taking effect?

Set variables before the Node.js process starts. With the `production_` prefix, double underscores represent nesting, for example `production_driver-grpc__host`. Dot-separated forms such as `APP.API.ENDPOINT` also work; the `production_` form takes precedence for the same field. Configuration objects support Go-style keys such as `driverGrpc` and older keys such as `driver-grpc`.

## MQTT Driver Test Data and Scripts

### Test data

Topic: `test/nodesdk/nodesdk1`. The parser below uses the second segment as the table ID (`nodesdk`) and the third as the device ID (`nodesdk1`). These values must match your platform configuration.

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

### Command script

Devices can subscribe to `cmd/#` to receive commands. The script returns the actual publish topic (for example `cmd/nodesdk/nodesdk1`) and payload.

```javascript
function handler(tableId, deviceId, command) {
  return {topic: "cmd/" + tableId + "/" + deviceId, payload: JSON.stringify(command.params)}
}
```
