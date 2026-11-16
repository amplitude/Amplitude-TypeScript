import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

// Local harness to replay captured event JSON with @amplitude/rrweb Replayer at
// exact meta viewport dimensions (no rrweb-player transform scaling).
export default defineConfig({
  root: here,
  appType: 'spa',
  server: {
    port: 5174,
    fs: {
      allow: [repoRoot],
    },
  },
});
