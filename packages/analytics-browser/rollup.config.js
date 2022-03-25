import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';
import gzip from 'rollup-plugin-gzip';

const umd = [
  // bundle
  {
    input: 'src/index.ts',
    output: {
      name: 'amplitude',
      file: 'lib/scripts/amplitude-min.umd.js',
      format: 'umd',
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
      terser(),
      gzip(),
    ],
  },
];

const iife = [
  {
    input: 'src/index.ts',
    output: {
      name: 'amplitude',
      file: 'lib/scripts/amplitude-min.js',
      format: 'iife',
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
      terser(),
      gzip(),
    ],
  },
];

export default [...umd, ...iife];
