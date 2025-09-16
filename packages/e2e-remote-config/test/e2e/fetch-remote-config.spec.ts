import { test, expect } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, no-restricted-globals */

// parse query params
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

    // open the page with parameters to define version, api key and server zone
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
    expect(body.configs.analyticsSDK).toBeDefined();

    // perform an interaction on the page to confirm it's still interactable
    const interactiveButton = page.locator('#interactive-button');
    const interactiveContent = page.locator('#interactive-content');
    await expect(interactiveContent).toHaveText('This is the interactive section.');
    await interactiveButton.click();
    await expect(interactiveContent).toHaveText('Interactive content has been changed.');
  });
});
