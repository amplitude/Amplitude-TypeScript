const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getName, getVersion } = require('../utils');
const { prepareCdnAssets } = require('./esm-cdn');

// Keep this exact allowlist aligned with UpdateLegacySessionReplayChunks in
// platform-infra's release IAM role until these chunks are versioned.
const mutableKeys = new Set([
  'libs/console-plugin-min.js.gz',
  'libs/rrweb-record-min.js.gz',
  'libs/targeting-min.js.gz',
]);

function artifact(file, key, contentEncoding = 'gzip', contentType = 'application/javascript') {
  return { file, key, contentEncoding, contentType };
}

function publishConfig(name, version) {
  if (name === 'gtm-snippet') {
    // GTM publishes the Browser version, independently of its own manifest.
    const browser = require(path.join(process.cwd(), '..', 'analytics-browser', 'package.json'));
    return {
      version: browser.version,
      dryRun: Boolean(process.env.DRY_RUN),
      files: [
        artifact(
          'analytics-browser-gtm-wrapper.min.js.br',
          `libs/analytics-browser-gtm-wrapper-${browser.version}.min.js.br`,
          'br',
        ),
      ],
    };
  }

  if (name === 'session-replay-browser' || name === 'plugin-session-replay-browser') {
    const assets = prepareCdnAssets({ scriptsDir: path.join(process.cwd(), 'lib', 'scripts'), name, version });
    return {
      files: assets.map(({ key, body }) => ({ ...artifact(null, key), body })),
    };
  }

  if (name === 'segment-session-replay-plugin') {
    return {
      files: [artifact('segment-session-replay-wrapper-esm.js.gz', `libs/${name}-${version}-esm.js.gz`)],
    };
  }

  const jsFiles = ['amplitude-min.js.gz', 'amplitude-min.umd.js.gz'];
  const sourceMapFiles = ['amplitude-min.js.map'];
  if (name === 'analytics-browser') {
    jsFiles.push('amplitude-gtm-min.js.gz', 'amplitude-lite-min.js.gz');
    sourceMapFiles.push('amplitude-gtm-min.js.map', 'amplitude-lite-min.js.map');
  }
  const key = (file) => {
    const suffix = file.includes('-gtm-') ? '-gtm' : file.includes('-lite-') ? '-lite' : '';
    return `libs/${file.replace(`amplitude${suffix}`, `${name}${suffix}-${version}`)}`;
  };
  return {
    // Generic packages produce different subsets of these bundles/maps.
    optionalFiles: true,
    files: [
      ...jsFiles.map((file) => artifact(file, key(file))),
      ...sourceMapFiles.map((file) => artifact(file, key(file), null, 'application/json')),
    ],
  };
}

async function uploadArtifact(client, params) {
  const mutable = mutableKeys.has(params.Key);
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
    // Recovery runs may encounter earlier uploads. Only a failed create-only
    // precondition is an expected skip, not access/network errors or conflicts.
    if (!mutable && err.$metadata?.httpStatusCode === 412) {
      console.log(`[Publish to AWS S3] ${params.Key} already exists. Skipping upload.`);
      return false;
    }
    throw err;
  }
}

async function main() {
  const name = getName();
  const version = getVersion();
  const config = publishConfig(name, version);
  const location = path.join(process.cwd(), 'lib', 'scripts');
  const bucket = process.env.S3_BUCKET_NAME;
  let client;
  let deployedCount = 0;
  let totalFiles = 0;

  console.log('[Publish to AWS S3] START');
  console.log(`[Publish to AWS S3] Package: ${name} v${config.version ?? version}`);
  for (const { file, key, contentType, contentEncoding, body: preparedBody } of config.files) {
    const filePath = file ? path.join(location, file) : null;
    if (config.optionalFiles && !fs.existsSync(filePath)) {
      console.log(`[Publish to AWS S3] ${file} not found. Skipping.`);
      continue;
    }
    // Required Replay/GTM artifacts must exist, including during GTM dry runs.
    const body = preparedBody ?? fs.readFileSync(filePath);
    totalFiles++;
    if (config.dryRun) {
      console.log(`[Publish to AWS S3] Dry run. Publishing ${key} to ${bucket}...`);
      continue;
    }
    client ??= new S3Client();
    if (
      await uploadArtifact(client, {
        Body: body,
        Bucket: bucket,
        CacheControl: 'max-age=31536000',
        ContentType: contentType,
        ...(contentEncoding ? { ContentEncoding: contentEncoding } : {}),
        Key: key,
      })
    ) {
      deployedCount++;
    }
  }

  if (config.dryRun) {
    console.log('[Publish to AWS S3] Dry run. Skipping upload job.');
  } else if (deployedCount === 0) {
    console.log('[Publish to AWS S3] Complete! Nothing to deploy.');
  } else {
    console.log(`[Publish to AWS S3] Success! Deployed ${deployedCount}/${totalFiles} files.`);
  }
  console.log('[Publish to AWS S3] END');
}

main().catch((err) => {
  console.error('[Publish to AWS S3] Error:', err);
  process.exitCode = 1;
});
