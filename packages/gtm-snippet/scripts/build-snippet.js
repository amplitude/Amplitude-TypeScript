const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ejs = require('ejs');

// Paths
const templatePath = path.join(__dirname, '..', 'amplitude-wrapper.js.ejs');
const outputPath = path.join(__dirname, '..', 'lib', 'amplitude-wrapper.js');
fs.mkdirSync(path.join(__dirname, '..', 'lib'), { recursive: true });
const analyticsSnippetPath = path.join(__dirname, '..', '..', 'analytics-browser', 'lib', 'scripts','amplitude-gtm-snippet-min.js');

// Read the analytics browser snippet
console.log('Reading analytics browser snippet...');
const analyticsBrowserSnippet = fs.readFileSync(analyticsSnippetPath, 'utf8');

// Read and process the EJS template
console.log('Processing EJS template...');
const template = fs.readFileSync(templatePath, 'utf8');

// Render the template with the snippet
const rendered = ejs.render(template, {
  analyticsBrowserSnippet: analyticsBrowserSnippet
});

// Write the output file
console.log('Writing output file...');
fs.writeFileSync(outputPath, rendered);

// Brotli compress the output file
console.log('Compressing with brotli...');
const brotliOutputPath = path.join(__dirname, '..', 'lib', 'amplitude-wrapper.js.br');
const compressedData = zlib.brotliCompressSync(rendered, {
  params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 11, // Maximum compression
    [zlib.constants.BROTLI_PARAM_SIZE_HINT]: rendered.length
  }
});
fs.writeFileSync(brotliOutputPath, compressedData);

const compressionRatio = ((1 - (compressedData.length / rendered.length)) * 100).toFixed(1);

console.log('✅ Successfully built amplitude-wrapper.js from template');
console.log(`📄 Output: ${outputPath}`);
console.log(`🗜️  Brotli compressed: ${brotliOutputPath}`);
console.log(`📦 Template variables used: analyticsBrowserSnippet (${analyticsBrowserSnippet.length} characters)`);
console.log(`📊 Compression: ${rendered.length} → ${compressedData.length} bytes (${compressionRatio}% smaller)`);
