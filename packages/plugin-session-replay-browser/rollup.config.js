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
  const bundle = await rollup({
    input: path.join(__dirname, '../session-replay-browser/src/worker/compression.ts'),
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
  console.log(webWorkerCode);

  return webWorkerCode;
}

export default async () => {
  const { iifeWorker, umdWorker } = await buildWebWorker();

  iife.plugins = [
    replace({
      preventAssignment: true,
      values: {
        'replace.COMPRESSION_WEBWORKER_BODY': JSON.stringify(iifeWorker),
      },
    }),
    ...iife.plugins,
  ];

  umd.plugins = [
    replace({
      preventAssignment: true,
      values: {
        'replace.COMPRESSION_WEBWORKER_BODY': JSON.stringify(umdWorker),
      },
    }),
    ...umd.plugins,
  ];

  return [iife, umd];
};
