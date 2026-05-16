const limits = [
  {
    // analytics-browser bundle
    packageJsonPath: './packages/analytics-browser/package.json',
    path: `./packages/analytics-browser/lib/scripts/amplitude-min.js.gz`,
    name: 'analytics-browser.min.js.gz',
    limit: '65kb',
    brotli: false,
  },
  {
    // session-replay standalone bundle
    packageJsonPath: './packages/session-replay-browser/package.json',
    path: `./packages/session-replay-browser/lib/scripts/session-replay-browser-min.js.gz`,
    name: 'session-replay-browser.min.js.gz',
    limit: '150kb',
    brotli: false,
  },
  {
    // unified SDK bundle
    packageJsonPath: './packages/unified/package.json',
    path: `./packages/unified/lib/scripts/amplitude-min.umd.js.gz`,
    name: 'unified.min.umd.js.gz',
    limit: '225kb',
    brotli: false,
  },
];

module.exports = limits;
