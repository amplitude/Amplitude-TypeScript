import { test, expect, Page, BrowserContext } from '@playwright/test';

const TBT_DIFF_THRESHOLD = 1000;

async function runFormTest(page: Page, context: BrowserContext, browserName: string, skipAutocapture = false) {
  // Enable CPU throttling through CDP only for Chromium
  if (browserName === 'chromium') {
    const client = await context.newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 20 });
  }

  // Navigate to the form test page
  const url = skipAutocapture ? '/form-test.html?skipAutocapture=true' : '/form-test.html';
  await page.goto(url);

  // Wait for the page to be fully loaded
  await page.waitForLoadState('networkidle');

  await page.fill('#text', 'Test Text Input');
  await page.fill('#email', 'test@example.com');
  await page.fill('#number', '42');
  await page.fill('#date', '2024-03-20');
  await page.fill('#color', '#ff0000');
  await page.fill('#range', '75');
  await page.selectOption('#select', '2');
  await page.fill('#textarea', 'This is a test textarea input with multiple lines.\nLine 2\nLine 3');
  await page.check('#checkbox1');
  await page.check('#checkbox2');
  await page.check('#radio1');

  // Submit the form
  await page.click('button[type="submit"]');

  // Verify form submission was successful
  const resultDiv = page.locator('#result');
  await expect(resultDiv).toBeVisible();
  await expect(resultDiv).toContainText('Form Submitted Successfully');

  // Get Total Blocking Time from the element
  const tbtElement = page.locator('#tbt');
  const tbt = await tbtElement.textContent();
  return Number(tbt);
}

test('should not significantly impact performance when autocapture is enabled', async ({ browser, browserName }) => {
  // Create two separate contexts
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();

  // Create pages in each context
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    await runFormTest(page2, context2, browserName);
    const tbtNoAutocapture = await runFormTest(page2, context2, browserName, true);
    const tbtWithAutocapture = await runFormTest(page1, context1, browserName);
    const performanceDiff = tbtWithAutocapture - tbtNoAutocapture;
    expect(performanceDiff).toBeLessThan(TBT_DIFF_THRESHOLD);
  } finally {
    // Clean up contexts
    await context1.close();
    await context2.close();
  }
});
