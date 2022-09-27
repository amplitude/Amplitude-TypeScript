import { umd, iife } from '../../scripts/build/rollup.config';

iife.input = umd.input;
iife.output.name = 'webAttribution';

export default [umd, iife];
