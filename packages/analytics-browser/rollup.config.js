import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';

export default [
  {
    input: 'src/index.ts',
    output: {
      name: 'amplitude',
      file: 'lib/scripts/amplitude.umd.js',
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
        browser: true
      }),
      commonjs(),
    ],
  },
  {
    input: 'src/index.ts',
    output: {
      name: 'amplitude',
      file: 'lib/scripts/amplitude.js',
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
        browser: true
      }),
      commonjs(),
    ],
  },
  {
    input: 'lib/scripts/amplitude.umd.js',
    output: {
      file: 'lib/scripts/amplitude-min.umd.js',
    },
    plugins: [terser()],
  },
  {
    input: 'lib/scripts/amplitude.js',
    output: {
      file: 'lib/scripts/amplitude-min.js',
    },
    plugins: [terser()],
  }
];
