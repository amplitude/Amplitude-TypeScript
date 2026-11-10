import * as path from 'path';
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  timeout: 30000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5185', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 5185 --strictPort',
    cwd: path.resolve(__dirname, '../..'),
    url: 'http://127.0.0.1:5185/session-replay-browser/sr-semantic-test.html',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
