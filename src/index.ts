import * as core from '@actions/core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {remoteServicePath} from './xcodeargs.ts'

async function run() {
  const swift = core.getBooleanInput('swift')
  const debug = core.getBooleanInput('debug')

  if (process.platform !== 'darwin') {
    core.notice('The Xcode compilation cache is only available on macOS: xcodebuild runs unchanged')
    return
  }

  // Depot's runner agent sets this while it serves the cache.
  const depotXcconfig = process.env.DEPOT_XCODE_CACHE_XCCONFIG
  if (!depotXcconfig || !fs.existsSync(depotXcconfig)) {
    core.notice('The Xcode compilation cache is not available on this runner: xcodebuild runs unchanged')
    return
  }
  const socket = remoteServicePath(fs.readFileSync(depotXcconfig, 'utf8'))
  if (debug) core.info(`Depot xcconfig: ${depotXcconfig}, cache socket: ${socket}`)

  const binDir = path.join(process.env.RUNNER_TEMP || '/tmp', 'depot-xcode-cache', 'bin')
  const shim = path.join(__dirname, 'shim.js')
  fs.mkdirSync(binDir, {recursive: true})
  // Run the shim with the Node that runs this action, which the job's own
  // Node setup cannot change.
  fs.writeFileSync(path.join(binDir, 'xcodebuild'), `#!/bin/sh\nexec "${process.execPath}" "${shim}" "$@"\n`, {
    mode: 0o755,
  })

  core.addPath(binDir)
  core.exportVariable('DEPOT_XCODE_CACHE_SWIFT', swift ? 'true' : 'false')
  core.exportVariable('DEPOT_XCODE_CACHE_DEBUG', debug ? 'true' : 'false')
  core.info(`xcodebuild now uses the Depot Xcode compilation cache${swift ? '' : ' for C, C++ and Objective-C'}`)
}

run().catch((err) => {
  // The cache must never break a job.
  core.warning(`Unable to set up the Xcode compilation cache: ${err instanceof Error ? err.message : err}`)
})
