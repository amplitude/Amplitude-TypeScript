import { defineConfig } from '@playwright/test';
import baseConfig from '../../playwright.config';

export default defineConfig({
  ...baseConfig,
  testDir: './e2e',
  testMatch: 'guides-surveys.spec.ts',
  webServer: undefined,
});
