const limits = [
  {
    // analytics-browser bundle
    path: './packages/analytics-browser/lib/scripts/amplitude-min.js.gz',
    limit: '70kb',
    brotli: false,
  },
  {
    // Session replay including amp-semantic capture (~155kb gzipped).
    // The semantic runtime adds roughly 11kb; retain ~5kb of regression headroom.
    path: './packages/session-replay-browser/lib/scripts/session-replay-browser-min.js.gz',
    limit: '160kb',
    brotli: false,
  },
  {
    // Unified SDK including the same semantic runtime through session replay
    // (~242kb gzipped). Keep a separate, tighter budget for this aggregate bundle.
    path: './packages/unified/lib/scripts/amplitude-min.umd.js.gz',
    limit: '245kb',
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
