import path from 'path';
import { defineConfig } from '@playwright/test';
import baseConfig from '../../playwright.config';

// Use 5174 so the test server can coexist with a main-branch dev server on 5173.
const PORT = 5174;

export default defineConfig({
  ...baseConfig,
  testMatch: '**/e2e/**/*.spec.ts',
  testIgnore: [],
  reporter: [
    ['json', { outputFile: 'e2e/results.json' }],
    ['html', { open: 'never' }],
  ],
  use: {
    ...baseConfig.use,
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `pnpm exec vite dev --port ${PORT} --clearScreen=false`,
    cwd: path.resolve(__dirname, '../..'),
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
