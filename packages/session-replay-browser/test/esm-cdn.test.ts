import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { gunzipSync } from 'zlib';

const load = createRequire(__filename);
const { listRelativeSpecifiers, prepareCdnAssets, rewriteEsmSpecifiersForCdn } = load(
  '../../../scripts/publish/esm-cdn.js',
) as {
  listRelativeSpecifiers: (code: string) => string[];
  prepareCdnAssets: (options: { scriptsDir: string; name: string; version: string }) => Array<{
    key: string;
    body: Buffer;
    rewritten: boolean;
  }>;
  rewriteEsmSpecifiersForCdn: (code: string) => string;
};

const PACKAGE_NAME = 'session-replay-browser';
const VERSION = '1.2.3';

function writeBundle(dir: string, files: Record<string, string | Buffer>) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), contents);
  }
}

function gunzipAsset(asset: { body: Buffer }) {
  return gunzipSync(asset.body).toString('utf8');
}

function assetByKey<T extends { key: string }>(assets: T[], key: string): T {
  const asset = assets.find((item) => item.key === key);
  if (!asset) {
    throw new Error(`missing ${key}`);
  }
  return asset;
}

describe('rewriteEsmSpecifiersForCdn', () => {
  test('points relative imports at the gzip object key', () => {
    const source = [
      'export{i as init}from"./session-replay-browser-1.2.3-index-min.js";import"./session-replay-browser-1.2.3-targeting-min.js";',
      'const load=()=>import("./session-replay-browser-1.2.3-rrweb-record-min.js");',
      'import { record } from "https://cdn.example.com/record.js";',
      '//# sourceMappingURL=session-replay-browser-esm.js.map',
    ].join('');

    const rewritten = rewriteEsmSpecifiersForCdn(source);

    expect(rewritten).toContain('from"./session-replay-browser-1.2.3-index-min.js.gz"');
    expect(rewritten).toContain('import"./session-replay-browser-1.2.3-targeting-min.js.gz"');
    expect(rewritten).toContain('import("./session-replay-browser-1.2.3-rrweb-record-min.js.gz")');
    expect(rewritten).toContain('from "https://cdn.example.com/record.js"');
    expect(rewritten).not.toContain('from"./session-replay-browser-1.2.3-index-min.js"');
    expect(listRelativeSpecifiers(rewritten)).toEqual([
      './session-replay-browser-1.2.3-index-min.js.gz',
      './session-replay-browser-1.2.3-targeting-min.js.gz',
      './session-replay-browser-1.2.3-rrweb-record-min.js.gz',
    ]);
  });

  test('does not append a second .gz', () => {
    const once = rewriteEsmSpecifiersForCdn('import"./chunk.js";');
    expect(rewriteEsmSpecifiersForCdn(once)).toBe(once);
    expect(once).toBe('import"./chunk.js.gz";');
  });
});

describe('prepareCdnAssets', () => {
  let scriptsDir = '';

  beforeEach(() => {
    scriptsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'esm-cdn-'));
  });

  afterEach(() => {
    fs.rmSync(scriptsDir, { recursive: true, force: true });
  });

  test('rejects the published facade that imports a missing index chunk', () => {
    writeBundle(scriptsDir, {
      'session-replay-browser-esm.js':
        'export{i as init}from"./index-min.js";import"./targeting-min.js";\n//# sourceMappingURL=session-replay-browser-esm.js.map\n',
      'session-replay-browser-min.js.gz': Buffer.from('iife'),
    });

    expect(() => prepareCdnAssets({ scriptsDir, name: PACKAGE_NAME, version: VERSION })).toThrow(/is not in/);
  });

  test('uploads a closed, versioned gzip graph', () => {
    writeBundle(scriptsDir, {
      'session-replay-browser-esm.js':
        'export{i as init}from"./session-replay-browser-1.2.3-index-min.js";import"./session-replay-browser-1.2.3-targeting-min.js";\n//# sourceMappingURL=session-replay-browser-esm.js.map\n',
      'session-replay-browser-1.2.3-index-min.js':
        'import{e as t}from"./session-replay-browser-1.2.3-targeting-min.js";export const init=()=>import("./session-replay-browser-1.2.3-rrweb-record-min.js");\n',
      'session-replay-browser-1.2.3-targeting-min.js': 'export const e=1;\n',
      'session-replay-browser-1.2.3-rrweb-record-min.js': 'export const record=()=>{};\n',
      'session-replay-browser-min.js.gz': Buffer.from('iife-gzip'),
    });

    const assets = prepareCdnAssets({ scriptsDir, name: PACKAGE_NAME, version: VERSION });
    const keys = assets.map((asset) => asset.key);

    expect(keys).toEqual([
      'libs/session-replay-browser-1.2.3-esm.js.gz',
      'libs/session-replay-browser-1.2.3-index-min.js.gz',
      'libs/session-replay-browser-1.2.3-min.js.gz',
      'libs/session-replay-browser-1.2.3-rrweb-record-min.js.gz',
      'libs/session-replay-browser-1.2.3-targeting-min.js.gz',
    ]);

    const entry = gunzipAsset(assetByKey(assets, 'libs/session-replay-browser-1.2.3-esm.js.gz'));
    expect(entry).toContain('as init');
    expect(entry).toContain('from"./session-replay-browser-1.2.3-index-min.js.gz"');
    expect(entry).not.toContain('sourceMappingURL');
    expect(assetByKey(assets, 'libs/session-replay-browser-1.2.3-min.js.gz').body.toString()).toBe('iife-gzip');

    const names = new Set(keys.map((key) => key.replace(/^libs\//, '')));
    for (const asset of assets.filter((item) => item.rewritten)) {
      const filename = asset.key.replace(/^libs\//, '');
      for (const specifier of listRelativeSpecifiers(gunzipAsset(asset))) {
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(filename), specifier));
        expect(names.has(resolved)).toBe(true);
      }
    }
  });
});

const builtEntry = path.join(__dirname, '../lib/scripts/session-replay-browser-esm.js');
(fs.existsSync(builtEntry) ? describe : describe.skip)('built session-replay ESM bundle', () => {
  test('prepares a CDN graph whose entry exports init', () => {
    const { version } = load('../package.json') as { version: string };
    const assets = prepareCdnAssets({
      scriptsDir: path.join(__dirname, '../lib/scripts'),
      name: PACKAGE_NAME,
      version,
    });
    const entry = assetByKey(assets, `libs/session-replay-browser-${version}-esm.js.gz`);
    const iife = assetByKey(assets, `libs/session-replay-browser-${version}-min.js.gz`);

    expect(iife.rewritten).toBe(false);
    const code = gunzipAsset(entry);
    expect(code).toContain('as init');
    expect(code).toContain(`session-replay-browser-${version}-`);
    expect(code).toContain('.js.gz"');
    expect(code).not.toContain('from"./index-min.js"');
  });
});
