// @ts-nocheck
import {App, Task} from '@kesi/sdk-nodejs/task'

class ScheduledTask extends Task {
  start(app) {
    this.job = app.getCron().scheduleJob('*/30 * * * * *', () => console.log('定时任务执行'))
  }

  stop() {
    this.job?.cancel()
  }
}

new App().start(new ScheduledTask())
