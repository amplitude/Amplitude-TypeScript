import path from 'path';
import { defineConfig } from '@playwright/test';
import baseConfig from '../../playwright.config';

export default defineConfig({
  ...baseConfig,
  testMatch: '**/e2e/**/*.spec.ts',
  testIgnore: [],
  reporter: [['json', { outputFile: 'e2e/results.json' }]],
  webServer: {
    command: 'pnpm exec vite dev --port 5173 --clearScreen=false',
    cwd: path.resolve(__dirname, '../..'),
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
