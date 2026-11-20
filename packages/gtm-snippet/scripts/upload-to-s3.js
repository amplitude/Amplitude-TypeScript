const fs = require('fs');
const path = require('path');
const analyticsBrowserPkg = require(path.join(process.cwd(), '..', 'analytics-browser', 'package.json'));
const { uploadArtifact } = require('../../../scripts/publish/s3-upload');
const bucket = process.env.S3_BUCKET_NAME;

const extension = 'min.js.br';
const filename = 'analytics-browser-gtm-wrapper';
const gtmWrapper = `./lib/scripts/${filename}.${extension}`;

const getVersion = () => analyticsBrowserPkg.version;
const body = fs.readFileSync(path.join(process.cwd(), gtmWrapper));
const key = `libs/${filename}-${getVersion()}.${extension}`;

if (process.env.DRY_RUN) {
  console.log(`[Publish to AWS S3] Dry run. Skipping upload job.`);
  console.log(`Publishing ${key} to ${bucket}...`);
  return;
}

console.log('[Publish to AWS S3] START');
uploadArtifact({
  Body: body,
  Bucket: bucket,
  CacheControl: 'max-age=31536000',
  ContentType: 'application/javascript',
  ContentEncoding: 'br',
  Key: key,
})
  .then((deployed) => {
    if (deployed) {
      console.log('[Publish to AWS S3] Success! Deployed.');
    } else {
      console.log('[Publish to AWS S3] Complete! Nothing to deploy.');
    }
    console.log('[Publish to AWS S3] END');
  })
  .catch((err) => {
    console.error('[Publish to AWS S3] Error:', err);
    process.exitCode = 1;
  });
