module.exports = [
  {
    // analytics-browser bundle
    path: './packages/analytics-browser/lib/scripts/amplitude-min.js.gz',
    limit: '60kb',
  },
  {
    // session-replay standalone bundle
    path: './packages/session-replay-browser/lib/scripts/session-replay-browser-min.js.gz',
    limit: '150kb',
  },
  {
    // unified SDK bundle
    path: './packages/unified/lib/scripts/amplitude-min.umd.js.gz',
    limit: '225kb',
  },
]