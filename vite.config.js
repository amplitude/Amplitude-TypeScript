// vite.config.js
import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';
import glob from 'fast-glob';
import { createMockApi } from './test-server/mock-api.js';

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
              f.replace(/\.html$/, ''),              // key without ".html"
              require('path').join(cwd, f)           // absolute file path
            ])
          )
        }
      }
    })
  };
}

function fileListingPlugin() {
  return {
    name: 'file-listing',
    configureServer(server) {
      server.middlewares.use('/api/list-files', async (req, res) => {
        try {
          const files = await glob('**/*.html', {
            cwd: testServerDir,
            absolute: false,
            ignore: ['**/dist/**']
          });
          
          const fileList = files.map(file => ({
            name: path.basename(file, '.html'),
            path: '/' + file,
          }));

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(fileList));
        } catch (error) {
          console.error('Error listing files:', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Failed to list files' }));
        }
      });
    }
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
  publicDir: path.resolve(packagesDir, 'analytics-browser/generated'),
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
    htmlEntriesPlugin('**/*.html', { cwd: path.resolve(__dirname, 'test-server') }),
    fileListingPlugin(),
    createMockApi()
  ],
});
