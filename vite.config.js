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
function htmlEntriesPlugin(pattern = '**/*.html', { cwd }) {
  return {
    name: 'vite-html-entries',
    config: () => ({
      build: {
        rollupOptions: {
          input: Object.fromEntries(
            require('fast-glob').sync(pattern, { cwd }).map(f => [
              f.replace(/\.html$/, ''),              // key without “.html”
              require('path').join(cwd, f)           // absolute file path
            ])
          )
        }
      }
    })
  };
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
    host: process.env.SSH ? 'local.website.com' : undefined,
    https: process.env.SSH ? {
      key: fs.readFileSync(path.resolve(process.env.HOME, 'certs/local-website/key.pem')),
      cert: fs.readFileSync(path.resolve(process.env.HOME, 'certs/local-website/cert.pem')),
    } : undefined,
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
  plugins: [
    htmlEntriesPlugin('**/*.html', { cwd: path.resolve(__dirname, 'test-server') })
  ],
});
