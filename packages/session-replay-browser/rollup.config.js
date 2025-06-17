import { iife, umd } from '../../scripts/build/rollup.config';

import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import { terser } from 'rollup-plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { rollup } from 'rollup';
import path from 'node:path';
import commonjs from '@rollup/plugin-commonjs';
import gzip from 'rollup-plugin-gzip';

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
      'rrweb-record': ['@amplitude/rrweb-record']
    }
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