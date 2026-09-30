// Counters served by Depot's runner agent. Key lookups are the compiler asking
// whether a compilation is cached, so their hits and misses are the hit rate.
export interface Stats {
  key_hits: number
  key_misses: number
  key_errors: number
  object_hits: number
  object_misses: number
  object_errors: number
  downloaded_bytes: number
  uploads: number
  uploaded_bytes: number
  upload_failures: number
  /** As the build log prints them with COMPILATION_CACHE_ENABLE_DIAGNOSTIC_REMARKS. */
  missed_keys?: string[]
  errors?: StatsError[]
}

export interface StatsError {
  operation: string
  key: string
  error: string
}

export function formatBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000
    i++
  }
  return i === 0 ? `${n} B` : `${n.toFixed(1)} ${units[i]}`
}

export function hitRate(stats: Stats): string {
  const lookups = stats.key_hits + stats.key_misses
  return lookups === 0 ? '-' : `${((stats.key_hits / lookups) * 100).toFixed(1)}%`
}

/** Returns the summary as label and value rows. */
export function summaryRows(stats: Stats): [string, string][] {
  const rows: [string, string][] = [
    ['Hits', `${stats.key_hits}`],
    ['Misses', `${stats.key_misses}`],
    ['Hit rate', hitRate(stats)],
    ['Downloaded', formatBytes(stats.downloaded_bytes)],
    ['Uploaded', `${stats.uploads} objects, ${formatBytes(stats.uploaded_bytes)}`],
  ]
  // A hit whose output is missing is compiled again.
  if (stats.object_misses > 0) rows.push(['Missing outputs', `${stats.object_misses}`])
  const errors = stats.key_errors + stats.object_errors
  if (errors > 0) rows.push(['Errors', `${errors}`])
  if (stats.upload_failures > 0) rows.push(['Failed uploads', `${stats.upload_failures}`])
  return rows
}
