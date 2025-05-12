import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import gzip from 'rollup-plugin-gzip';
import { terser } from 'rollup-plugin-terser';

// Configure ESM build
const esm = {
  input: 'src/index.ts',
  output: {
    dir: 'lib/scripts',
    format: 'es',
    sourcemap: true,
    entryFileNames: 'segment-session-replay-wrapper-esm.js',
    chunkFileNames: '[name]-min.js',
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
          'src/*': ['src/*'],
        },
      },
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
  ],
};

export default [esm];
