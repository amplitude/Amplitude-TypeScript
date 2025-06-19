// import { test, expect, Page } from '@playwright/test';

// const validateAnalyticsSDKResponse = async (page: Page) => {
//   await page.waitForResponse(
//     (resp) => resp.url().includes('https://api.stag2.amplitude.com/2/httpapi') && resp.status() === 200,
//   );
// };

// test.describe('Session Replay SDK Integration', () => {
//   test.beforeEach(async ({ page }) => {
//     await page.goto('/session-replay/session-replay-test.html');
//     // Wait for SDKs to initialize
//     await page.waitForSelector('#session-replay-status.complete');
//     await page.waitForSelector('#analytics-status.complete');
//   });

//   test('should record comprehensive user interactions', async ({ page }) => {
//     test.setTimeout(120000); // Set timeout to 2 minutes

//     // Start waiting for the session replay response at the beginning of the test and validate
//     // that the request is made at least once in this test
//     const sessionReplayResponsePromise = page.waitForResponse(
//       (resp) => resp.url().includes('https://api-sr.stag2.amplitude.com/sessions/v2/track') && resp.status() === 200,
//     );

//     // 1. Initial form interactions with pacing
//     await page.fill('#text-input', 'Test Input');
//     await page.waitForTimeout(2000); // 2s pause
//     await page.fill('#email-input', 'test@example.com');
//     await page.waitForTimeout(2000); // 2s pause
//     await page.selectOption('#select-input', 'option1');
//     await page.waitForTimeout(2000); // 2s pause
//     await page.fill('#textarea-input', 'Test textarea content');
//     await page.waitForTimeout(2000); // 2s pause
//     await page.check('#checkbox-input');
//     await page.waitForTimeout(2000); // 2s pause
//     await page.check('input[value="radio1"]');
//     await page.waitForTimeout(2000); // 2s pause

//     // 2. Mouse interactions with pacing
//     await page.mouse.move(100, 100);
//     await page.waitForTimeout(2000); // 2s pause
//     await page.mouse.down();
//     await page.waitForTimeout(2000); // 2s pause
//     await page.mouse.move(200, 200);
//     await page.waitForTimeout(2000); // 2s pause
//     await page.mouse.up();
//     await page.waitForTimeout(2000); // 2s pause
//     await page.mouse.wheel(0, 500);
//     await page.waitForTimeout(2000); // 2s pause

//     // 3. Event tracking with pacing
//     await page.click('#track-page-view');
//     await validateAnalyticsSDKResponse(page);
//     await page.waitForTimeout(2000); // 2s pause
//     const eventLog = page.locator('#event-log');
//     await expect(eventLog).toContainText('page_view');
//     await page.waitForTimeout(2000); // 2s pause

//     // 4. Form submission with pacing
//     await page.click('button[type="submit"]');
//     await validateAnalyticsSDKResponse(page);
//     await page.waitForTimeout(2000); // 2s pause
//     await expect(eventLog).toContainText('form_submitted');
//     await page.waitForTimeout(2000); // 2s pause

//     // 5. Properties verification with pacing
//     const propertiesDisplay = page.locator('#properties-display');
//     await page.click('#get-current-properties');
//     await page.waitForTimeout(2000); // 2s pause
//     await expect(propertiesDisplay).toContainText('[Amplitude] Session Replay ID');
//     await page.waitForTimeout(2000); // 2s pause

//     // 6. Additional mouse movements with pacing
//     await page.mouse.move(300, 300);
//     await page.waitForTimeout(2000); // 2s pause
//     await page.mouse.wheel(0, -500);
//     await page.waitForTimeout(2000); // 2s pause

//     // 7. Final verifications
//     await expect(eventLog).toContainText('page_view');
//     await expect(eventLog).toContainText('form_submitted');

//     // Await the response promise at the end of the test
//     await sessionReplayResponsePromise;
//   });
// });
