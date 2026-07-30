import { esbuildPlugin } from '@web/dev-server-esbuild';
import { fromRollup } from '@web/dev-server-rollup';
import { playwrightLauncher } from '@web/test-runner-playwright';
import rollupCommonjs from '@rollup/plugin-commonjs';

const commonjs = fromRollup(rollupCommonjs);

/** @type {import('@web/test-runner').TestRunnerConfig} */
export default {
  files: ['integration/**/*.test.ts', 'integration/**/*.test.html'],
  nodeResolve: true,
  // Serve from the monorepo root so workspace packages resolve under pnpm.
  rootDir: '../..',
  browsers: [
    playwrightLauncher({ product: 'chromium' }),
    playwrightLauncher({ product: 'firefox' }),
    playwrightLauncher({ product: 'webkit' }),
  ],
  plugins: [
    esbuildPlugin({ ts: true }),
    // Convert CJS dependencies (e.g. zen-observable, safe-json-stringify) for the browser.
    commonjs({
      include: ['**/node_modules/**'],
    }),
  ],
};
