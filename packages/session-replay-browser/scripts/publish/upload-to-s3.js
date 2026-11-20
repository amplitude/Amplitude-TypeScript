const fs = require('fs');
const path = require('path');
const { uploadArtifact } = require('../../../../scripts/publish/s3-upload');
const { getName, getVersion } = require('../../../../scripts/utils');

const bucket = process.env.S3_BUCKET_NAME;
const location = path.join(process.cwd(), 'lib', 'scripts');
const files = [
  'session-replay-browser-esm.js.gz', // ESM version
  'session-replay-browser-min.js.gz', // IIFE version
  'console-plugin-min.js.gz', // Console plugin chunk
  'rrweb-record-min.js.gz', // RRWeb record chunk
  'targeting-min.js.gz', // Targeting chunk
];

async function main() {
  let deployedCount = 0;
  console.log('[Publish Session Replay Browser to AWS S3] START');
  for (const file of files) {
    const body = fs.readFileSync(path.join(location, file));
    const key = `libs/${file.replace('session-replay-browser', `${getName()}-${getVersion()}`)}`;
    const uploaded = await uploadArtifact({
      Body: body,
      Bucket: bucket,
      CacheControl: 'max-age=31536000',
      ContentType: 'application/javascript',
      ContentEncoding: 'gzip',
      Key: key,
    });
    if (uploaded) {
      deployedCount++;
    }
  }

  console.log(`[Publish to AWS S3] Success! Deployed ${deployedCount}/${files.length} files.`);
  console.log('[Publish to AWS S3] END');
}

main().catch((err) => {
  console.error('[Publish to AWS S3] Error:', err);
  process.exitCode = 1;
});
