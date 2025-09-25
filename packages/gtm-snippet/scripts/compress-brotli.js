const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Paths
const inputPath = path.join(__dirname, '..', 'lib', 'amplitude-wrapper.js');
const outputPath = path.join(__dirname, '..', 'lib', 'amplitude-wrapper.js.br');

// Check if input file exists
if (!fs.existsSync(inputPath)) {
  console.error('❌ Error: amplitude-wrapper.js not found. Please run build script first.');
  process.exit(1);
}

// Read the input file
console.log('Reading amplitude-wrapper.js...');
const inputData = fs.readFileSync(inputPath, 'utf8');

// Compress with brotli
console.log('Compressing with brotli...');
const compressedData = zlib.brotliCompressSync(inputData, {
  params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 11, // Maximum compression
    [zlib.constants.BROTLI_PARAM_SIZE_HINT]: inputData.length
  }
});

// Write compressed file
fs.writeFileSync(outputPath, compressedData);

const compressionRatio = ((1 - (compressedData.length / inputData.length)) * 100).toFixed(1);

console.log('✅ Successfully compressed amplitude-wrapper.js');
console.log(`📄 Input: ${inputPath}`);
console.log(`🗜️  Output: ${outputPath}`);
console.log(`📊 Compression: ${inputData.length} → ${compressedData.length} bytes (${compressionRatio}% smaller)`);
