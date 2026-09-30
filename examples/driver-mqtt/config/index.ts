export = {
  "project": "zq",
  "serviceId": "node-driver-mqtt",
  "mq": {
    "type": "mqtt",
    "mqtt": {
      "host": "192.168.99.103",
      "port": 1883
    }
  },
  "driver-grpc": {
    "host": "192.168.99.103",
    "port": 9224
  },
  "logger": {
    "level": "info"
  },
  "driver": {
    "id": "node-driver-mqtt",
    "name": "Node驱动例子"
  },
  "api": {
    "endpoint": "http://192.168.99.103:31000",
    "type": "project",
    "projectId": "default"
  }
}
