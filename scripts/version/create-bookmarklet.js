const fs = require('fs');
const path = require('path');

const cwd = process.cwd();

// Setup input
const inputDir = 'lib/scripts';
const inputFile = 'amplitude-bookmarklet-snippet-min.js';
const inputPath = path.join(cwd, inputDir, inputFile);

// Setup output
const outputDir = 'lib/scripts';
const outputFile = 'amplitude-bookmarklet.html';
const outputPath = path.join(cwd, outputDir, outputFile);

// Generate output contents
const inputText = fs.readFileSync(inputPath, 'utf-8');
const outputText = `javascript:${encodeURIComponent(inputText)}`;

// Write to disk
fs.writeFileSync(outputPath, outputText);

console.log(`Generated ${outputFile}`);
