import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';
import gzip from 'rollup-plugin-gzip';
import execute from 'rollup-plugin-execute';
import { exec } from 'child_process';

const amplitudeSnippet = () => {
  return {
    name: 'amplitude-snippet',
    options: (opt) => {
      return new Promise((resolve) => {
        opt.input = 'generated/amplitude-snippet.js';
        if (!process.env.CI) return resolve(opt);
        exec('node scripts/version/create-snippet.js', (err) => {
          if (err) {
            throw err;
          }
          resolve(opt);
        });
      });
    },
  };
};

const umd = [
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
    input: 'src/snippet-index.ts',
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

const snippet = [
  {
    output: {
      name: 'amplitude',
      file: 'lib/scripts/amplitude-snippet-min.js',
      format: 'iife',
    },
    plugins: [
      amplitudeSnippet(),
      terser(),
      execute('node scripts/version/create-snippet-instructions.js'),
      execute('node scripts/version/update-readme.js'),
    ],
  },
];

export default [...umd, ...iife, ...snippet];
