import { createRequire } from 'node:module';
import { iife } from '../../scripts/build/rollup.config';
import { webWorkerPlugins } from '../session-replay-browser/rollup.config';
import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import gzip from 'rollup-plugin-gzip';

const require = createRequire(import.meta.url);
const { name: scopedName, version } = require('./package.json');
const { esmChunkFileNames } = require('../../scripts/publish/esm-cdn');
const packageName = scopedName.replace('@amplitude/', '');

// Configure ESM build
const esm = {
  input: 'src/index.ts',
  output: {
    dir: 'lib/scripts',
    format: 'es',
    sourcemap: true,
    entryFileNames: 'plugin-session-replay-browser-esm.js',
    // Versioned so the publish script can upload each chunk next to the entry
    // without colliding with another release or the standalone SDK.
    chunkFileNames: esmChunkFileNames(packageName, version),
    manualChunks: {
      'console-plugin': ['@amplitude/rrweb-plugin-console-record'],
      'rrweb-record': ['@amplitude/rrweb-record'],
    },
  },
};

// Configure legacy build
iife.input = 'src/index.ts';
iife.output = {
  ...iife.output,
  format: 'iife',
  file: 'lib/scripts/plugin-session-replay-browser-min.js',
  name: 'sessionReplay',
  sourcemap: true,
  inlineDynamicImports: true,
};

// Common plugins for both builds
const commonPlugins = [
  typescript({
    tsconfig: 'tsconfig.json',
    compilerOptions: {
      target: 'es2015',
      module: 'es2020',
      moduleResolution: 'node',
      downlevelIteration: true,
      declaration: false,
      declarationMap: false,
      outDir: 'lib/scripts',
      baseUrl: '.',
      paths: {
        'src/*': ['src/*'],
      },
    },
  }),
  resolve({
    browser: true,
  }),
  commonjs(),
  terser({
    output: {
      comments: false,
    },
  }),
  gzip(),
];

export default async () => {
  const webWorkerPluginsList = await webWorkerPlugins();

  esm.plugins = [...webWorkerPluginsList, ...commonPlugins];
  iife.plugins = [...webWorkerPluginsList, ...commonPlugins];

  return [esm, iife];
};
