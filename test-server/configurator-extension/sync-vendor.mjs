// Copies the SDK bundles this extension injects out of packages/, and works around Chromium's stricter
// idea of UTF-8 on the way. Adjacent `.map` files come along so DevTools can unminify the injected
// scripts — the bundles already end in `//# sourceMappingURL=<basename>.map`.
//
// Chromium loads content script files through base::IsStringUTF8, which rejects Unicode non-characters
// as well as malformed sequences. The session replay bundle carries four literal U+FFFE characters —
// PostCSS comparing a string's first character against a byte order mark — so Chrome refuses the whole
// file with "It isn't UTF-8 encoded". Escaping those code points is semantically identical inside the
// string and regex literals they appear in, and leaves the rest of the bundle untouched. The map is
// left alone: it isn't loaded as a content script, and rewriting the escaped offsets isn't worth it
// for four characters.
//
// Run from the repository root: node test-server/configurator-extension/sync-vendor.mjs
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const PACKAGES = path.resolve(HERE, '../../packages');
const VENDOR = path.join(HERE, 'vendor');

const BUNDLES = [
  'analytics-browser/lib/scripts/amplitude-min.js',
  'plugin-session-replay-browser/lib/scripts/plugin-session-replay-browser-min.js',
];

// Non-characters: U+FDD0–U+FDEF and the last two code points of every plane.
const REJECTED = /[\uFDD0-\uFDEF\uFFFE\uFFFF]/g;

await mkdir(VENDOR, { recursive: true });

for (const bundle of BUNDLES) {
  const source = path.join(PACKAGES, bundle);
  const name = path.basename(bundle);
  let code;
  try {
    code = await readFile(source, 'utf8');
  } catch {
    console.error(`Missing ${bundle}. Build the package first, then run this again.`);
    process.exitCode = 1;
    continue;
  }
  let escaped = 0;
  const output = code.replace(REJECTED, (character) => {
    escaped += 1;
    return `\\u${character.codePointAt(0).toString(16)}`;
  });
  await writeFile(path.join(VENDOR, name), output);
  console.log(`${name}: ${output.length} chars${escaped ? `, escaped ${escaped} non-characters` : ''}`);

  const mapName = `${name}.map`;
  const mapSource = `${source}.map`;
  try {
    await copyFile(mapSource, path.join(VENDOR, mapName));
    console.log(`${mapName}: copied`);
  } catch {
    console.error(`Missing ${bundle}.map. Build the package first, then run this again.`);
    process.exitCode = 1;
  }
}
