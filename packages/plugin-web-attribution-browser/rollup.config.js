import { umd, iife } from '../../scripts/build/rollup.config';

iife.input = umd.input;

export default [umd, iife];
