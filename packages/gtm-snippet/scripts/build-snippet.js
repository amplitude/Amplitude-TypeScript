const fs = require('fs');
const path = require('path');
const ejs = require('ejs');


const templatePath = path.join(__dirname, '..', 'amplitude-wrapper.js.ejs');
const outputPath = path.join(__dirname, '..', 'lib', 'amplitude-wrapper.js');
fs.mkdirSync(path.join(__dirname, '..', 'lib'), { recursive: true });

// Read the analytics browser snippet
const analyticsSnippetPath = path.join(__dirname, '..', '..', 'analytics-browser', 'lib', 'scripts','amplitude-gtm-snippet-min.js');
console.log('Reading analytics browser snippet...');
const analyticsBrowserSnippet = fs.readFileSync(analyticsSnippetPath, 'utf8');

// Read the plugin snippet
const pluginSnippetPath = path.join(__dirname, '..', '..', 'plugin-session-replay-browser', 'lib', 'scripts','plugin-session-replay-browser-min.js');
console.log('Reading plugin snippet...');
const pluginSessionReplaySnippet = fs.readFileSync(pluginSnippetPath, 'utf8');

// Read and process the EJS template
console.log('Processing EJS template...');
const template = fs.readFileSync(templatePath, 'utf8');

// Render the template with the snippet
const rendered = ejs.render(template, {
  analyticsBrowserSnippet,
  pluginSessionReplaySnippet,
});

// Write the output file
console.log('Writing output file...');
fs.writeFileSync(outputPath, rendered);

// Brotli compress the output file
// console.log('Compressing with brotli...');
// const brotliOutputPath = path.join(__dirname, '..', 'lib', 'analytics-browser-gtm-wrapper.js.br');
// const compressedData = zlib.brotliCompressSync(rendered, {
//   params: {
//     [zlib.constants.BROTLI_PARAM_QUALITY]: 11, // Maximum compression
//     [zlib.constants.BROTLI_PARAM_SIZE_HINT]: rendered.length
//   }
// });
// fs.writeFileSync(brotliOutputPath, compressedData);

console.log('✅ Successfully built amplitude-wrapper.js from template');
