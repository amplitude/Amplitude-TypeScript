const limits = [
  {
    // analytics-browser bundle
    // Bumped 66kb → 67kb for midpoint exposure, including overflow-container
    // and clipping-ancestor support. Current: ~66.1kb gzipped.
    path: './packages/analytics-browser/lib/scripts/amplitude-min.js.gz',
    limit: '67kb',
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
    // Published as a standalone npm package for SDK, dashboard, and Chrome
    // extension consumers. This entry guards against raw-library bloat; the
    // integration cost into the SDK is also measured by the analytics-browser
    // bundle entry above.
    //
    // Bumped from 5kb → 7kb to absorb the legacy cssPath walker and the
    // generateSelector top-level helper that moved into this package
    // (consolidation from plugin-autocapture-browser + session-replay-ui).
    // Current actual: ~2.7kb gzipped. The cap still catches a 2-3x runaway
    // without being so loose that it ignores real bloat.
    name: '@amplitude/element-selector (gzipped esm)',
    path: './packages/element-selector/lib/esm/index.js',
    limit: '7kb',
    brotli: false,
  },
]

module.exports = limits;
