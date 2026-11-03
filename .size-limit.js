// @size-limit/esbuild bundles every check that does not opt out. These entries
// are already-built files, so measure them directly with @size-limit/file.
const fileOnly = {
  disablePlugins: ['@size-limit/esbuild'],
};

const limits = [
  {
    // analytics-browser bundle
    path: './packages/analytics-browser/lib/scripts/amplitude-min.js.gz',
    limit: '71kb',
    brotli: false,
    ...fileOnly,
  },
  {
    // session-replay standalone bundle
    path: './packages/session-replay-browser/lib/scripts/session-replay-browser-min.js.gz',
    limit: '150kb',
    brotli: false,
    ...fileOnly,
  },
  {
    // unified SDK bundle
    path: './packages/unified/lib/scripts/amplitude-min.umd.js.gz',
    limit: '235kb',
    brotli: false,
    ...fileOnly,
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
    ...fileOnly,
  },
  {
    // Bundles the lite entry and the modules it imports, then checks that the
    // minified gzipped ESM stays under 25 kB.
    name: '@amplitude/analytics-browser/lite (gzipped esm)',
    path: './packages/analytics-browser/lib/esm/index-lite.js',
    limit: '25kb',
    gzip: true,
    modifyEsbuildConfig(config) {
      return {
        ...config,
        format: 'esm',
        platform: 'browser',
      };
    },
  },
]

module.exports = limits;
