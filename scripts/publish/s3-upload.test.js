const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const repo = path.resolve(__dirname, '../..');
const publishers = [
  {
    name: 'analytics-browser',
    script: 'scripts/publish/upload-to-s3.js',
    files: [
      'amplitude-min.js.gz',
      'amplitude-min.umd.js.gz',
      'amplitude-gtm-min.js.gz',
      'amplitude-lite-min.js.gz',
      'amplitude-min.js.map',
      'amplitude-gtm-min.js.map',
      'amplitude-lite-min.js.map',
    ],
    keys: [
      'analytics-browser-2.0.0-min.js.gz',
      'analytics-browser-2.0.0-min.umd.js.gz',
      'analytics-browser-gtm-2.0.0-min.js.gz',
      'analytics-browser-lite-2.0.0-min.js.gz',
      'analytics-browser-2.0.0-min.js.map',
      'analytics-browser-gtm-2.0.0-min.js.map',
      'analytics-browser-lite-2.0.0-min.js.map',
    ],
  },
  {
    name: 'plugin-stub-browser',
    script: 'scripts/publish/upload-to-s3.js',
    files: ['amplitude-min.js.gz', 'amplitude-min.js.map'],
    keys: ['plugin-stub-browser-2.0.0-min.js.gz', 'plugin-stub-browser-2.0.0-min.js.map'],
  },
  {
    name: 'gtm-snippet',
    script: 'packages/gtm-snippet/scripts/upload-to-s3.js',
    files: ['analytics-browser-gtm-wrapper.min.js.br'],
    keys: ['analytics-browser-gtm-wrapper-2.0.0.min.js.br'],
  },
  {
    name: 'session-replay-browser',
    script: 'packages/session-replay-browser/scripts/publish/upload-to-s3.js',
    files: [
      'session-replay-browser-esm.js.gz',
      'session-replay-browser-min.js.gz',
      'console-plugin-min.js.gz',
      'rrweb-record-min.js.gz',
      'targeting-min.js.gz',
    ],
    keys: [
      'session-replay-browser-2.0.0-esm.js.gz',
      'session-replay-browser-2.0.0-min.js.gz',
      'console-plugin-min.js.gz',
      'rrweb-record-min.js.gz',
      'targeting-min.js.gz',
    ],
  },
  {
    name: 'plugin-session-replay-browser',
    script: 'packages/plugin-session-replay-browser/scripts/publish/upload-to-s3.js',
    files: [
      'plugin-session-replay-browser-esm.js.gz',
      'plugin-session-replay-browser-min.js.gz',
      'console-plugin-min.js.gz',
      'rrweb-record-min.js.gz',
    ],
    keys: [
      'plugin-session-replay-browser-2.0.0-esm.js.gz',
      'plugin-session-replay-browser-2.0.0-min.js.gz',
      'console-plugin-min.js.gz',
      'rrweb-record-min.js.gz',
    ],
  },
  {
    name: 'segment-session-replay-plugin',
    script: 'packages/segment-session-replay-plugin/scripts/publish/upload-to-s3.js',
    files: ['segment-session-replay-wrapper-esm.js.gz'],
    keys: ['segment-session-replay-plugin-2.0.0-esm.js.gz'],
  },
];
const mutableFiles = ['console-plugin-min.js.gz', 'rrweb-record-min.js.gz', 'targeting-min.js.gz'];

function fixture(t, publisher) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 's3-publish-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, publisher.name);
  const artifacts = path.join(cwd, 'lib/scripts');
  fs.mkdirSync(artifacts, { recursive: true });
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    JSON.stringify({
      name: `@amplitude/${publisher.name}`,
      version: '2.0.0',
    }),
  );
  // GTM derives its version from the sibling Browser package.
  if (publisher.name === 'gtm-snippet') {
    fs.mkdirSync(path.join(root, 'analytics-browser'));
    fs.writeFileSync(path.join(root, 'analytics-browser/package.json'), '{"version":"2.0.0"}');
  }
  for (const file of publisher.files) fs.writeFileSync(path.join(artifacts, file), `artifact:${file}`);
  const requests = path.join(root, 'requests.jsonl');
  const preload = path.join(root, 's3-transport.cjs');
  // Exercise the real SDK serializer/deserializer and the actual CLI entry point.
  // Replace only the HTTP transport: these tests must never contact AWS.
  fs.writeFileSync(
    preload,
    `
const fs = require('node:fs');
const { Readable } = require('node:stream');
const s3 = require(${JSON.stringify(require.resolve('@aws-sdk/client-s3'))});
const RealClient = s3.S3Client;
s3.S3Client = class extends RealClient {
  constructor() {
    super({
      region: 'us-west-2',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      maxAttempts: 1,
      requestHandler: {
        async handle(request) {
          fs.appendFileSync(process.env.TEST_REQUESTS, JSON.stringify({
            method: request.method, path: request.path, headers: request.headers,
            body: Buffer.from(request.body).toString(),
          }) + '\\n');
          const mode = process.env.TEST_RESPONSE;
          if (mode === 'network') throw new Error('simulated network failure');
          const statusCode = mode === 'existing'
            ? (request.headers['if-none-match'] ? 412 : 200) : Number(mode);
          const code = { 403: 'AccessDenied', 409: 'ConditionalRequestConflict',
            412: 'PreconditionFailed', 500: 'InternalError' }[statusCode];
          return { response: { statusCode, headers: { 'content-type': 'application/xml' },
            body: Readable.from([code ? '<Error><Code>' + code + '</Code></Error>' : '']),
          } };
        },
      },
    });
  }
};
`,
  );
  return {
    execute(response = '200', env = {}) {
      const result = spawnSync(process.execPath, ['--require', preload, path.join(repo, publisher.script)], {
        cwd,
        encoding: 'utf8',
        timeout: 15000,
        env: {
          ...process.env,
          DRY_RUN: '',
          S3_BUCKET_NAME: 'test-release-bucket',
          TEST_REQUESTS: requests,
          TEST_RESPONSE: response,
          ...env,
        },
      });
      assert.ifError(result.error);
      const calls = fs.existsSync(requests) ? fs.readFileSync(requests, 'utf8').trim().split('\n').map(JSON.parse) : [];
      return { ...result, calls };
    },
  };
}

for (const publisher of publishers) {
  test(`${publisher.name}: uploads the expected keys without ACL or read permissions`, (t) => {
    const result = fixture(t, publisher).execute();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      result.calls.map((call) => call.path),
      publisher.keys.map((key) => `/libs/${key}`),
    );
    for (const [index, call] of result.calls.entries()) {
      const file = publisher.files[index];
      assert.equal(call.method, 'PUT');
      assert.equal(call.headers['x-amz-acl'], undefined);
      assert.equal(call.headers['if-none-match'], mutableFiles.includes(file) ? undefined : '*');
      assert.equal(call.headers['cache-control'], 'max-age=31536000');
      assert.equal(call.headers['content-type'], file.endsWith('.map') ? 'application/json' : 'application/javascript');
      assert.equal(
        call.headers['content-encoding'],
        file.endsWith('.map') ? undefined : file.endsWith('.br') ? 'br' : 'gzip',
      );
      assert.equal(call.body, `artifact:${file}`);
    }
  });

  test(`${publisher.name}: skips existing versioned keys and still updates mutable chunks`, (t) => {
    const result = fixture(t, publisher).execute('existing');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.calls.length, publisher.files.length);
    assert.match(result.stdout, /already exists/);
    for (const file of publisher.files.filter((file) => mutableFiles.includes(file))) {
      assert.ok(result.stdout.includes(`Upload success for libs/${file}.`));
    }
  });

  for (const response of ['403', '409', '500', 'network']) {
    test(`${publisher.name}: ${response} upload failure exits nonzero`, (t) => {
      const result = fixture(t, publisher).execute(response);
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.calls.length, 1);
      assert.doesNotMatch(result.stdout, /Success!|Nothing to deploy/);
    });
  }

  if (publisher.files.some((file) => mutableFiles.includes(file))) {
    test(`${publisher.name}: a mutable chunk's 412 is not an existing-version skip`, (t) => {
      const result = fixture(t, publisher).execute('412');
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.calls.at(-1).path, '/libs/console-plugin-min.js.gz');
    });
  }
}

test('GTM dry run does not send any S3 requests', (t) => {
  const publisher = publishers.find((publisher) => publisher.name === 'gtm-snippet');
  const result = fixture(t, publisher).execute('403', { DRY_RUN: 'true' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 0);
});
