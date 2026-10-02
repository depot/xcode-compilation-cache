import * as core from '@actions/core'
import * as fs from 'node:fs'

// The summary is written by the post step, at the end of the job.
async function run() {
  if (process.platform !== 'darwin') {
    core.notice('The Xcode compilation cache is only available on macOS: there is no cache summary')
    return
  }

  // Depot's runner agent sets this while it serves the cache.
  const depotXcconfig = process.env.DEPOT_XCODE_CACHE_XCCONFIG
  if (!depotXcconfig || !fs.existsSync(depotXcconfig)) {
    core.notice('The Xcode compilation cache is not available on this runner: there is no cache summary')
    return
  }
  core.info('The Xcode compilation cache summary is written at the end of the job')
}

run().catch((err) => {
  // The summary must never break a job.
  core.warning(`Unable to set up the Xcode compilation cache summary: ${err instanceof Error ? err.message : err}`)
})
