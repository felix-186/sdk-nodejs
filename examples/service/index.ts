// @ts-nocheck
import {App, Service} from '@kesi/sdk-nodejs/service'

class HttpService extends Service {
  start(app) {
    app.getHttpServer().get('/health', (_request, response) => response.json({ok: true}))
  }

  stop() {
    console.log('HTTP 服务停止')
  }
}

new App({server: {port: 9000}}).start(new HttpService())
