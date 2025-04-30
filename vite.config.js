// vite.config.js
import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

const packagesDir = path.resolve(__dirname, 'packages');
const testServerDir = path.resolve(__dirname, 'test-server');

const ignorePkg = (pkgName) => {
  return pkgName.startsWith('.') ||
    pkgName === 'analytics-browser-test' ||
    pkgName === 'analytics-node-test';
}

const amplitudeAliases = fs.readdirSync(packagesDir).reduce((aliases, pkgName) => {
  const fullPath = path.join(packagesDir, pkgName);
  if (ignorePkg(pkgName)) {
    return aliases;
  }
  const key = `@amplitude/${pkgName}`;
  aliases[key] = fullPath;
  return aliases;
}, {});

export default defineConfig({
  envDir: path.resolve(__dirname),
  root: testServerDir,
  resolve: {
    alias: amplitudeAliases
  },
  server: {
    fs: {
      allow: [
        packagesDir,
        testServerDir,
      ]
    },
    watch: {
      usePolling: true,
      interval: 100,
      ignored: ['**/node_modules/**', '**/dist/**'],
    },
  },
  optimizeDeps: {
  },
});
