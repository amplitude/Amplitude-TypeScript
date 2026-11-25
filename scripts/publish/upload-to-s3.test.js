const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { gzipSync, gunzipSync } = require('node:zlib');

const repo = path.resolve(__dirname, '../..');
const publishers = [
  {
    name: 'analytics-browser',
    optionalFiles: true,
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
    optionalFiles: true,
    files: ['amplitude-min.js.gz', 'amplitude-min.js.map'],
    keys: ['plugin-stub-browser-2.0.0-min.js.gz', 'plugin-stub-browser-2.0.0-min.js.map'],
  },
  ...['plugin-autocapture-browser', 'plugin-network-capture-browser', 'targeting'].map((name) => ({
    name,
    optionalFiles: true,
    files: ['amplitude-min.js.gz', 'amplitude-min.js.map'],
    keys: [`${name}-2.0.0-min.js.gz`, `${name}-2.0.0-min.js.map`],
  })),
  {
    name: 'gtm-snippet',
    files: ['analytics-browser-gtm-wrapper.min.js.br'],
    keys: ['analytics-browser-gtm-wrapper-2.0.0.min.js.br'],
  },
  ...['session-replay-browser', 'plugin-session-replay-browser'].map((name) => ({
    name,
    esmGraph: true,
    files: [`${name}-esm.js`, `${name}-2.0.0-index-min.js`, `${name}-min.js.gz`],
    keys: [`${name}-2.0.0-esm.js.gz`, `${name}-2.0.0-index-min.js.gz`, `${name}-2.0.0-min.js.gz`],
  })),
  {
    name: 'segment-session-replay-plugin',
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
      version: publisher.name === 'gtm-snippet' ? '9.9.9' : '2.0.0',
    }),
  );
  // GTM derives its version from the sibling Browser package.
  if (publisher.name === 'gtm-snippet') {
    fs.mkdirSync(path.join(root, 'analytics-browser'));
    fs.writeFileSync(path.join(root, 'analytics-browser/package.json'), '{"version":"2.0.0"}');
  }
  for (const file of publisher.files) {
    const source = file.endsWith('-esm.js')
      ? `export { init } from "./${publisher.name}-2.0.0-index-min.js";`
      : 'export const init = () => {};';
    const body = publisher.esmGraph ? (file.endsWith('.gz') ? gzipSync(`artifact:${file}`) : source) : `artifact:${file}`;
    fs.writeFileSync(path.join(artifacts, file), body);
  }
  // Execute the command actually wired into each package, so stale paths fail.
  const manifest = require(path.join(repo, 'packages', publisher.name, 'package.json'));
  const command = manifest.scripts['publish:s3'] || manifest.scripts.publish;
  const match = /^node (.+)$/.exec(command);
  assert.ok(match, `Expected a direct uploader command for ${publisher.name}: ${command}`);
  const script = path.resolve(repo, 'packages', publisher.name, match[1]);
  assert.equal(script, path.join(repo, 'scripts/publish/upload-to-s3.js'));
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
            body: Buffer.from(request.body).toString('base64'),
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
    removeFile(file) {
      fs.unlinkSync(path.join(artifacts, file));
    },
    execute(response = '200', env = {}) {
      const result = spawnSync(process.execPath, ['--require', preload, script], {
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
    assert.ok(result.stdout.includes(`Deployed ${publisher.files.length}/${publisher.files.length} files.`));
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
      const body = Buffer.from(call.body, 'base64');
      if (publisher.esmGraph) {
        const source = gunzipSync(body).toString();
        assert.equal(call.headers['if-none-match'], '*');
        if (file.endsWith('-esm.js')) {
          assert.equal(source, `export { init } from "./${publisher.name}-2.0.0-index-min.js.gz";`);
        } else {
          assert.equal(source, file.endsWith('.gz') ? `artifact:${file}` : 'export const init = () => {};');
        }
      } else {
        assert.equal(body.toString(), `artifact:${file}`);
      }
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

  if (publisher.optionalFiles) {
    test(`${publisher.name}: missing optional bundles and maps are skipped`, (t) => {
      const f = fixture(t, publisher);
      for (const file of publisher.files) f.removeFile(file);
      const result = f.execute();
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.calls.length, 0);
      assert.match(result.stdout, /not found. Skipping/);
      assert.match(result.stdout, /Nothing to deploy/);
    });
  } else {
    test(`${publisher.name}: a missing required artifact fails before uploading`, (t) => {
      const f = fixture(t, publisher);
      f.removeFile(publisher.files[0]);
      const result = f.execute();
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, publisher.esmGraph ? /Missing.*Build the package/ : /ENOENT/);
      assert.equal(result.calls.length, 0);
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

test('GTM dry run still requires the built wrapper', (t) => {
  const publisher = publishers.find((publisher) => publisher.name === 'gtm-snippet');
  const f = fixture(t, publisher);
  f.removeFile(publisher.files[0]);
  const result = f.execute('403', { DRY_RUN: 'true' });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /ENOENT/);
  assert.equal(result.calls.length, 0);
});
