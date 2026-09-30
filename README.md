# xcode-compilation-cache

Cache Xcode compilation in Depot Cache on Depot macOS runners. Compiler outputs are shared between runs, so unchanged sources are not compiled again.

> The action wraps `xcodebuild`, so builds need no changes. This includes `xcodebuild` run by other tools, such as fastlane.

> On runners without the Depot Xcode compilation cache, including GitHub-hosted runners, the action does nothing and `xcodebuild` runs unchanged.

## Usage

```yaml
jobs:
  build:
    runs-on: depot-macos-latest
    steps:
      - uses: actions/checkout@v5
      - uses: depot/xcode-compilation-cache@v1

      - name: Build
        run: xcodebuild -workspace App.xcworkspace -scheme App build
```

## Inputs

| Input   | Required | Default | Description                                                                                                                    |
| ------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `swift` | No       | `true`  | Cache Swift compilation. Swift caching requires explicit modules; set to `false` for projects that cannot build with them. |
| `debug` | No       | `false` | Enable verbose logging                                                                                                         |

## How it works

The action puts an `xcodebuild` wrapper on `PATH` for the rest of the job. For builds, the wrapper passes an xcconfig that enables Xcode's compilation cache and points it at the Depot runner's cache service. Everything else, such as `-showBuildSettings`, `-list` or a bare `clean`, runs `xcodebuild` unchanged.

- If you pass your own `-xcconfig`, it is included after Depot's settings, so your settings win.
- Settings in `XCODE_XCCONFIG_FILE` take precedence over both, so avoid setting compilation cache settings there.
- Cache keys do not depend on where the repository or DerivedData is, so builds hit the cache across runners.

## Disabling the cache

Set `DEPOT_XCODE_CACHE=0` to run `xcodebuild` unchanged, for a whole job or a single step:

```yaml
- name: Build without the cache
  run: xcodebuild -workspace App.xcworkspace -scheme App build
  env:
    DEPOT_XCODE_CACHE: 0
```

Tools that run `/usr/bin/xcodebuild` by its full path bypass the wrapper and do not use the cache.
