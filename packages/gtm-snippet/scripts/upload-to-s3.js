const fs = require('fs');
const path = require('path');
const analyticsBrowserPkg = require(path.join(process.cwd(), '..', 'analytics-browser', 'package.json'));
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const bucket = process.env.S3_BUCKET_NAME;
const gtmWrapper = `./lib/scripts/analytics-browser-gtm-wrapper.min.js.gz`;

const getVersion = () => analyticsBrowserPkg.version;
let deployed = false;
const body = fs.readFileSync(path.join(process.cwd(), gtmWrapper));
const key = `libs/analytics-browser-gtm-wrapper-${getVersion()}.js.br`;

if (process.env.DRY_RUN) {
  console.log(`[Publish to AWS S3] Dry run. Skipping upload job.`);
  console.log(`Publishing ${key} to ${bucket}...`);
  return;
}

const client = new S3Client();
const headObject = new HeadObjectCommand({
  Bucket: bucket,
  Key: key,
});


console.log('[Publish to AWS S3] START');
const promise = client
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
        ContentEncoding: 'br',
        Key: key,
      });
      return client
        .send(putObject)
        .then(() => {
          console.log(`[Publish to AWS S3] Upload success for ${key}.`);
          deployed = true;
        })
        .catch(console.error);
    });

  promise
  .then(() => {
    if (deployed) {
      console.log(`[Publish to AWS S3] Success! Deployed.`);
    } else {
      console.log(`[Publish to AWS S3] Complete! Nothing to deploy.`);
    }
    console.log('[Publish to AWS S3] END');
  })
  .catch(console.log);