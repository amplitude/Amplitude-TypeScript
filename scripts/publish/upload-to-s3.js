const fs = require('fs');
const path = require('path');
const { uploadArtifact } = require('./s3-upload');
const { getName, getVersion } = require('../utils');

const bucket = process.env.S3_BUCKET_NAME;
const location = path.join(process.cwd(), 'lib', 'scripts');
const isAnalyticsBrowser = location.includes('analytics-browser');

// Minified JS files to upload (gzipped)
const jsFiles = ['amplitude-min.js.gz', 'amplitude-min.umd.js.gz'];
if (isAnalyticsBrowser) {
  jsFiles.push('amplitude-gtm-min.js.gz', 'amplitude-lite-min.js.gz');
}

// Source map files to upload (for stack trace unminification)
const sourceMapFiles = ['amplitude-min.js.map'];
if (isAnalyticsBrowser) {
  sourceMapFiles.push('amplitude-gtm-min.js.map', 'amplitude-lite-min.js.map');
}

let deployedCount = 0;
let totalFiles = 0;

/**
 * Upload a file to S3 if it doesn't already exist
 */
async function uploadFile(file, contentType, contentEncoding) {
  const filePath = path.join(location, file);

  if (!fs.existsSync(filePath)) {
    console.log(`[Publish to AWS S3] ${file} not found. Skipping.`);
    return;
  }

  totalFiles++;
  const body = fs.readFileSync(filePath);
  const suffix = file.includes('-gtm-') ? '-gtm' : file.includes('-lite-') ? '-lite' : '';
  const replacement = `amplitude${suffix}`;
  const key = `libs/${file.replace(replacement, `${getName()}${suffix}-${getVersion()}`)}`;
  const uploaded = await uploadArtifact({
    Body: body,
    Bucket: bucket,
    CacheControl: 'max-age=31536000',
    ContentType: contentType,
    ...(contentEncoding ? { ContentEncoding: contentEncoding } : {}),
    Key: key,
  });
  if (uploaded) {
    deployedCount++;
  }
}

async function main() {
  console.log('[Publish to AWS S3] START');
  console.log(`[Publish to AWS S3] Package: ${getName()} v${getVersion()}`);

  // Upload minified JS files (gzipped)
  for (const file of jsFiles) {
    await uploadFile(file, 'application/javascript', 'gzip');
  }

  // Upload source map files (for stack trace unminification)
  for (const file of sourceMapFiles) {
    await uploadFile(file, 'application/json', null);
  }

  if (deployedCount === 0) {
    console.log(`[Publish to AWS S3] Complete! Nothing to deploy.`);
  } else {
    console.log(`[Publish to AWS S3] Success! Deployed ${deployedCount}/${totalFiles} files.`);
  }
  console.log('[Publish to AWS S3] END');
}

main().catch((err) => {
  console.error('[Publish to AWS S3] Error:', err);
  process.exit(1);
});
