import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';

export default [
  {
    input: 'src/index.ts',
    output: {
      name: 'amplitude',
      file: 'lib/umd/amplitude.umd.js',
      format: 'umd',
      sourcemap: true,
    },
    plugins: [
      typescript({
        module: 'es6',
        noEmit: false,
        outDir: 'lib/umd',
        rootDir: 'src',
      }),
      resolve({
        browser: true,
      }),
      commonjs(),
    ],
  },
  {
    input: 'src/index.ts',
    output: {
      name: 'amplitude',
      file: 'lib/snippet/amplitude.js',
      format: 'iife',
      sourcemap: true,
    },
    plugins: [
      typescript({
        module: 'es6',
        noEmit: false,
        outDir: 'lib/script',
        rootDir: 'src',
      }),
      resolve({
        browser: true,
      }),
      commonjs(),
    ],
  },
  {
    input: 'src/browser-snippet.ts',
    output: {
      name: 'amplitude',
      file: 'lib/snippet/amplitude-snippet.js',
      format: 'iife',
      sourcemap: true,
    },
    plugins: [
      typescript({
        module: 'es6',
        noEmit: false,
        outDir: 'lib/snippet',
        rootDir: 'src',
      }),
      resolve({
        browser: true,
      }),
      commonjs(),
    ],
  },
];
