import { umd, iife, createIife, snippet, iifeGTM, snippetGTM, bookmarklet } from '../../scripts/build/rollup.config';

const iifeLite = createIife('src/snippet-index-lite.ts', 'lib/scripts/amplitude-lite-min.js');

export default [umd, iife, iifeLite, snippet, iifeGTM, snippetGTM, bookmarklet];
