import {rmSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'

const workspace = resolve(__dirname, '..')
const target = resolve(join(workspace, 'dist'))
if (dirname(target) !== workspace) throw new Error('构建目录必须位于当前项目内')
rmSync(target, {recursive: true, force: true})
