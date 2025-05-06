import { umd } from '../../scripts/build/rollup.config';

export default [{
    ...umd,
    inlineDynamicImports: true,
}];
