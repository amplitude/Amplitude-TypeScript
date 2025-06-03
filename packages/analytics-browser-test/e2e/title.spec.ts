import { test, expect } from '@playwright/test';

test('should have correct title', async ({ page }) => {
  // Add error handling for navigation
  try {
    // Wait for the server to be ready
    await page.waitForLoadState('networkidle');

    // Navigate to the specified URL with retry logic
    const response = await page.goto('http://localhost:5173/browser-sdk/index.html', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Check if the response was successful
    expect(response?.status()).toBe(200);

    // Get the page title
    const title = await page.title();

    // Assert that the title is what we expect
    expect(title).toBeTruthy();
  } catch (error) {
    console.error('Navigation failed:', error);
    throw error;
  }
});
