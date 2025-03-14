import { iife, umd } from '../../scripts/build/rollup.config';

import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import { terser } from 'rollup-plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { rollup } from 'rollup';
import path from 'node:path';
import commonjs from '@rollup/plugin-commonjs';

iife.input = umd.input;
iife.output.name = 'sessionReplay';
iife.output.inlineDynamicImports = true;
umd.output.inlineDynamicImports = true;

// Update main bundle configuration to exclude console plugin
const mainBundleConfig = {
  ...iife,
  external: ['@amplitude/rrweb-plugin-console-record'],
  plugins: [
    ...iife.plugins,
    resolve({
      browser: true,
      preferBuiltins: true,
      // Exclude the console plugin from being bundled
      exclude: ['@amplitude/rrweb-plugin-console-record'],
    }),
    commonjs({
      include: /node_modules/,
      // Exclude the console plugin from being bundled
      exclude: ['@amplitude/rrweb-plugin-console-record'],
    }),
  ],
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
        // no need to output types
        declaration: false,
        declarationMap: false,
      }),
      terser(),
    ],
  });

  const { output } = await bundle.generate({
    format: 'iife',
    name: 'WebWorker',
    inlineDynamicImports: true,
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
  umd.plugins = [...commonPlugins, ...umd.plugins];

  return [mainBundleConfig, umd];
};
