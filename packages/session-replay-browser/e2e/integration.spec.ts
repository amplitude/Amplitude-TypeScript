import { test, expect } from '@playwright/test';
import { flush } from '@amplitude/analytics-browser';

test.describe('Session Replay SDK Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Enhanced request logging with full details
    page.on('request', async (request) => {
      const url = request.url();

      // Only log full details for Amplitude API requests
      if (url.includes('api.stag2.amplitude.com') || url.includes('api-sr.stag2.amplitude.com')) {
        console.log(`🌐 AMPLITUDE REQUEST: ${request.method()} ${url}`);

        try {
          // Log the entire request object
          const requestDetails = {
            method: request.method(),
            url: url,
            headers: request.headers(),
            postData: request.postData(),
            resourceType: request.resourceType(),
          };

          console.log('📋 FULL AMPLITUDE REQUEST DETAILS:', JSON.stringify(requestDetails, null, 2));
        } catch (error) {
          console.log('❌ ERROR getting request details:', error);
          console.log('📋 BASIC REQUEST INFO:', {
            method: request.method(),
            url: url,
            resourceType: request.resourceType(),
          });
        }
      }
    });

    page.on('requestfailed', (request) => {
      console.log(`❌ REQUEST FAILED: ${request.method()} ${request.url()}`);
      console.log(`💥 FAILURE: ${request.failure()?.errorText || 'Unknown error'}`);
    });

    await page.goto('/session-replay/session-replay-test.html');
    // Wait for SDKs to initialize
    await page.waitForSelector('#session-replay-status.complete');
    await page.waitForSelector('#analytics-status.complete');
  });

  test('should record comprehensive user interactions', async ({ page }) => {
    test.setTimeout(180000); // Set timeout to 3 minutes

    // Ensure that we are making requests to the sdk at least once
    const sessionReplayResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('https://api-sr.stag2.amplitude.com/sessions/v2/track') && resp.status() === 200,
      { timeout: 60000 },
    );

    const analyticsPromise = page.waitForResponse(
      (resp) => resp.url().includes('https://api.stag2.amplitude.com/2/httpapi') && resp.status() === 200,
      { timeout: 60000 },
    );

    // 1. Initial form interactions with pacing
    await page.fill('#text-input', 'Test Input');
    await page.waitForTimeout(2000); // 2s pause
    await page.fill('#email-input', 'test@example.com');
    await page.waitForTimeout(2000); // 2s pause
    await page.selectOption('#select-input', 'option1');
    await page.waitForTimeout(2000); // 2s pause
    await page.fill('#textarea-input', 'Test textarea content');
    await page.waitForTimeout(2000); // 2s pause
    await page.check('#checkbox-input');
    await page.waitForTimeout(2000); // 2s pause
    await page.check('input[value="radio1"]');
    await page.waitForTimeout(2000); // 2s pause

    // 2. Mouse interactions with pacing
    await page.mouse.move(100, 100);
    await page.waitForTimeout(2000); // 2s pause
    await page.mouse.down();
    await page.waitForTimeout(2000); // 2s pause
    await page.mouse.move(200, 200);
    await page.waitForTimeout(2000); // 2s pause
    await page.mouse.up();
    await page.waitForTimeout(2000); // 2s pause
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(2000); // 2s pause

    // 3. Event tracking with pacing
    await page.click('#track-page-view');
    await page.waitForTimeout(2000); // 2s pause
    const eventLog = page.locator('#event-log');
    await expect(eventLog).toContainText('page_view');
    await page.waitForTimeout(2000); // 2s pause

    // 4. Form submission with pacing
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000); // 2s pause
    await expect(eventLog).toContainText('form_submitted');
    await page.waitForTimeout(2000); // 2s pause

    // 5. Properties verification with pacing
    const propertiesDisplay = page.locator('#properties-display');
    await page.click('#get-current-properties');
    await page.waitForTimeout(2000); // 2s pause
    await expect(propertiesDisplay).toContainText('[Amplitude] Session Replay ID');
    await page.waitForTimeout(2000); // 2s pause

    // 6. Additional mouse movements with pacing
    await page.mouse.move(300, 300);
    await page.waitForTimeout(2000); // 2s pause
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(2000); // 2s pause

    // 7. Final verifications
    await expect(eventLog).toContainText('page_view');
    await expect(eventLog).toContainText('form_submitted');

    flush();
    await analyticsPromise;
    await sessionReplayResponsePromise;
  });

  test('should test CORS connectivity', async ({ page }) => {
    console.log('🔍 Testing CORS...');

    // Test a simple GET request first
    try {
      const response = await page.goto(
        'https://api-sr.stag2.amplitude.com/config?api_key=test&config_keys=sessionReplay&session_id=123',
      );
      console.log('✅ GET request status:', response?.status());
    } catch (error) {
      console.log('❌ GET request failed:', (error as Error).message);
    }

    // Test a POST request
    try {
      const response = await page.evaluate(async () => {
        const res = await fetch('https://api-sr.stag2.amplitude.com/sessions/v2/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: true }),
        });
        return res.status;
      });
      console.log('✅ POST request status:', response);
    } catch (error) {
      console.log('❌ POST request failed:', (error as Error).message);
    }
  });
});
