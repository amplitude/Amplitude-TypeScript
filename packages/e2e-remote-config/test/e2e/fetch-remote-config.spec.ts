import { test, expect } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, no-restricted-globals */

const remoteConfigUrl = 'https://sr-client-cfg.amplitude.com/';
const amplitudeVersion = process.env.AMPLITUDE_VERSION;
const apiKey = process.env.API_KEY;
let redirectedServerUrl = process.env.REMOTE_CONFIG_URL || '';

if (redirectedServerUrl && !redirectedServerUrl?.endsWith('/')) {
  redirectedServerUrl += '/';
}

const LOCAL_SITE = 'http://localhost:5173';

test.describe(`Fetch remote config sdkVersion=${amplitudeVersion || 'latest'} apiKey=${apiKey || 'default'}`, () => {
  test('should fetch remote config', async ({ page }) => {
    // intercept the fetch request to the remote config
    await page.route(`${remoteConfigUrl}**`, async (route) => {
      if (redirectedServerUrl) {
        // edit the request to redirect to the redirectedServerUrl
        const request = route.request();
        const newUrl = request.url().replace(remoteConfigUrl, redirectedServerUrl);
        await route.continue({ url: newUrl });
      } else {
        await route.continue();
      }
    });
    
    const fetchRemoteConfigPromise = page.waitForResponse(`${remoteConfigUrl}*`);
    let queryParams: Record<string, string> = {};
    if (amplitudeVersion) {
      queryParams.amplitudeVersion = amplitudeVersion;
    }
    if (apiKey) {
      queryParams.apiKey = apiKey;
    }
    // TODO: parameterize this
    queryParams.serverZone = 'STAGING';
    await page.goto(`${LOCAL_SITE}/remote-config-test.html?${new URLSearchParams(queryParams).toString()}`);
    const response = await fetchRemoteConfigPromise;
    const body = await response.json();
    expect(body.configs.analyticsSDK).toBeDefined();
  });
});
