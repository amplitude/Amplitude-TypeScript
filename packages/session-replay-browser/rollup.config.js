import { iife, umd } from '../../scripts/build/rollup.config';

import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import { terser } from 'rollup-plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { rollup } from 'rollup';
import path from 'node:path';
import commonjs from '@rollup/plugin-commonjs';
import gzip from 'rollup-plugin-gzip';
import { visualizer } from 'rollup-plugin-visualizer';

// Configure ES module build for chunks
const esmConfig = {
  input: 'src/session-replay.ts',
  output: {
    dir: 'lib/scripts',
    format: 'es',
    sourcemap: true,
    entryFileNames: 'session-replay-browser-esm.js',
    chunkFileNames: '[name]-min.js',
    manualChunks: {
      'console-plugin': ['@amplitude/rrweb-plugin-console-record'],
      'rrweb-core': ['@amplitude/rrweb/rrweb-record'],
      'rrweb-utils': ['@amplitude/rrweb-types', '@amplitude/rrweb-utils'],
      'analytics-core': ['@amplitude/analytics-core'],
      'compression': ['@amplitude/rrweb-packer']
    }
  },
  external: (id) => {
    // Mark these as external for better tree shaking if they're not critical
    if (id.includes('@amplitude/rrweb-plugin-console-record')) {
      return false; // Keep this as a chunk for dynamic import
    }
    return false;
  },
  treeshake: {
    // Enhanced tree shaking options
    moduleSideEffects: false,
    propertyReadSideEffects: false,
    unknownGlobalSideEffects: false
  },
  plugins: [
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
          'src/*': ['src/*']
        }
      }
    }),
    resolve({
      browser: true,
      preferBuiltins: false,
      // Improve tree shaking
      exportConditions: ['import', 'module', 'default']
    }),
    commonjs({
      // Improve tree shaking for CJS modules
      ignoreDynamicRequires: false
    }),  
    terser({
      output: {
        comments: false,
      },
      // Enhanced minification for smaller bundles
      module: true,
      toplevel: true,
    }),
    gzip(),
    // Add bundle analyzer for development
    ...(process.env.ANALYZE ? [visualizer({
      filename: 'bundle-analysis.html',
      open: true,
      gzipSize: true,
      brotliSize: true
    })] : [])
  ]
};

// Keep original IIFE config for legacy browsers
const mainBundleConfig = {
  input: 'src/session-replay.ts',
  output: {
    format: 'iife',
    file: 'lib/scripts/session-replay-browser-min.js',
    name: 'sessionReplay',
    sourcemap: true,
    inlineDynamicImports: true
  },
  plugins: [
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
          'src/*': ['src/*']
        }
      }
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
  ]
};

async function buildWebWorker() {
  const input = path.join(path.dirname(new URL(import.meta.url).pathname), './src/worker/compression.ts');
  const bundle = await rollup({
    input,
    plugins: [
      resolve({
        browser: true,
      }),
      typescript({
        tsconfig: 'tsconfig.json',
        compilerOptions: {
          target: 'es2015',
          module: 'es2020',
          moduleResolution: 'node',
          downlevelIteration: true,
          declaration: false,
          declarationMap: false,
          baseUrl: '.',
          paths: {
            'src/*': ['src/*']
          }
        }
      }),
      terser(),
    ],
  });

  const { output } = await bundle.generate({
    format: 'iife',
    name: 'WebWorker',
    inlineDynamicImports: true,
    sourcemap: true
  });
  const webWorkerCode = output[0].code;

  return webWorkerCode;
}

export async function webWorkerPlugins() {
  return [
    replace({
      preventAssignment: true,
      values: {
        'replace.COMPRESSION_WEBWORKER_BODY': JSON.stringify(await buildWebWorker()),
      },
    }),
  ];
}

export default async () => {
  const commonPlugins = await webWorkerPlugins();
  mainBundleConfig.plugins = [...commonPlugins, ...mainBundleConfig.plugins];
  esmConfig.plugins = [...commonPlugins, ...esmConfig.plugins];
  return [mainBundleConfig, esmConfig];
};
