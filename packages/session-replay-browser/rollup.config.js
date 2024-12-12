import { iife, umd } from '../../scripts/build/rollup.config';

import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import { rollup } from 'rollup';

iife.input = umd.input;
iife.output.name = 'sessionReplay';

async function buildWebWorker() {
  console.log('building wworker');
  const bundle = await rollup({
    input: 'src/worker/compression.ts',
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
      // terser(),
    ],
  });

  const { output } = await bundle.generate({
    format: 'iife',
    name: 'WebWorker',
    inlineDynamicImports: true,
  });
  const webWorkerCodeIife = output[0].code;

  const { output: outputUmd } = await bundle.generate({
    format: 'iife',
    name: 'WebWorker',
    inlineDynamicImports: true,
  });
  const webWorkerCodeUmd = outputUmd[0].code;

  console.log('webworker done!', output.length);

  return { iifeWorker: webWorkerCodeIife, umdWorker: webWorkerCodeUmd };
}

// export default [umd];

export default async () => {
  const { iifeWorker, umdWorker } = await buildWebWorker();

  const commonPlugins = [
    replace({
      preventAssignment: true,
      values: {
        'replace.WEBWORKER_BODY': JSON.stringify('hello, world'),
      },
    }),
  ];

  iife.plugins = [
    replace({
      preventAssignment: true,
      values: {
        'replace.WEBWORKER_BODY': JSON.stringify(iifeWorker),
      },
    }),
    ...iife.plugins,
  ];

  umd.plugins = [
    replace({
      preventAssignment: true,
      values: {
        'replace.WEBWORKER_BODY': JSON.stringify(umdWorker),
      },
    }),
    ...umd.plugins,
  ];

  return [iife, umd];
};
