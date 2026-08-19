import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

// Dedicated vite config for the Targeted Recording (TRC) e2e harness. Kept separate from the shared
// test-server config so its `@amplitude/*` alias strategy can differ without affecting the other
// test pages.
//
// Two build modes, selected by the SR_MODE env var (see root package.json scripts):
//   - local (default, `pnpm dev:trc`): every @amplitude/* import resolves to the workspace build in
//     packages/*. Pair with the watch task so edits rebuild.
//   - npm (`pnpm dev:trc:npm`): the two app-facing imports resolve to the published packages
//     installed under the `*-srnpm` npm: aliases (pinned in root package.json); the plugin's
//     transitive deps (session-replay-browser, targeting, analytics-core, ...) then resolve from
//     that published package's own node_modules — i.e. a true published-artifact test.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const packagesDir = path.join(repoRoot, 'packages');
const nodeModules = path.join(repoRoot, 'node_modules');

const SR_MODE = process.env.SR_MODE === 'npm' ? 'npm' : 'local';

const localAliases = {
  '@amplitude/analytics-browser': path.join(packagesDir, 'analytics-browser'),
  '@amplitude/plugin-session-replay-browser': path.join(packagesDir, 'plugin-session-replay-browser'),
  '@amplitude/session-replay-browser': path.join(packagesDir, 'session-replay-browser'),
  '@amplitude/targeting': path.join(packagesDir, 'targeting'),
  '@amplitude/analytics-core': path.join(packagesDir, 'analytics-core'),
};

const npmAliases = {
  '@amplitude/analytics-browser': path.join(nodeModules, '@amplitude/analytics-browser-srnpm'),
  '@amplitude/plugin-session-replay-browser': path.join(nodeModules, '@amplitude/plugin-session-replay-browser-srnpm'),
};

export default defineConfig({
  root: here,
  appType: 'spa', // serve index.html for react-router deep links
  define: {
    // Surfaced in the harness UI so it's obvious which mode is live.
    'import.meta.env.SR_MODE': JSON.stringify(SR_MODE),
  },
  resolve: {
    alias: SR_MODE === 'npm' ? npmAliases : localAliases,
  },
  server: {
    port: 5173,
    fs: {
      // Allow serving the workspace packages (local mode) and root node_modules (npm mode).
      allow: [repoRoot],
    },
  },
  plugins: [react()],
});
