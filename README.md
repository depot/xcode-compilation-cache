# xcode-compilation-cache-summary (BETA)

Summarize the Xcode compilation cache on Depot macOS runners. At the end of the job, the action logs the cache's hits, misses and hit rate, and adds them to the job summary.

Requires Xcode 26 or later.

> The cache itself is set up by the Depot runner, not by this action. While the cache is in beta, enable it by setting `DEPOT_XCODE_CACHE_ENABLED` for the job or step that runs `xcodebuild`.

> On runners without the Depot Xcode compilation cache, including GitHub-hosted runners, the action does nothing.

## Usage

```yaml
jobs:
  build:
    runs-on: depot-macos-latest
    env:
      DEPOT_XCODE_CACHE_ENABLED: 1
    steps:
      - uses: actions/checkout@v7
      - uses: depot/xcode-compilation-cache@v1

      - name: Build
        run: xcodebuild -workspace App.xcworkspace -scheme App build
```

Add the action before the build. Its summary is written in a post step, which runs at the end of the job, even when the build fails.

## Inputs

| Input   | Required | Default | Description                                                         |
| ------- | -------- | ------- | ------------------------------------------------------------------- |
| `debug` | No       | `false` | Enable verbose logging, and list the keys that missed the cache     |

## Cache summary

The summary counts the compilations looked up in Depot Cache. A compilation that hits Xcode's local cache, such as when a job runs `xcodebuild` twice, is not looked up and not counted.

With `debug: true`, the summary lists the keys that missed. To find the file a key belongs to, build with `COMPILATION_CACHE_ENABLE_DIAGNOSTIC_REMARKS=YES`, which logs each cache hit and miss in the build log with its key, and search the build log for the key. Cache errors are always listed.
