import { umd } from '../../scripts/build/rollup.config';

// Disable dynamic imports to avoid issues with the session replay browser
export default [{
    ...umd,
    inlineDynamicImports: true,
}];
