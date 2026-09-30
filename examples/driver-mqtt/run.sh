#!/bin/sh
set -eu
# 可通过 production_mq__mqtt__host、production_driver-grpc__host 等环境变量覆盖配置。
cd "$(dirname "$0")/.."
exec npx tsx driver-mqtt/index.ts
