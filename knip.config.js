/**
 * Detects dependencies that are declared in a package.json but never used by
 * that package. Run via `pnpm lint:deps`; gated in CI.
 *
 * Scoped to unused dependencies only — knip can also report unused
 * files/exports/types, but those are a separate concern and are not gated here.
 */

const fs = require('fs');
const path = require('path');

/** Injected into every package's output by "importHelpers": true in the root tsconfig.json. */
const IMPLICIT_TS_DEPS = ['tslib'];

/**
 * Imported by the *shared* config at scripts/build/rollup.config.js, which most
 * packages' rollup.config.js re-exports. Rollup runs with cwd set to the
 * package, so these resolve from the package's own node_modules and have to stay
 * declared there even though nothing in the package imports them.
 *
 * Only applied to packages that actually import the shared config. A package
 * with a self-contained rollup.config.js gets no free pass: declaring one of
 * these without importing it means it really is dead.
 */
const SHARED_ROLLUP_PLUGINS = [
  '@rollup/plugin-commonjs',
  '@rollup/plugin-json',
  '@rollup/plugin-node-resolve',
  '@rollup/plugin-typescript',
  'rollup-plugin-execute',
  'rollup-plugin-gzip',
  'rollup-plugin-sourcemaps',
  'rollup-plugin-terser',
];

const SHARED_ROLLUP_CONFIG = 'scripts/build/rollup.config';

/** Implicit for one package each, keyed by directory name under packages/. */
const IMPLICIT_PACKAGE_DEPS = {
  // Types for the bare 'ua-parser-js' specifier that src/typings/ua-parser.d.ts
  // imports inside a `declare module` block.
  'analytics-react-native': ['@types/ua-parser-js'],

  // The GTM wrapper inlines the *built* bundles of these two, read from their
  // lib/ directories by scripts/build-snippet.js. They are declared so
  // lerna/nx build them first, so nothing imports them.
  'gtm-snippet': ['@amplitude/analytics-browser', '@amplitude/plugin-session-replay-browser'],

  // Named as rollup manualChunks string literals to split them out of the ESM bundle.
  'plugin-session-replay-browser': ['@amplitude/rrweb-plugin-console-record', '@amplitude/rrweb-record'],
};

/**
 * Dependencies knip already resolves in a given package, verified by dropping
 * the entry and confirming knip still reports nothing. Ignoring them anyway is
 * harmless but earns a "Remove from ignoreDependencies" hint, and the point of
 * deriving these lists is to keep the hint output at zero so a new one means
 * something.
 *
 * These two packages build a web worker off an extra tsconfig, which is
 * evidently enough for knip to tie tslib to a real compilation.
 */
const RESOLVED_WITHOUT_IGNORE = {
  'plugin-session-replay-browser': ['tslib'],
  'session-replay-browser': ['tslib'],
};

/**
 * - examples/* vendors its own package manager releases, which a per-package
 *   check reads as a sea of unused dependencies.
 * - analytics-react-native-test is a private, on-device-only harness whose
 *   metro and runner dependencies are wired through metro.config.js and
 *   rn-harness.config.mjs by name, so a static check cannot follow them.
 */
const IGNORED_WORKSPACES = ['examples/**', 'packages/analytics-react-native-test'];

/**
 * Specifiers a file imports directly, via either `from '…'` or `require('…')`.
 *
 * Deliberately a regex rather than a parse: the only inputs are the small,
 * uniform rollup.config.js files in this repo. It is not exhaustive — it would
 * miss a dynamic `await import()` and would match a commented-out import — but
 * both directions surface loudly rather than silently. Missing an import leaves
 * a redundant ignore, which knip reports as a configuration hint; matching a
 * comment drops a needed ignore, which fails CI with the dependency named.
 */
const importedBy = (file) => {
  if (!fs.existsSync(file)) return new Set();
  const source = fs.readFileSync(file, 'utf8');
  return new Set([...source.matchAll(/(?:from|require\()\s*['"]([^'"]+)['"]/g)].map((match) => match[1]));
};

/**
 * Narrow each package's ignore list to what that package actually needs ignored:
 * declared, not already imported by its own rollup.config.js, and not something
 * knip resolves unaided.
 *
 * Applying every entry to every package would be ~160 no-op entries, and knip
 * reports each as a "Remove from ignoreDependencies" hint. Deriving it keeps the
 * reasoning in one place above while staying precise, so a real hint is never
 * buried in noise, and a package that drops a rollup plugin — or starts
 * importing one directly — stops ignoring it automatically.
 */
const packagesDir = path.join(__dirname, 'packages');
const workspaces = {};

for (const dir of fs.readdirSync(packagesDir)) {
  if (IGNORED_WORKSPACES.includes(`packages/${dir}`)) continue;

  const manifest = path.join(packagesDir, dir, 'package.json');
  if (!fs.existsSync(manifest)) continue;

  const { dependencies = {}, devDependencies = {} } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const declared = new Set([...Object.keys(dependencies), ...Object.keys(devDependencies)]);
  const selfImported = importedBy(path.join(packagesDir, dir, 'rollup.config.js'));
  const resolved = new Set(RESOLVED_WITHOUT_IGNORE[dir] || []);

  const usesSharedRollupConfig = [...selfImported].some((spec) => spec.includes(SHARED_ROLLUP_CONFIG));

  const candidates = [
    ...IMPLICIT_TS_DEPS,
    ...(usesSharedRollupConfig ? SHARED_ROLLUP_PLUGINS : []),
    ...(IMPLICIT_PACKAGE_DEPS[dir] || []),
  ];

  const ignoreDependencies = candidates.filter(
    (dep) => declared.has(dep) && !selfImported.has(dep) && !resolved.has(dep),
  );

  if (ignoreDependencies.length) {
    workspaces[`packages/${dir}`] = { ignoreDependencies };
  }
}

// The root workspace's dependencies are consumed by the dev/test tooling rather
// than by any package, so those directories are its entry points. The vite,
// playwright and size-limit configs are omitted deliberately — knip's built-in
// plugins already detect them.
workspaces['.'] = {
  entry: ['scripts/**/*.js', 'test-server/**/*.{js,jsx,mjs,ts,tsx}', 'example-proxy/**/*.js'],

  // test-server/session-replay-browser/trc-e2e/vite.config.mjs maps these npm:
  // aliases by building a node_modules path string, so no import of them is
  // ever resolvable.
  ignoreDependencies: ['@amplitude/analytics-browser-srnpm', '@amplitude/plugin-session-replay-browser-srnpm'],
};

module.exports = {
  include: ['dependencies', 'devDependencies'],
  ignoreWorkspaces: IGNORED_WORKSPACES,
  workspaces,
};
