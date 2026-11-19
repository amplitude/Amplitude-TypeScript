const path = require('path');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getName, getVersion } = require('../../../../scripts/utils');
const { prepareCdnAssets } = require('../../../../scripts/publish/esm-cdn');

const bucket = process.env.S3_BUCKET_NAME;
const name = getName();
const version = getVersion();
const assets = prepareCdnAssets({
  scriptsDir: path.join(process.cwd(), 'lib', 'scripts'),
  name,
  version,
});

console.log(`[Publish ${name} to AWS S3] START`);

async function uploadOne(client, asset) {
  const headObject = new HeadObjectCommand({
    Bucket: bucket,
    Key: asset.key,
  });
  console.log(`[Publish to AWS S3] Checking if ${asset.key} exists in target bucket...`);
  try {
    await client.send(headObject);
    console.log(`[Publish to AWS S3] ${asset.key} exists in target bucket. Skipping upload job.`);
    return false;
  } catch {
    console.log(`[Publish to AWS S3] ${asset.key} does not exist in target bucket. Uploading to S3...`);
    const putObject = new PutObjectCommand({
      ACL: 'public-read',
      Body: asset.body,
      Bucket: bucket,
      CacheControl: 'max-age=31536000',
      ContentType: 'application/javascript',
      ContentEncoding: 'gzip',
      Key: asset.key,
    });
    await client.send(putObject);
    console.log(`[Publish to AWS S3] Upload success for ${asset.key}.`);
    return true;
  }
}

async function main() {
  const client = new S3Client();
  const results = await Promise.all(assets.map((asset) => uploadOne(client, asset)));
  const deployedCount = results.filter(Boolean).length;
  if (deployedCount === 0) {
    console.log('[Publish to AWS S3] Complete! Nothing to deploy.');
  } else {
    console.log(`[Publish to AWS S3] Success! Deployed ${deployedCount}/${assets.length} files.`);
  }
  console.log('[Publish to AWS S3] END');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
