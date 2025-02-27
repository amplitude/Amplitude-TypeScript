import { iife, umd } from '../../scripts/build/rollup.config';


import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import { terser } from 'rollup-plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { rollup } from 'rollup';
import path from 'node:path';

iife.input = umd.input;
iife.output.name = 'sessionReplay';

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

  iife.plugins = [...commonPlugins, ...iife.plugins];
  umd.plugins = [...commonPlugins, ...umd.plugins];

  return [iife, umd];
};
