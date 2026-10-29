import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, '../..');
const packagesDir = path.join(repoRoot, 'packages');
const alias = Object.fromEntries(
  fs.readdirSync(packagesDir).map((name) => [`@amplitude/${name}`, path.join(packagesDir, name)]),
);

export default defineConfig({
  root,
  appType: 'spa',
  // Full-page reloads keep the SDK instances and history observers from stacking during edits.
  esbuild: { jsx: 'automatic' },
  resolve: { alias },
  server: { host: '127.0.0.1', port: 5174, strictPort: true, fs: { allow: [repoRoot] } },
});
