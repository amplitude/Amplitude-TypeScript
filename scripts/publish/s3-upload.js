const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// These legacy chunks are intentionally updated in place. Keep this list aligned
// with UpdateLegacySessionReplayChunks in platform-infra's release IAM role.
const mutableKeys = new Set([
  'libs/console-plugin-min.js.gz',
  'libs/rrweb-record-min.js.gz',
  'libs/targeting-min.js.gz',
]);

async function uploadArtifact(params) {
  const mutable = mutableKeys.has(params.Key);
  const client = new S3Client();
  const command = new PutObjectCommand({
    ...params,
    // Conditional PUT is atomic and needs no HeadObject/GetObject permission.
    ...(mutable ? {} : { IfNoneMatch: '*' }),
  });

  try {
    await client.send(command);
    console.log(`[Publish to AWS S3] Upload success for ${params.Key}.`);
    return true;
  } catch (err) {
    // Recovery runs may encounter artifacts uploaded by an earlier attempt.
    // Only a failed create-only precondition is an expected skip; access errors,
    // network failures and 409 conflicts must fail the release.
    if (!mutable && err.$metadata?.httpStatusCode === 412) {
      console.log(`[Publish to AWS S3] ${params.Key} already exists. Skipping upload.`);
      return false;
    }
    throw err;
  }
}

module.exports = { uploadArtifact };
