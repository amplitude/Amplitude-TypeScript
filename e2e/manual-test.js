// Headed Playwright session: proxy publisher pages to load local Amplitude bundles (see test-server README + pnpm dev:ssh).
import { chromium } from 'playwright';

// Get URL from command line args
const targetUrl = process.argv[2];

if (!targetUrl) {
  console.error('Usage: node ./e2e/manual-test.js <website-url>');
  console.error('Example: node ./e2e/manual-test.js https://example.com');
  process.exit(1);
}

// Integrity Hashes to rip out
// (why: proxying fails if the integrity hash is present so just remove them
// from all HTML and JS responses for testing only)
// when you encounter a new integrity hash that's failing, just add it here
const INTEGRITY_HASHES = [
  'sha384-7OMex1WYtzbDAdKl8HtBEJJB+8Yj6zAJRSeZhWCSQmjLGr4H2OBdrKtiw8HEhwgI',
  'sha384-1JFhJprHbtX4G26DXID9oEguDxAc6L0h+pxDQaCvp4eIQuAtu0kWQWbJVdkx+k1x',
  'sha384-tO0IrD5wYnaoQXROJVMmDUd7cp41nJ8GVLSjquFPrzzmYLdTiy5ePe8jbADN3UTJ',
];

function dropEncodingHeaders(headers) {
  const out = { ...headers };
  for (const key of Object.keys(out)) {
    const lower = key.toLowerCase();
    if (lower === 'content-encoding' || lower === 'content-length' || lower === 'transfer-encoding') {
      delete out[key];
    }
  }
  return out;
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();

  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (
      url.includes('cdn.amplitude.com/script/') &&
      !url.includes('.async.js')
    ) {
      console.log('Rerouting analytics-browser bundle');
      const redirectedUrl = 'https://local.website.com:5173/unified-script-local.js';
      return route.continue({ url: redirectedUrl });
    }
    
    if(
      url.includes('cdn.amplitude.com/libs/analytics-browser-gtm-')
    ) {
      console.log('Rerouting analytics-browser-gtm bundle');
      const redirectedUrl = 'https://local.website.com:5173/analytics-browser/lib/scripts/amplitude-gtm-min.js.gz';
      return route.continue({ url: redirectedUrl });
    }

    if(
      url.includes('cdn.amplitude.com/libs/analytics-browser-')
    ) {
      console.log('Rerouting analytics-browser bundle');
      const redirectedUrl = 'https://local.website.com:5173/analytics-browser/lib/scripts/amplitude-min.js.gz';
      return route.continue({ url: redirectedUrl });
    }

    // GTM injects Amplitude loader tags with SRI inside JS; strip so rerouted local bytes validate.
    if (
      route.request().resourceType() === 'script' &&
      url.includes('googletagmanager.com')
    ) {
      try {
        const response = await route.fetch();
        let body = await response.text();
        for (const hash of INTEGRITY_HASHES) {
          body = body.replaceAll(hash, '');
        }
        await route.fulfill({
          status: response.status(),
          headers: dropEncodingHeaders(response.headers()),
          body,
        });
        return;
      } catch (e) {
        console.warn('GTM script rewrite failed, passing through:', url, e.message);
        return route.continue();
      }
    }

    if (route.request().resourceType() !== 'document') {
      return route.continue();
    }
    // Only rewrite top-level document navigations. Subframe "document" loads (ads, sync pixels)
    // often fail or reset on `route.fetch()` and do not need SRI stripping for our Amplitude swap.
    if (route.request().frame().parentFrame() !== null) {
      return route.continue();
    }
    let response;
    try {
      response = await route.fetch();
    } catch (e) {
      console.warn('route.fetch failed, passing through:', route.request().url(), e.message);
      return route.continue();
    }
    let content = await response.text();
    for (const hash of INTEGRITY_HASHES) {
      content = content.replaceAll(hash, '');
    }

    const ct = (response.headers()['content-type'] || '').toLowerCase();
    if (!ct.includes('text/html')) {
      return route.fulfill({
        status: response.status(),
        headers: dropEncodingHeaders(response.headers()),
        body: content,
      });
    }

    await route.fulfill({
      status: response.status(),
      headers: dropEncodingHeaders(response.headers()),
      body: content,
    });
  });

  const page = await context.newPage();

  console.log(`\nNavigating to: ${targetUrl}\n`);
  // `networkidle` often never settles on publisher sites (ads, analytics, long-poll).
  await page.goto(targetUrl, {
    waitUntil: 'load',
    timeout: 0,
  });
  console.log('\nPage loaded. Browser will stay open. Press Ctrl+C to exit.');

  // Keep process alive
  process.on('SIGINT', async () => {
    console.log('\nClosing browser...');
    await browser.close();
    process.exit(0);
  });
}

main();
