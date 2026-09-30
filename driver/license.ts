// @ts-nocheck
const fs = require('fs')
const path = require('path')
const koffi = require('koffi')

const libraryName = () => {
  const platform = process.platform === 'win32' ? 'windows' : process.platform
  const extension = process.platform === 'win32' ? 'dll' : process.platform === 'darwin' ? 'dylib' : 'so'
  const arch = process.arch === 'x64' ? 'amd64' : process.arch
  return `license_core_${platform}_${arch}.${extension}`
}

const findLibrary = explicit => {
  if (explicit) return path.resolve(explicit)
  const name = libraryName()
  for (const candidate of [path.resolve('lib', name), path.resolve(name),
    path.join(path.dirname(process.execPath), 'lib', name), path.join(path.dirname(process.execPath), name)]) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error(`未找到授权库 ${name}；请配置 licenseLibrary`)
}

const libraries = new Map()

function verify(licensePath, driverId, config, explicitLibrary) {
  const location = findLibrary(explicitLibrary)
  let library = libraries.get(location)
  if (!library) {
    library = koffi.load(location)
    libraries.set(location, library)
  }
  const verifyLicense = library.func('int VerifyLicense(str licensePath, str driverID, str data)')
  const getLastError = library.func('str get_last_error(void)')
  const code = verifyLicense(licensePath, driverId, JSON.stringify(config))
  const raw = getLastError()
  let result
  try {
    result = raw ? JSON.parse(raw) : {ok: code === 0}
  } catch (_) {
    throw new Error(raw || `授权校验失败 (${code})`)
  }
  if (code !== 0 || !result.ok) throw new Error(result.error || `授权校验失败 (${code})`)
  return result.license
}

export = {verify, findLibrary}
