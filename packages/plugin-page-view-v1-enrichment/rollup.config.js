import { iife, umd } from '../../scripts/build/rollup.config';

iife.input = umd.input;
iife.output.name = 'amplitudePageViewV1EnrichmentPlugin';

export default [umd, iife];
