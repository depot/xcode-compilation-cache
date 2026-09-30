// Runs in place of xcodebuild. Builds are pointed at Depot's Xcode
// compilation cache. Everything else, and any build the cache cannot serve,
// runs xcodebuild unchanged.

import {spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {derivedDataMappings, generateXcconfig, isBuild, parseInvocation, remoteServicePath} from './xcodeargs.ts'

// /usr/bin/xcodebuild follows xcode-select and DEVELOPER_DIR, so it is the
// right xcodebuild even if the job switches Xcode after setting up the cache.
const XCODEBUILD = process.env.DEPOT_XCODE_CACHE_XCODEBUILD || '/usr/bin/xcodebuild'

// Set for xcodebuild's children, so that an xcodebuild run from a build phase
// runs unchanged.
const ACTIVE = 'DEPOT_XCODE_CACHE_SHIM_ACTIVE'

const debug = process.env.DEPOT_XCODE_CACHE_DEBUG === 'true'

function log(message: string) {
  process.stderr.write(`depot-xcode-cache: ${message}\n`)
}

function isDisabled(value: string | undefined): boolean {
  return value !== undefined && ['0', 'false', 'no', 'off'].includes(value.toLowerCase())
}

/** Returns the arguments to run xcodebuild with, and why they are unchanged, if they are. */
function plan(argv: string[]): {args: string[]; skipped?: string} {
  if (process.env[ACTIVE]) return {args: argv, skipped: 'nested xcodebuild'}
  if (isDisabled(process.env.DEPOT_XCODE_CACHE)) return {args: argv, skipped: 'disabled by DEPOT_XCODE_CACHE'}
  if (!isBuild(argv)) return {args: argv, skipped: 'not a build'}

  const depotXcconfig = process.env.DEPOT_XCODE_CACHE_XCCONFIG
  if (!depotXcconfig || !fs.existsSync(depotXcconfig)) {
    return {args: argv, skipped: 'the cache is not available on this runner'}
  }
  const socket = remoteServicePath(fs.readFileSync(depotXcconfig, 'utf8'))
  if (!socket || !fs.statSync(socket, {throwIfNoEntry: false})?.isSocket()) {
    return {args: argv, skipped: 'the cache is not running'}
  }

  const invocation = parseInvocation(argv, process.cwd())
  const xcconfig = generateXcconfig({
    depotXcconfig,
    userXcconfig: invocation.xcconfig,
    mappings: derivedDataMappings(invocation.derivedDataPath),
    swift: !isDisabled(process.env.DEPOT_XCODE_CACHE_SWIFT),
  })
  return {args: [...invocation.args, '-xcconfig', writeXcconfig(xcconfig)]}
}

/** Writes the xcconfig to a file named by its content, so identical invocations share one. */
function writeXcconfig(content: string): string {
  const dir = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'depot-xcode-cache')
  fs.mkdirSync(dir, {recursive: true})
  const file = path.join(dir, `${createHash('sha256').update(content).digest('hex').slice(0, 16)}.xcconfig`)
  if (!fs.existsSync(file)) {
    const tmp = `${file}.${process.pid}`
    fs.writeFileSync(tmp, content)
    fs.renameSync(tmp, file)
  }
  return file
}

function main() {
  const argv = process.argv.slice(2)

  let args = argv
  try {
    const planned = plan(argv)
    args = planned.args
    if (planned.skipped) {
      if (debug) log(`running xcodebuild unchanged: ${planned.skipped}`)
    } else {
      log('using Depot Xcode compilation cache')
      if (debug) log(`xcodebuild ${args.join(' ')}`)
    }
  } catch (err) {
    // The cache must never break a build.
    log(`running xcodebuild unchanged: ${err instanceof Error ? err.message : err}`)
    args = argv
  }

  const child = spawn(XCODEBUILD, args, {stdio: 'inherit', env: {...process.env, [ACTIVE]: '1'}})
  // SIGINT and SIGHUP come from the terminal or are sent to the process
  // group, which includes xcodebuild. Forwarding them would deliver them
  // twice, and a second SIGINT can stop xcodebuild before it cleans up. The
  // shim ignores them and exits with xcodebuild. SIGTERM is often sent to a
  // single process, so it is forwarded.
  process.on('SIGINT', () => {})
  process.on('SIGHUP', () => {})
  process.on('SIGTERM', () => child.kill('SIGTERM'))
  child.on('error', (err) => {
    log(`unable to run ${XCODEBUILD}: ${err.message}`)
    process.exit(127)
  })
  child.on('exit', (code, signal) => {
    if (signal) {
      process.removeAllListeners(signal)
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 1)
  })
}

main()
