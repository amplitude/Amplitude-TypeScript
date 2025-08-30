import { test, expect } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, no-restricted-globals */

// TODO: make this settable via env variable
const remoteConfigUrl = 'https://sr-client-cfg.amplitude.com/config*';

const amplitudeVersion = process.env.AMPLITUDE_VERSION;
const apiKey = process.env.API_KEY;

test.describe(`Fetch remote config sdkVersion=${amplitudeVersion || 'latest'} apiKey=${apiKey || 'default'}`, () => {
  test('should fetch remote config', async ({ page }) => {
    // intercept the fetch request to the remote config
    await page.route(remoteConfigUrl, async (route) => {
      console.log('route', route);
      await route.continue();
    });
    
    const fetchRemoteConfigPromise = page.waitForResponse(remoteConfigUrl);
    let queryParams: Record<string, string> = {};
    if (amplitudeVersion) {
      queryParams.amplitudeVersion = amplitudeVersion;
    }
    if (apiKey) {
      queryParams.apiKey = apiKey;
    }
    await page.goto(`http://localhost:5173/remote-config-test.html?${new URLSearchParams(queryParams).toString()}`);
    const response = await fetchRemoteConfigPromise;
    const body = await response.json();
    expect(body.configs.analyticsSDK).toBeDefined();
  });
});
