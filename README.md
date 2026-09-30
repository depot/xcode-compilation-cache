# xcode-compilation-cache (BETA)

Cache Xcode compilation in Depot Cache on Depot macOS runners. Compiler outputs are shared between runs, so unchanged sources are not compiled again.

Requires Xcode 26 or later.

> The action wraps `xcodebuild`, so builds need no changes. This includes `xcodebuild` run by other tools, such as fastlane.

> On runners without the Depot Xcode compilation cache, including GitHub-hosted runners, the action does nothing and `xcodebuild` runs unchanged.

## Usage

```yaml
jobs:
  build:
    runs-on: depot-macos-latest
    steps:
      - uses: actions/checkout@v7
      - uses: depot/xcode-compilation-cache@v1

      - name: Build
        run: xcodebuild -workspace App.xcworkspace -scheme App build
```

## Inputs

| Input   | Required | Default | Description                                                                                                                    |
| ------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `swift` | No       | `true`  | Cache Swift compilation. Swift caching requires explicit modules. Set to `false` for projects that cannot build with them. |
| `debug` | No       | `false` | Enable verbose logging                                                                                                         |

## How it works

The action puts an `xcodebuild` wrapper on `PATH` for the rest of the job. For builds, the wrapper passes an xcconfig that enables Xcode's compilation cache and points it at the Depot runner's cache service. Everything else, such as `-showBuildSettings`, `-list` or a bare `clean`, runs `xcodebuild` unchanged.

- If you pass your own `-xcconfig`, it is included after Depot's settings, so your settings win.
- Settings in `XCODE_XCCONFIG_FILE` take precedence over both, so avoid setting compilation cache settings there.
- Build settings passed on the command line, such as `SWIFT_ENABLE_EXPLICIT_MODULES=NO`, do not override Depot's settings, because xcconfig files take precedence over them. Use your own `-xcconfig`, the `swift` input or `DEPOT_XCODE_CACHE=0` instead.
- Cache keys do not include the paths of Xcode, the SDK, the repository or DerivedData, so builds hit the cache across runners. If the repository is checked out under a symlink, keep the resolved path the same between runs, or builds miss the cache.

## Cache summary

At the end of the job, the action logs the cache's hits, misses and hit rate, and adds them to the job summary. It counts the compilations looked up in Depot Cache. A compilation that hits Xcode's local cache, such as when a job runs `xcodebuild` twice, is not looked up and not counted.

With `debug: true`, the compilers log each cache hit and miss in the build log, with its key, and the summary lists the keys that missed. Search the build log for a missed key to find the file it belongs to. Cache errors are always listed.

## Disabling the cache

Set `DEPOT_XCODE_CACHE=0` to run `xcodebuild` unchanged, for a whole job or a single step:

```yaml
- name: Build without the cache
  run: xcodebuild -workspace App.xcworkspace -scheme App build
  env:
    DEPOT_XCODE_CACHE: 0
```

> [!IMPORTANT]
Tools that run `/usr/bin/xcodebuild` by its full path, or run it through `xcrun xcodebuild`, bypass the wrapper and do not use the cache.
