import * as core from '@actions/core'
import * as fs from 'node:fs'
import * as http2 from 'node:http2'
import * as net from 'node:net'
import {summaryRows, type Stats} from './stats.ts'
import {remoteServicePath} from './xcodeargs.ts'

// Served by Depot's runner agent on the cache socket. The counters cover the
// whole job.
const STATS_PATH = '/depot/v1/stats'

/** Reads the stats over HTTP/2 with prior knowledge, the only protocol the cache speaks. */
function fetchStats(socket: string): Promise<Stats> {
  return new Promise((resolve, reject) => {
    const session = http2.connect('http://localhost', {createConnection: () => net.connect(socket)})
    const fail = (err: Error) => {
      session.destroy()
      reject(err)
    }
    session.on('error', fail)
    session.setTimeout(5000, () => fail(new Error('timed out')))

    const req = session.request({':method': 'GET', ':path': STATS_PATH})
    req.on('error', fail)
    req.on('response', (headers) => {
      const status = headers[':status']
      if (status !== 200) {
        req.resume()
        fail(new Error(`the cache returned ${status}`))
        return
      }
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        session.close()
        try {
          resolve(JSON.parse(body))
        } catch (err) {
          reject(err)
        }
      })
    })
  })
}

async function run() {
  const debug = core.getBooleanInput('debug')
  if (process.platform !== 'darwin') return

  const depotXcconfig = process.env.DEPOT_XCODE_CACHE_XCCONFIG
  if (!depotXcconfig || !fs.existsSync(depotXcconfig)) return
  const socket = remoteServicePath(fs.readFileSync(depotXcconfig, 'utf8'))
  if (!socket) return

  let stats: Stats
  try {
    stats = await fetchStats(socket)
  } catch (err) {
    // Older runner agents do not serve stats.
    if (debug) core.info(`Unable to read Xcode compilation cache stats: ${err instanceof Error ? err.message : err}`)
    return
  }
  if (debug) core.info(`Xcode compilation cache stats: ${JSON.stringify(stats)}`)

  if (stats.key_hits + stats.key_misses + stats.key_errors === 0) {
    core.info('Depot Xcode compilation cache: no compilations used the cache')
    return
  }

  const rows = summaryRows(stats)
  const width = Math.max(...rows.map(([label]) => label.length))
  core.info('Depot Xcode compilation cache')
  for (const [label, value] of rows) core.info(`  ${label.padEnd(width)}  ${value}`)

  const errors = stats.errors ?? []
  if (errors.length > 0) {
    core.startGroup(`Cache errors (${errors.length})`)
    for (const e of errors) core.info(`${e.operation} ${e.key}: ${e.error}`)
    core.endGroup()
  }
  // Keys only name files in the build log's remarks, which debug enables.
  const missed = stats.missed_keys ?? []
  if (debug) {
    if (missed.length > 0) {
      core.startGroup(`Missed keys (${missed.length}): search the build log for a key to find its file`)
      for (const key of missed) core.info(key)
      core.endGroup()
    }
  } else if (stats.key_misses > 0) {
    core.info('Set the debug input to list the missed keys and log the file each belongs to')
  }

  await core.summary
    .addHeading('Depot Xcode compilation cache', 3)
    .addTable(rows.map(([label, value]) => [label, value]))
    .write()
}

run().catch((err) => {
  // The cache must never break a job.
  core.warning(`Unable to summarize the Xcode compilation cache: ${err instanceof Error ? err.message : err}`)
})
