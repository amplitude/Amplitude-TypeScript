import { terser } from 'rollup-plugin-terser';
import gzip from 'rollup-plugin-gzip';

const snippet = [
  {
    input: 'output/amplitude-snippet.js',
    output: {
      name: 'amplitude',
      file: 'lib/scripts/amplitude-snippet-min.js',
      format: 'iife',
    },
    plugins: [terser(), gzip()],
  },
];

export default snippet;
