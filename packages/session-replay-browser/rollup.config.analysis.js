import { visualizer } from 'rollup-plugin-visualizer';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import { terser } from 'rollup-plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { rollup } from 'rollup';
import path from 'node:path';
import commonjs from '@rollup/plugin-commonjs';

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
        compilerOptions: {
          target: 'es2015',
          module: 'es2020',
          moduleResolution: 'node',
          downlevelIteration: true,
          declaration: false,
          declarationMap: false,
          baseUrl: '.',
          paths: {
            'src/*': ['src/*']
          }
        }
      }),
      terser(),
    ],
  });

  const { output } = await bundle.generate({
    format: 'iife',
    name: 'WebWorker',
    inlineDynamicImports: true,
    sourcemap: true
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

// Bundle analysis configuration with detailed treemap and statistics
const analysisConfig = {
  input: 'src/session-replay.ts',
  output: {
    format: 'iife',
    file: 'lib/analysis/session-replay-browser-analysis.js',
    name: 'sessionReplay',
    sourcemap: true,
    inlineDynamicImports: true
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
        outDir: 'lib/analysis',
        baseUrl: '.',
        paths: {
          'src/*': ['src/*']
        }
      }
    }),
    resolve({
      browser: true,
    }),
    commonjs(),
    // Generate detailed bundle analysis
    visualizer({
      filename: 'lib/analysis/bundle-analysis.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
      sourcemap: true,
      title: 'Session Replay Browser Bundle Analysis',
      template: 'treemap', // treemap, sunburst, network
    }),
    // Generate JSON stats for programmatic analysis
    visualizer({
      filename: 'lib/analysis/bundle-stats.json',
      json: true,
      gzipSize: true,
      brotliSize: true,
      sourcemap: true,
    }),
    terser({
      output: {
        comments: false,
      },
    }),
  ]
};

export default async () => {
  const commonPlugins = await webWorkerPlugins();
  analysisConfig.plugins = [...commonPlugins, ...analysisConfig.plugins];
  return [analysisConfig];
}; 