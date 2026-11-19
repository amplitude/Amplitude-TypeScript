/**
 * The CDN serves gzip bytes at keys ending in `.js.gz` with Content-Encoding: gzip.
 * This loads the publish payload the same way and checks the module graph evaluates.
 */
import { createRequire } from 'module';
import http from 'http';
import path from 'path';
import { gunzipSync } from 'zlib';
import { expect, test } from '@playwright/test';

const load = createRequire(__filename);
const { listRelativeSpecifiers, prepareCdnAssets } = load('../../../scripts/publish/esm-cdn.js') as {
  listRelativeSpecifiers: (code: string) => string[];
  prepareCdnAssets: (options: { scriptsDir: string; name: string; version: string }) => Array<{
    key: string;
    body: Buffer;
    rewritten: boolean;
  }>;
};

const PACKAGE_NAME = 'session-replay-browser';
const EXPORTS = [
  'init',
  'setSessionId',
  'getSessionId',
  'getSessionReplayProperties',
  'flush',
  'start',
  'stop',
  'shutdown',
  'evaluateTargetingAndCapture',
  'SafeLoggerProvider',
];

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        resolve(address.port);
      } else {
        reject(new Error('CDN test server is missing a port'));
      }
    });
  });
}

test('ESM CDN bundle evaluates and exposes the public API', async ({ page }) => {
  const { version } = load('../package.json') as { version: string };
  const assets = prepareCdnAssets({
    scriptsDir: path.join(__dirname, '../lib/scripts'),
    name: PACKAGE_NAME,
    version,
  });
  const byKey = new Map(assets.map((asset) => [asset.key, asset.body]));
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!doctype html><title>esm</title>');
      return;
    }
    const body = byKey.get(decodeURIComponent(url.pathname.replace(/^\//, '')));
    if (!body) {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end(`missing ${url.pathname}`);
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Content-Encoding': 'gzip',
      'Access-Control-Allow-Origin': '*',
    });
    response.end(body);
  });

  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  const failures: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failures.push(`${response.status()} ${response.url()}`);
    }
  });

  try {
    await page.goto(`${origin}/`);
    const entryUrl = `${origin}/libs/${PACKAGE_NAME}-${version}-esm.js.gz`;
    const chunkUrls = new Set<string>();
    for (const asset of assets) {
      if (!asset.rewritten) continue;
      const code = gunzipSync(asset.body).toString('utf8');
      const base = `${origin}/${asset.key}`;
      for (const specifier of listRelativeSpecifiers(code)) {
        chunkUrls.add(new URL(specifier, base).href);
      }
    }

    const types = await page.evaluate(
      async ({ entry, chunks, names }) => {
        const mod = (await import(entry)) as Record<string, unknown>;
        for (const chunk of chunks) {
          await import(chunk);
        }
        const report: Record<string, string> = {};
        for (const name of names) {
          report[name] = typeof mod[name];
        }
        return report;
      },
      { entry: entryUrl, chunks: [...chunkUrls], names: EXPORTS },
    );

    expect(failures).toEqual([]);
    for (const name of EXPORTS) {
      expect(types[name]).toBe('function');
    }
  } finally {
    await new Promise((resolve) => server.close(() => resolve(undefined)));
  }
});
