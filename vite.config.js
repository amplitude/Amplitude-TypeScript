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

function gzipServePlugin() {
  return {
    name: 'gzip-serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.endsWith('.gz')) {
          // Set Content-Encoding header for gzip files
          res.setHeader('Content-Encoding', 'gzip');
          
          // Determine the original content type by removing .gz extension
          const originalPath = req.url.replace(/\.gz$/, '');
          if (originalPath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
          } else if (originalPath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
          } else if (originalPath.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
          } else if (originalPath.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json');
          } else {
            res.setHeader('Content-Type', 'application/octet-stream');
          }
          
          // Add Vary header to indicate that the response varies by Accept-Encoding
          res.setHeader('Vary', 'Accept-Encoding');
        }
        next();
      });
    }
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
  publicDir: packagesDir,
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
  preview: {
    port: 5173,
    host: true,
  },
  plugins: [
    htmlEntriesPlugin('**/*.html', { cwd: path.resolve(__dirname, 'test-server') }),
    gzipServePlugin(),
    fileListingPlugin(),
    createMockApi(),
    compression()
  ],
});
