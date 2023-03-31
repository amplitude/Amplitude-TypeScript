const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { snippet } = require('../templates/browser-snippet.template');
const { getName, getVersion } = require('../utils');
const babel = require('@babel/core');
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')
const argv = yargs(hideBin(process.argv)).argv

// Setup input
const inputDir = 'lib/scripts';
const inputFile = argv.inputFile ?? 'amplitude-min.js';
const inputPath = path.join(process.cwd(), inputDir, inputFile);

// Setup output
const outputDir = 'generated/';
const outputFile = argv.outputFile ?? 'amplitude-snippet.js';
const outputPath = path.join(process.cwd(), outputDir, outputFile);

const globalVar = argv.globalVar ?? 'amplitude';
const nameSuffix = argv.nameSuffix ?? '';

// Generate output contents
const header = `/**
 * Imported in client browser via <script> tag
 * Async capabilities: Interally creates stubbed window.${globalVar} object until real SDK loaded
 * Stubbed functions keep track of funciton calls and their arguments
 * These are sent once real SDK loaded through another <script> tag
 */`;
const algorithm = 'sha384';
const encoding = 'base64';
const inputText = fs.readFileSync(inputPath, 'utf-8');
const integrity = algorithm + '-' + crypto.createHash(algorithm).update(inputText).digest(encoding);
const version = getVersion() || '';
const outputText = header + snippet(getName()+nameSuffix, integrity, getVersion(), globalVar);
const { code: transpiledOutputText } = babel.transformSync(outputText, {
  presets: ['env'],
});

if (!version.includes('beta')) {
  // Write to disk
  fs.writeFileSync(outputPath, transpiledOutputText);
  console.log(`Generated ${outputFile}`);
}