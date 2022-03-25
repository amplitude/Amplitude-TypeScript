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
        browser: true,
      }),
      commonjs(),
    ],
  },
  // minify and compress
  {
    input: 'lib/scripts/amplitude.umd.js',
    output: {
      file: 'lib/scripts/amplitude-min.umd.js',
    },
    plugins: [terser(), gzip()],
  },
];

const iife = [
  // bundle
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
        browser: true,
      }),
      commonjs(),
    ],
  },
  // minify and compress
  {
    input: 'lib/scripts/amplitude.js',
    output: {
      file: 'lib/scripts/amplitude-min.js',
    },
    plugins: [terser(), gzip()],
  },
];

export default [...umd, ...iife];
