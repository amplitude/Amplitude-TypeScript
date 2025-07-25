const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getName, getVersion } = require('../../../../scripts/utils');

const bucket = process.env.S3_BUCKET_NAME;
const location = path.join(process.cwd(), 'lib', 'scripts');
const files = [
  'plugin-session-replay-browser-esm.js.gz',  // ESM version
  'plugin-session-replay-browser-min.js.gz',  // IIFE version
  'console-plugin-min.js.gz',  // Console plugin chunk
  'rrweb-record-min.js.gz'  // RRWeb record chunk
];

let deployedCount = 0;

console.log('[Publish Session Replay Browser to AWS S3] START');
const promises = files.map((file) => {
  const body = fs.readFileSync(path.join(location, file));
  const key = `libs/${file.replace('plugin-session-replay-browser', `${getName()}-${getVersion()}`)}`;
  const client = new S3Client();

  const headObject = new HeadObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  console.log(`[Publish to AWS S3] Checking if ${key} exists in target bucket...`);
  return client
    .send(headObject)
    .then(() => {
      console.log(`[Publish to AWS S3] ${key} exists in target bucket. Skipping upload job.`);
    })
    .catch(() => {
      console.log(`[Publish to AWS S3] ${key} does not exist in target bucket. Uploading to S3...`);
      const putObject = new PutObjectCommand({
        ACL: 'public-read',
        Body: body,
        Bucket: bucket,
        CacheControl: 'max-age=31536000',
        ContentType: 'application/javascript',
        ContentEncoding: 'gzip',
        Key: key,
      });
      return client
        .send(putObject)
        .then(() => {
          console.log(`[Publish to AWS S3] Upload success for ${key}.`);
          deployedCount += 1;
        })
        .catch(console.error);
    });
});

Promise.all(promises)
  .then(() => {
    if (deployedCount === 0) {
      console.log(`[Publish to AWS S3] Complete! Nothing to deploy.`);
    } else {
      console.log(`[Publish to AWS S3] Success! Deployed ${deployedCount}/${files.length} files.`);
    }
    console.log('[Publish to AWS S3] END');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  }); 