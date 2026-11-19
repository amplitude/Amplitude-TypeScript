import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { gunzipSync } from 'zlib';

const load = createRequire(__filename);
const { prepareCdnAssets } = load('../../../scripts/publish/esm-cdn.js') as {
  prepareCdnAssets: (options: { scriptsDir: string; name: string; version: string }) => Array<{
    key: string;
    body: Buffer;
    rewritten: boolean;
  }>;
};

function assetByKey<T extends { key: string }>(assets: T[], key: string): T {
  const asset = assets.find((item) => item.key === key);
  if (!asset) {
    throw new Error(`missing ${key}`);
  }
  return asset;
}

const builtEntry = path.join(__dirname, '../lib/scripts/plugin-session-replay-browser-esm.js');
(fs.existsSync(builtEntry) ? describe : describe.skip)('built plugin ESM bundle', () => {
  test('prepares a CDN graph whose entry exports sessionReplayPlugin', () => {
    const { version } = load('../package.json') as { version: string };
    const assets = prepareCdnAssets({
      scriptsDir: path.join(__dirname, '../lib/scripts'),
      name: 'plugin-session-replay-browser',
      version,
    });
    const entry = assetByKey(assets, `libs/plugin-session-replay-browser-${version}-esm.js.gz`);

    expect(entry.rewritten).toBe(true);
    const code = gunzipSync(entry.body).toString('utf8');
    expect(code).toContain('as sessionReplayPlugin');
    expect(code).toContain('.js.gz"');
    expect(code).not.toContain('from"./index-min.js"');
    expect(assets.some((asset) => asset.key === `libs/plugin-session-replay-browser-${version}-min.js.gz`)).toBe(true);
  });
});
