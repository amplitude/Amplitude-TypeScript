const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { version } = require('../package');
const { snippet } = require('../template/browser-snippet.template');

const cwd = process.cwd();
const src = 'lib/scripts';
const dir = 'output/';
const headerTemplate = `/**
 * Imported in client browser via <script> tag
 * Async capabilities: Interally creates stubbed window.amplitude object until real SDK loaded
 * Stubbed functions keep track of funciton calls and their arguments
 * These are sent once real SDK loaded through another <script> tag
 */`;

const filepath = path.join(dir, 'amplitude-snippet.js');
const filename = path.join(cwd, filepath);

const sdkText = fs.readFileSync(path.join(src, 'amplitude-min.js'), 'utf-8');
const algo = 'sha384';
const integrity = algo + '-' + crypto.createHash(algo).update(sdkText).digest('base64');
const outputText = snippet(integrity, version);

fs.writeFileSync(filename, headerTemplate + outputText);

console.log(`Updated ${filepath} version: ${version}`);
