import { test, expect } from '@playwright/test';

test.describe('Cookie Consent Page', () => {
  let requests: any[] = [];

  test.beforeEach(async ({ page }) => {
    requests = [];
    await page.route('https://api2.amplitude.com/2/httpapi', async (route) => {
      const request = route.request();
      const postData = request.postData();
      if (postData) {
        const data = JSON.parse(postData);
        requests.push(data);
      }
      await route.continue();
    });
  });

  test('should track events only after cookie consent is given', async ({ page }) => {
    // Navigate to the cookie consent page
    await page.goto('/browser-sdk/cookie-consent.html');
    
    // Wait for the page to load and cookie banner to appear
    await expect(page.locator('#cookie-banner')).toBeVisible();
    await expect(page.locator('#consent-status')).toContainText('Cookie consent not given yet');
    await expect(page.locator('#sdk-status')).toContainText('Amplitude SDK not initialized');

    // Click the button to track event before cookie consent
    await page.click('#track-before-consent-btn');
    
    // Wait a moment to ensure any potential requests would have been made
    await page.waitForTimeout(1000);
    
    // Assert: no network request made by Amplitude (since SDK is not initialized)
    expect(requests.length).toBe(0);
    
    // Click on accept button of the cookie consent banner
    await page.click('#accept-cookies-btn');
    
    // Wait for cookie banner to disappear and SDK to initialize
    await expect(page.locator('#cookie-banner')).not.toBeVisible();
    await expect(page.locator('#consent-status')).toContainText('Cookie consent given');
    await expect(page.locator('#sdk-status')).toContainText('Amplitude SDK initialized');
    
    // Wait for all network requests to complete
    await page.waitForLoadState('networkidle');
    // Check every 500ms for up to 5 seconds
    for (let i = 0; i < 10; i++) {
      if (requests.length === 1) break;
      await page.waitForTimeout(500);
    }

    // Assert: two events should be sent
    expect(requests.length).toBe(1);
    
    const events = requests[0].events;
    expect(events.length).toBe(2);
    
    // Verify the first event is "before cookie consent"
    expect(events[0].event_type).toBe('before cookie consent');
    expect(events[0].event_properties.page).toBe('cookie-consent-demo');
    expect(events[0].event_properties.consent_status).toBe('not_given');
    expect(events[0].user_id).toBe('test-user-cookie-consent');
    
    // Verify the second event is "SDK Initialized After Consent"  
    expect(events[1].event_type).toBe('SDK Initialized After Consent');
    expect(events[1].event_properties.consent_method).toBe('cookie_banner');
    expect(events[1].user_id).toBe('test-user-cookie-consent');
  });

  test('should not initialize SDK when cookie consent is declined', async ({ page }) => {
    // Capture console logs
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      consoleLogs.push(msg.text());
    });

    // Navigate to the cookie consent page
    await page.goto('/browser-sdk/cookie-consent.html');
    
    // Wait for the page to load and cookie banner to appear
    await expect(page.locator('#cookie-banner')).toBeVisible();

    // Click the button to track event before cookie consent
    await page.click('#track-before-consent-btn');
    
    // Wait a moment to ensure any potential requests would have been made
    await page.waitForTimeout(1000);
    
    // Assert: no network request made by Amplitude
    expect(requests.length).toBe(0);

    // Click on decline button of the cookie consent banner
    await page.click('#decline-cookies-btn');
    
    // Wait for cookie banner to disappear
    await expect(page.locator('#cookie-banner')).not.toBeVisible();
    
    // Verify SDK status remains uninitialized
    await expect(page.locator('#consent-status')).toContainText('Cookie consent not given yet');
    await expect(page.locator('#sdk-status')).toContainText('Amplitude SDK not initialized');
    
    // Wait for potential network requests
    await page.waitForTimeout(3000);

    // Assert: still no network requests should be made
    expect(requests.length).toBe(0);

    // Assert: no console log contains "Amplitude SDK initialized successfully"
    const hasInitializationLog = consoleLogs.some(log => log.includes('Amplitude SDK initialized successfully'));
    expect(hasInitializationLog).toBe(false);
  });
}); 