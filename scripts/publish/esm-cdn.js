const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * CDN objects are the gzip bytes, stored at a key that ends in `.js.gz`, and
 * served with `Content-Encoding: gzip`. Browsers request the URL in the import
 * specifier literally, so a relative import of `./index-min.js` looks for a
 * sibling that was never uploaded. The entry customers load
 * (`session-replay-browser-<version>-esm.js.gz`) therefore has to point at
 * sibling keys that end in `.js.gz`.
 *
 * Chunks are versioned in the filename. The objects are cached for a year, and
 * the standalone SDK and the browser plugin otherwise share names like
 * `index-min.js`.
 */

const FROM_OR_BARE_IMPORT = /((?:from|import)\s*)(["'])(\.{1,2}\/[^"']+?)\.js\2/g;
const DYNAMIC_IMPORT = /(import\s*\(\s*)(["'])(\.{1,2}\/[^"']+?)\.js\2(\s*\))/g;
const SPECIFIER_PATTERNS = [
  /(?:from|import)\s*(["'])(\.{1,2}\/[^"']+)\1/g,
  /import\s*\(\s*(["'])(\.{1,2}\/[^"']+)\1\s*\)/g,
];

function esmChunkFileNames(packageName, version) {
  if (!packageName || !version) {
    throw new Error('esmChunkFileNames requires a package name and version');
  }
  return `${packageName}-${version}-[name]-min.js`;
}

function rewriteEsmSpecifiersForCdn(code) {
  return code.replace(FROM_OR_BARE_IMPORT, '$1$2$3.js.gz$2').replace(DYNAMIC_IMPORT, '$1$2$3.js.gz$2$4');
}

function listRelativeSpecifiers(code) {
  const specifiers = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of code.matchAll(pattern)) {
      specifiers.push(match[2]);
    }
  }
  return specifiers;
}

function stripSourceMappingUrl(code) {
  return code.replace(/\n?\/\/# sourceMappingURL=\S+\s*$/g, '');
}

function resolveSpecifier(fromFile, specifier) {
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  if (resolved.startsWith('../') || resolved === '..' || path.posix.isAbsolute(resolved)) {
    throw new Error(`${fromFile} imports ${specifier}, which escapes the CDN directory`);
  }
  return resolved;
}

function cdnObjectName(filename, packageName, version) {
  const versionedPrefix = `${packageName}-${version}-`;
  const base = filename.startsWith(versionedPrefix)
    ? filename
    : filename.replace(packageName, `${packageName}-${version}`);
  return `${base}.gz`;
}

function readSourceGraph(scriptsDir, entryName) {
  const entryPath = path.join(scriptsDir, entryName);
  if (!fs.existsSync(entryPath)) {
    throw new Error(`Missing ${entryName} in ${scriptsDir}. Build the package before publishing.`);
  }

  const sources = new Map();
  const queue = [entryName];
  const seen = new Set();
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (file.includes('/') || file.includes('\\')) {
      throw new Error(`ESM chunk ${file} is not a flat file; CDN imports are same-directory`);
    }
    const fullPath = path.join(scriptsDir, file);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`ESM bundle imports ${file}, but that file is not in ${scriptsDir}`);
    }
    const code = fs.readFileSync(fullPath, 'utf8');
    sources.set(file, code);
    for (const specifier of listRelativeSpecifiers(code)) {
      if (!specifier.endsWith('.js')) {
        throw new Error(`${file} imports ${specifier}; CDN publish only rewrites .js specifiers`);
      }
      queue.push(resolveSpecifier(file, specifier));
    }
  }
  return sources;
}

/**
 * Build the gzip bodies uploaded to `libs/`. The IIFE is uploaded unchanged.
 * ESM sources are rewritten so every relative import ends in `.js.gz` and names
 * the versioned object key.
 */
function prepareCdnAssets({ scriptsDir, name, version }) {
  if (!name || !version) {
    throw new Error('prepareCdnAssets requires a package name and version');
  }
  if (!fs.existsSync(scriptsDir)) {
    throw new Error(`Missing bundle directory ${scriptsDir}. Build the package before publishing.`);
  }

  const entryName = `${name}-esm.js`;
  const versionedPrefix = `${name}-${version}-`;
  const sources = readSourceGraph(scriptsDir, entryName);

  for (const file of sources.keys()) {
    if (file === entryName) continue;
    if (!file.startsWith(versionedPrefix) || !file.endsWith('.js')) {
      throw new Error(
        `ESM chunk ${file} is not versioned. chunkFileNames must be ${esmChunkFileNames(
          name,
          version,
        )} so CDN objects do not collide across releases.`,
      );
    }
  }

  const cdnNameBySource = new Map();
  for (const file of sources.keys()) {
    cdnNameBySource.set(file, cdnObjectName(file, name, version));
  }

  const assets = [];
  const cdnNames = new Set(cdnNameBySource.values());
  for (const [file, code] of sources) {
    const rewritten = stripSourceMappingUrl(rewriteEsmSpecifiersForCdn(code));
    const cdnName = cdnNameBySource.get(file);
    for (const specifier of listRelativeSpecifiers(rewritten)) {
      if (!specifier.endsWith('.js.gz')) {
        throw new Error(`${file} still imports ${specifier} after CDN rewrite`);
      }
      const resolved = resolveSpecifier(cdnName, specifier);
      if (!cdnNames.has(resolved)) {
        throw new Error(`${cdnName} imports ${specifier}, which is not part of the CDN upload`);
      }
    }
    assets.push({
      key: `libs/${cdnName}`,
      body: zlib.gzipSync(Buffer.from(rewritten, 'utf8'), { mtime: 0 }),
      rewritten: true,
    });
  }

  const iifeName = `${name}-${version}-min.js.gz`;
  const iifePath = path.join(scriptsDir, `${name}-min.js.gz`);
  if (!fs.existsSync(iifePath)) {
    throw new Error(`Missing ${name}-min.js.gz in ${scriptsDir}. Build the package before publishing.`);
  }
  assets.push({
    key: `libs/${iifeName}`,
    body: fs.readFileSync(iifePath),
    rewritten: false,
  });

  const keys = new Set();
  for (const asset of assets) {
    if (keys.has(asset.key)) {
      throw new Error(`Duplicate CDN key ${asset.key}`);
    }
    keys.add(asset.key);
  }

  assets.sort((left, right) => left.key.localeCompare(right.key));
  return assets;
}

module.exports = {
  esmChunkFileNames,
  listRelativeSpecifiers,
  prepareCdnAssets,
  rewriteEsmSpecifiersForCdn,
};
