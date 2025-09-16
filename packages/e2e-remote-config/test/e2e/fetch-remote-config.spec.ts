import { test, expect } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, no-restricted-globals */

const remoteConfigUrl = 'https://sr-client-cfg.amplitude.com/';
const amplitudeVersion = process.env.AMPLITUDE_VERSION;
const apiKey = process.env.API_KEY;
const serverZone = process.env.SERVER_ZONE || 'US';

let redirectedServerUrl = null;
if (serverZone === 'STAGING') {
  redirectedServerUrl = 'https://sr-client-cfg.stag2.amplitude.com/';
} else if (serverZone === 'EU') {
  redirectedServerUrl = 'https://sr-client-cfg.eu.amplitude.com/';
}
console.log(`Redirecting to server URL: ${redirectedServerUrl}`);

if (redirectedServerUrl && !redirectedServerUrl?.endsWith('/')) {
  redirectedServerUrl += '/';
}

const LOCAL_SITE = 'http://localhost:5173';

test.describe(`Fetch remote config: remoteConfigUrl=${redirectedServerUrl} sdkVersion=${amplitudeVersion || 'latest'} apiKey=${apiKey || 'default'}`, () => {
  test('should fetch remote config', async ({ page }) => {
    // intercept the fetch request to the remote config
    let fullRemoteConfigUrl = remoteConfigUrl;
    await page.route(`${remoteConfigUrl}**`, async (route) => {
      if (redirectedServerUrl) {
        // edit the request to redirect to the redirectedServerUrl
        const request = route.request();
        const newUrl = request.url().replace(remoteConfigUrl, redirectedServerUrl);
        fullRemoteConfigUrl = newUrl;
        await route.continue({ url: newUrl });
      } else {
        fullRemoteConfigUrl = route.request().url();
        await route.continue();
      }
    });
    const responsePattern = redirectedServerUrl ? `${redirectedServerUrl}**` : `${remoteConfigUrl}**`;
    const fetchRemoteConfigPromise = page.waitForResponse(responsePattern);
    let queryParams: Record<string, string> = {};
    if (amplitudeVersion) {
      queryParams.amplitudeVersion = amplitudeVersion;
    }
    if (apiKey) {
      queryParams.apiKey = apiKey;
    }
    queryParams.serverZone = serverZone;
    await page.goto(`${LOCAL_SITE}/remote-config-test.html?${new URLSearchParams(queryParams).toString()}`);
    const response = await fetchRemoteConfigPromise;
    const body = await response.json();
    console.log('body', body);
    expect(body.configs.analyticsSDK).toBeDefined();
  });
});
