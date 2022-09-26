const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { snippet } = require('../templates/browser-snippet.template');
const { getName, getVersion } = require('../utils');

// Setup input
const inputDir = 'lib/scripts';
const inputFile = 'amplitude-min.js';
const inputPath = path.join(process.cwd(), inputDir, inputFile);

// Setup output
const outputDir = 'generated/';
const outputFile = 'amplitude-snippet.js';
const outputPath = path.join(process.cwd(), outputDir, outputFile);

// Generate output contents
const header = `/**
 * Imported in client browser via <script> tag
 * Async capabilities: Interally creates stubbed window.amplitude object until real SDK loaded
 * Stubbed functions keep track of funciton calls and their arguments
 * These are sent once real SDK loaded through another <script> tag
 */`;
const algorithm = 'sha384';
const encoding = 'base64';
const inputText = fs.readFileSync(inputPath, 'utf-8');
const integrity = algorithm + '-' + crypto.createHash(algorithm).update(inputText).digest(encoding);
const outputText = header + snippet(getName(), integrity, getVersion());

// Write to disk
fs.writeFileSync(outputPath, outputText);

console.log(`Generated ${outputFile}`);
