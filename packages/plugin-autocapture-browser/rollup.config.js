import { iife, umd } from '../../scripts/build/rollup.config';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import typescript from '@rollup/plugin-typescript';
import gzip from 'rollup-plugin-gzip';

iife.input = umd.input;
iife.output.name = 'amplitudeAutocapturePlugin';

const backgroundCaptureBundleConfig = {
  input: 'src/background-capture-script.ts',
  output: {
    format: 'iife',
    file: 'lib/scripts/background-capture-min.js',
    name: 'amplitudeBackgroundCaptureBundle',
    sourcemap: true,
    inlineDynamicImports: true,
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


if (process.env.NODE_ENV === 'development') {
  iife.output.sourcemap = 'inline';
  backgroundCaptureBundleConfig.output.sourcemap = 'inline';
}
export default [umd, iife, backgroundCaptureBundleConfig];
