// playwright-proxy.ts
import { chromium } from 'playwright';

// Get URL from command line args
const targetUrl = process.argv[2];

if (!targetUrl) {
  console.error('Usage: npx ts-node playwright-proxy.ts <url>');
  console.error('Example: npx ts-node playwright-proxy.ts https://example.com');
  process.exit(1);
}

/** Drop SRI (and crossorigin) on tags that load from cdn.amplitude.com so a substituted script can load. */
function stripAmplitudeScriptIntegrity(html) {
  return html.replace(
    /<script\b([^>]*\bcdn\.amplitude\.com\b[^>]*)>/gi,
    (_, attrs) => {
      const cleaned = attrs
        .replace(/\s+integrity\s*=\s*("[^"]*"|'[^']*')/gi, '')
        .replace(/\s+crossorigin(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]*))?/gi, '');
      return `<script${cleaned}>`;
    },
  );
}

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

    if (route.request().resourceType() !== 'document') {
      return route.continue();
    }
    const response = await route.fetch();
    const ct = (response.headers()['content-type'] || '').toLowerCase();
    if (!ct.includes('text/html')) {
      return route.fulfill({ response });
    }
    const html = await response.text();
    const body = stripAmplitudeScriptIntegrity(html);
    await route.fulfill({
      status: response.status(),
      headers: dropEncodingHeaders(response.headers()),
      body,
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
