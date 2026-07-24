/**
 * Detects dependencies that are declared in a package.json but never used by
 * that package. Run via `pnpm lint:deps`; gated in CI.
 *
 * Scoped to unused dependencies only — knip can also report unused
 * files/exports/types, but those are a separate concern and are not gated here.
 */

/**
 * Used by the packages that declare them, but never through an import.
 *
 * - tslib is injected by "importHelpers": true in the root tsconfig.json.
 * - The rollup plugins are imported by the *shared* config at
 *   scripts/build/rollup.config.js, which each package's rollup.config.js
 *   re-exports. Rollup runs with cwd set to the package, so they resolve from
 *   the package's own node_modules and have to stay declared there.
 */
const IMPLICIT_BUILD_DEPS = [
  'tslib',
  '@rollup/plugin-commonjs',
  '@rollup/plugin-json',
  '@rollup/plugin-node-resolve',
  '@rollup/plugin-typescript',
  'rollup-plugin-execute',
  'rollup-plugin-gzip',
  'rollup-plugin-sourcemaps',
  'rollup-plugin-terser',
];

// A workspace entry replaces the `packages/*` one rather than merging with it,
// so the shared list has to be spread into each override explicitly.
const pkg = (ignoreDependencies = []) => ({
  ignoreDependencies: [...IMPLICIT_BUILD_DEPS, ...ignoreDependencies],
});

module.exports = {
  include: ['dependencies', 'devDependencies'],

  // - The example apps vendor their own package manager releases, which a
  //   per-package check reads as a sea of unused dependencies.
  // - analytics-react-native-test is a private, on-device-only harness whose
  //   metro and runner dependencies are wired through metro.config.js and
  //   rn-harness.config.mjs by name, so a static check cannot follow them.
  ignoreWorkspaces: ['examples/**', 'packages/analytics-react-native-test'],

  workspaces: {
    // The root workspace's dependencies are consumed by the dev/test tooling
    // rather than by any package, so those directories are its entry points.
    '.': {
      entry: [
        'scripts/**/*.js',
        'test-server/**/*.{js,jsx,mjs,ts,tsx}',
        'example-proxy/**/*.js',
        'vite.config.js',
        'playwright.config.ts',
        '.size-limit.js',
        'jest.setup.examples.js',
      ],
      // test-server/session-replay-browser/trc-e2e/vite.config.mjs maps these
      // npm: aliases by building a node_modules path string, so no import of
      // them is ever resolvable.
      ignoreDependencies: ['@amplitude/analytics-browser-srnpm', '@amplitude/plugin-session-replay-browser-srnpm'],
    },

    'packages/*': pkg(),

    // @types/ua-parser-js types the bare 'ua-parser-js' specifier that
    // src/typings/ua-parser.d.ts imports inside a `declare module` block.
    'packages/analytics-react-native': pkg(['@types/ua-parser-js']),

    // The GTM wrapper inlines the *built* bundles of these two packages, read
    // from their lib/ directories by scripts/build-snippet.js. They are
    // declared so lerna/nx build them first, so nothing imports them.
    'packages/gtm-snippet': pkg(['@amplitude/analytics-browser', '@amplitude/plugin-session-replay-browser']),

    // Named as rollup manualChunks string literals in rollup.config.js to split
    // them out of the ESM bundle.
    'packages/plugin-session-replay-browser': pkg([
      '@amplitude/rrweb-plugin-console-record',
      '@amplitude/rrweb-record',
    ]),

    // Passed as a babel plugin name string in jest.config.js (needed for @medv/finder).
    'packages/session-replay-browser': pkg(['@babel/plugin-transform-modules-commonjs']),
  },
};
