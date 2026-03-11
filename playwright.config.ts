import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html'], ['github']] : 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: process.env.CI ? 'on' : 'on-first-retry',
    actionTimeout: 30000,
    navigationTimeout: 30000,
    ignoreHTTPSErrors: true,
    // Capture screenshot on failure
    screenshot: 'only-on-failure',
    // Record video for all tests in CI
    video: process.env.CI ? 'on' : 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // TODO: Get this working again
    // {
    //   name: 'firefox',
    //   use: {
    //     ...devices['Desktop Firefox'],
    //     launchOptions: {
    //       firefoxUserPrefs: {
    //         'network.http.connection-retry-timeout': 0,
    //         'network.http.max-connections-per-server': 10,
    //       },
    //     },
    //   },
    // },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'yarn start',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120000,
  },
  testMatch: '**/e2e/**/*.spec.ts',
  testIgnore: [
    '**/test-server/dist/**',
    // session-replay-browser e2e tests are local sanity checks only — not yet
    // wired into CI (requires a real remote config + SR API setup). Run manually
    // with `npx playwright test packages/session-replay-browser/e2e/`.
    '**/session-replay-browser/e2e/**',
  ],
  timeout: 30000,
});
