import {cpSync, existsSync, mkdirSync, readdirSync} from 'node:fs'
import {join, relative, resolve} from 'node:path'

const root = resolve(__dirname, '..')
const dist = join(root, 'dist')
cpSync(join(root, 'package.json'), join(dist, 'package.json'))
const sourceDirs = ['algorithm', 'api', 'config', 'conn', 'data_relay', 'driver',
  'flow', 'flow_extension', 'log', 'register', 'service', 'task', 'utils']

for (const dir of sourceDirs) {
  const base = join(root, dir)
  if (!existsSync(base)) continue
  const visit = (folder: string) => {
    for (const entry of readdirSync(folder, {withFileTypes: true})) {
      const file = join(folder, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (entry.name.endsWith('.proto') || entry.name.endsWith('.json') ||
        entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
        const target = join(dist, relative(root, file))
        mkdirSync(resolve(target, '..'), {recursive: true})
        cpSync(file, target)
      }
    }
  }
  visit(base)
}
