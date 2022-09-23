const fs = require('fs');
const path = require('path');

const cwd = process.cwd();

// Setup input
const inputDir = 'lib/scripts';
const inputFile = 'amplitude-snippet-instructions.html';
const inputPath = path.join(cwd, inputDir, inputFile);

// Setup output
const outputDir = '';
const outputFile = 'README.md';
const outputPath = path.join(cwd, outputDir, outputFile);

// Generate output contents
const inputText = fs.readFileSync(inputPath, 'utf-8');
const oldOutputText = fs.readFileSync(outputPath, 'utf-8');
const regexpPattern = /(<!-- README_SNIPPET_BLOCK -->)((?:.|\n)*)(<!-- \/ OF README_SNIPPET_BLOCK -->)/m;
const outputText = oldOutputText.replace(regexpPattern, '$1\n```html\n' + inputText + '```\n$3');

// Write to disk
fs.writeFileSync(outputPath, outputText);

console.log(`Generated ${outputFile}`);
