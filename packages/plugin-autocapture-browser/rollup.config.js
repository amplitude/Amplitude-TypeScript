import { iife, umd } from '../../scripts/build/rollup.config';

iife.input = umd.input;
iife.output.name = 'amplitudeAutocapturePlugin';


if (process.env.NODE_ENV === 'development') {
  iife.output.sourcemap = 'inline';
}
export default [umd, iife];
