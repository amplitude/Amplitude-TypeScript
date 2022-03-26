const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { version } = require('../package');
const { snippet } = require('../template/browser-snippet.template');

const cwd = process.cwd();
const src = 'lib/snippet';
const dir = 'output/';

function replaceTextInFile(filepath) {
  const filename = path.join(cwd, filepath);

  const sdkText = fs.readFileSync(path.join(src, 'amplitude.js'), 'utf-8');
  const integrity = crypto.createHash('sha384').update(sdkText).digest('base64');

  const outputText = snippet(integrity, version);
  fs.writeFileSync(filename, outputText);

  console.log(`Updated ${filepath} version: ${version}`);
}

replaceTextInFile(path.join(dir, 'amplitude-snippet.js'));
