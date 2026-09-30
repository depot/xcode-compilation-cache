import * as fs from 'node:fs'
import * as path from 'node:path'

// Actions that compile. A bare `clean` builds nothing, so it runs unchanged.
const BUILD_ACTIONS = new Set([
  'build',
  'build-for-testing',
  'analyze',
  'archive',
  'test',
  'test-without-building',
  'docbuild',
  'installsrc',
  'installhdrs',
  'install',
])

// Flags that make xcodebuild do something other than build.
const QUERY_FLAGS = new Set([
  '-showsdks',
  '-showBuildSettings',
  '-showBuildSettingsForIndex',
  '-showdestinations',
  '-showTestPlans',
  '-version',
  '-list',
  '-help',
  '-usage',
  '-license',
  '-checkFirstLaunchStatus',
  '-runFirstLaunch',
  '-exportArchive',
  '-exportLocalizations',
  '-importLocalizations',
  '-exportNotarizedApp',
  '-resolvePackageDependencies',
  '-create-xcframework',
  '-downloadPlatform',
  '-downloadAllPlatforms',
  '-importPlatform',
  '-downloadComponent',
  '-importComponent',
  '-showComponent',
])

/**
 * Reports whether argv compiles. An explicit build action wins, otherwise
 * xcodebuild builds unless a query flag is present, since `build` is its
 * default action.
 */
export function isBuild(argv: string[]): boolean {
  if (argv.some((arg) => BUILD_ACTIONS.has(arg))) return true
  if (argv.includes('clean')) return false
  if (argv.some((arg) => QUERY_FLAGS.has(arg.split('=')[0]))) return false
  return true
}

export interface Invocation {
  /** argv without any -xcconfig flags. */
  args: string[]
  /** The absolute path of the last -xcconfig, which xcodebuild would use. */
  xcconfig?: string
  /** The absolute path of the last -derivedDataPath. */
  derivedDataPath?: string
}

/** Parses the flags the shim rewrites or reads, accepting `-flag value` and `-flag=value`. */
export function parseInvocation(argv: string[], cwd: string): Invocation {
  const args: string[] = []
  let xcconfig: string | undefined
  let derivedDataPath: string | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const [flag, inline] = splitFlag(arg)
    if (flag !== '-xcconfig' && flag !== '-derivedDataPath') {
      args.push(arg)
      continue
    }

    let value = inline
    if (value === undefined) {
      if (i + 1 >= argv.length) {
        args.push(arg)
        continue
      }
      value = argv[++i]
    }

    if (flag === '-xcconfig') {
      xcconfig = path.resolve(cwd, value)
    } else {
      derivedDataPath = path.resolve(cwd, value)
      args.push('-derivedDataPath', value)
    }
  }

  return {args, xcconfig, derivedDataPath}
}

function splitFlag(arg: string): [string, string | undefined] {
  // Accept --flag like xcodebuild does.
  const normalized = arg.startsWith('--') ? arg.slice(1) : arg
  const eq = normalized.indexOf('=')
  if (!normalized.startsWith('-') || eq < 0) return [normalized, undefined]
  return [normalized.slice(0, eq), normalized.slice(eq + 1)]
}

/**
 * Resolves symlinks in p. Unlike fs.realpathSync, p need not exist: the
 * deepest existing ancestor is resolved and the rest appended, since
 * DerivedData is often created by the build itself.
 */
export function realpathLenient(p: string): string {
  const missing: string[] = []
  let dir = p
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(dir), ...missing.reverse())
    } catch {
      const parent = path.dirname(dir)
      if (parent === dir) return p
      missing.push(path.basename(dir))
      dir = parent
    }
  }
}

/**
 * Returns prefix mappings for the resolved form of derivedDataPath. Xcode
 * maps DerivedData by the path it was given, while the compilers see some
 * paths resolved, such as /private/tmp for /tmp, which would leak the path
 * into cache keys and cost hits across runs.
 */
export function derivedDataMappings(derivedDataPath: string | undefined, realpath = realpathLenient): string[] {
  if (!derivedDataPath) return []
  const resolved = realpath(derivedDataPath)
  if (resolved === derivedDataPath) return []
  // Narrower paths first, and the same virtual names Depot uses for them.
  return [
    `${path.join(resolved, 'Build', 'Products')}=/^symroot`,
    `${path.join(resolved, 'Build', 'Intermediates.noindex')}=/^objroot`,
    `${resolved}=/^dd`,
  ]
}

export interface XcconfigOptions {
  /** The xcconfig Depot's runner agent writes, which enables the cache. */
  depotXcconfig: string
  /** The customer's own -xcconfig, which may override Depot's settings. */
  userXcconfig?: string
  /** Extra prefix mappings for this invocation. */
  mappings: string[]
  /** Whether to cache Swift compilation. */
  swift: boolean
  /** Whether the compilers log each cache hit and miss, with its key. */
  remarks?: boolean
}

/**
 * Generates the xcconfig passed to xcodebuild. Within an -xcconfig chain,
 * $(inherited) refers to the earlier definition, so appending to Depot's
 * mappings keeps them, and the customer's file comes after Depot's so their
 * explicit settings win.
 */
export function generateXcconfig(opts: XcconfigOptions): string {
  const lines = ['// Generated by depot/xcode-compilation-cache.', `#include "${opts.depotXcconfig}"`]
  if (opts.userXcconfig) lines.push(`#include "${opts.userXcconfig}"`)

  if (opts.mappings.length > 0) {
    const list = opts.mappings.map(quoteListItem).join(' ')
    lines.push(`SWIFT_OTHER_PREFIX_MAPPINGS = $(inherited) ${list}`)
    lines.push(`CLANG_OTHER_PREFIX_MAPPINGS = $(inherited) ${list}`)
  }

  if (!opts.swift) {
    lines.push('SWIFT_ENABLE_COMPILE_CACHE = NO')
    lines.push('SWIFT_ENABLE_EXPLICIT_MODULES = NO')
    lines.push('COMPILATION_CACHE_REMOTE_SUPPORTED_LANGUAGES = c c++ objective-c objective-c++')
  }

  if (opts.remarks) lines.push('COMPILATION_CACHE_ENABLE_DIAGNOSTIC_REMARKS = YES')

  return lines.join('\n') + '\n'
}

function quoteListItem(item: string): string {
  return /[\s"]/.test(item) ? `"${item.replace(/"/g, '\\"')}"` : item
}

/** Returns the socket the cache listens on, as named in Depot's xcconfig. */
export function remoteServicePath(xcconfig: string): string | undefined {
  const match = xcconfig.match(/^\s*COMPILATION_CACHE_REMOTE_SERVICE_PATH\s*=\s*(.+?)\s*$/m)
  return match?.[1]
}
