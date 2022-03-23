const crypto = require('crypto');
const browserClientMethods = require('../lib/cjs');
const fs = require('fs');
const handlebars = require('handlebars');
const path = require('path');
const { version } = require('../package');

const cwd = process.cwd();
const dir = 'lib/snippet';

// List of function excluded to be imported dynamically
const excludeMethodList = ['runQueuedFunctions'];

function replaceTextInFile(filepath) {
  const filename = path.join(cwd, filepath);
  const sourceText = fs.readFileSync(filename, 'utf-8');
  const template = handlebars.compile(sourceText);

  const sdkText = fs.readFileSync(path.join(dir, 'amplitude.js'), 'utf-8');
  const integrity = crypto.createHash('sha384').update(sdkText).digest('base64');

  const amplitudeFunctions = Object.keys(browserClientMethods).filter((method) => !excludeMethodList.includes(method));
  const outputText = template({
    amplitudeFunctions,
    integrity,
    version,
  });

  if (sourceText === outputText) {
    throw new Error(`Failed to update text in ${filepath}`);
  }

  fs.writeFileSync(filename, outputText);

  console.log(`Updated ${filepath}:`);
  console.log(`  integrity: ${integrity}`);
  console.log(`  version: ${version}`);
}

replaceTextInFile(path.join(dir, 'amplitude-snippet.js'));
