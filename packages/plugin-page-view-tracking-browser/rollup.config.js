import { umd, iife } from '../../scripts/build/rollup.config';

iife.input = umd.input;
iife.output.name = 'pageViewTracking';

export default [umd, iife];
