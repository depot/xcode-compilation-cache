const esbuild = require('esbuild')

esbuild.build({
  entryPoints: ['src/index.ts', 'src/shim.ts'],
  bundle: true,
  minify: false,
  platform: 'node',
  target: 'node20',
  outdir: 'dist',
})
