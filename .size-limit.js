const fs = require('fs')
const path = require('path')

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
]

module.exports = limits.filter((entry) =>
  fs.existsSync(path.resolve(__dirname, entry.path)),
)
