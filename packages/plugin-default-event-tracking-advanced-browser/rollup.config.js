import { iife, umd } from '../../scripts/build/rollup.config';

iife.input = umd.input;
iife.output.name = 'amplitudeAutoTrackingPlugin';

export default [umd, iife];
