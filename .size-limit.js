const limits = [
  {
    // analytics-browser bundle
    path: './packages/analytics-browser/lib/scripts/amplitude-min.js.gz',
    limit: '65kb',
    brotli: false,
  },
  {
    // session-replay standalone bundle
    path: './packages/session-replay-browser/lib/scripts/session-replay-browser-min.js.gz',
    limit: '150kb',
    brotli: false,
  },
  {
    // unified SDK bundle
    path: './packages/unified/lib/scripts/amplitude-min.umd.js.gz',
    limit: '225kb',
    brotli: false,
  },
  {
    // @amplitude/element-selector — ESM library output (size-limit gzips on the fly).
    // The package isn't published as a standalone bundle; this entry exists to
    // catch raw-library bloat. The integration cost into the SDK is already
    // measured by the analytics-browser bundle entry above.
    name: '@amplitude/element-selector (gzipped esm)',
    path: './packages/element-selector/lib/esm/index.js',
    limit: '5kb',
    brotli: false,
  },
]

module.exports = limits;
