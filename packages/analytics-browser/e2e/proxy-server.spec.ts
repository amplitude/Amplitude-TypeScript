import { test, expect } from '@playwright/test';

// Extend the Window interface to include amplitude
declare global {
  interface Window {
    amplitude: any;
  }
}

test.describe('Proxy Server Integration', () => {
  let proxyRequests: any[] = [];

  test.beforeEach(async ({ page }) => {
    proxyRequests = [];
    
    // Intercept calls to the proxy server
    await page.route('http://localhost:3001/2/httpapi', async (route) => {
      const request = route.request();
      const postData = request.postData();
      
      if (postData) {
        const data = JSON.parse(postData);
        proxyRequests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        data: data
        });
      }
      
      // Continue the request to the actual proxy server
      await route.continue();
    });
  });

  test('should track multiple events through proxy server', async ({ page }) => {
    // Navigate to the proxy test page
    await page.goto('/proxy-test.html');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Send multiple events
    const events = [
      { name: 'FAKE-EVENT-1', properties: { index: 1 } },
      { name: 'FAKE-EVENT-2', properties: { index: 2 } },
      { name: 'FAKE-EVENT-3', properties: { index: 3 } }
    ];
    
    for (const event of events) {
      await page.evaluate((eventData) => {
        // @ts-ignore - window is available in browser context
        return window.amplitude.track(eventData.name, {
          source: 'playwright-test',
          timestamp: Date.now(),
          ...eventData.properties
        });
      }, event);
      
      // Small delay between events
      await page.waitForTimeout(500);
    }
    
    // Wait for all network requests to complete
    await page.waitForTimeout(2000);
    
    // Verify that requests were made to the proxy server
    expect(proxyRequests.length).toBeGreaterThan(0);
    
    // Collect all events from all requests
    const allEvents: any[] = [];
    proxyRequests.forEach(request => {
      if (request.data && request.data.events) {
        allEvents.push(...request.data.events);
      }
    });
    
    // Verify we have at least 3 events
    expect(allEvents.length).toBeGreaterThanOrEqual(3);
    
    // Verify each event was tracked
    events.forEach(event => {
      const trackedEvent = allEvents.find((e: any) => e.event_type === event.name);
      expect(trackedEvent).toBeDefined();
      expect(trackedEvent.event_type).toBe(event.name);
      expect(trackedEvent.event_properties.source).toBe('playwright-test');
      expect(trackedEvent.event_properties.index).toBe(event.properties.index);
    });
    
    console.log('✅ Successfully verified multiple events tracking through proxy server');
  });

  test('should handle proxy server errors gracefully', async ({ page }) => {
    // Navigate to the proxy test page
    await page.goto('/proxy-test.html');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Temporarily block requests to the proxy server to simulate an error
    await page.route('http://localhost:3001/2/httpapi', async (route) => {
      // Simulate a server error
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' })
      });
    });
    
    // Try to track an event
    await page.evaluate(() => {
      // @ts-ignore - window is available in browser context
      return window.amplitude.track('ERROR-TEST-EVENT', {
        source: 'playwright-test',
        timestamp: Date.now()
      });
    });
    
    // Wait for the request to complete
    await page.waitForTimeout(2000);
    
    // Verify that the request was made (even though it failed)
    expect(proxyRequests.length).toBeGreaterThan(0);
    
    // Restore normal routing
    await page.unroute('http://localhost:3001/2/httpapi');
    
    // Re-add the original route handler
    await page.route('http://localhost:3001/2/httpapi', async (route) => {
      const request = route.request();
      const postData = request.postData();
      
      if (postData) {
        try {
          const data = JSON.parse(postData);
          proxyRequests.push({
            url: request.url(),
            method: request.method(),
            headers: request.headers(),
            data: data
          });
        } catch (error) {
          console.error('❌ Error parsing proxy request:', error);
        }
      }
      
      await route.continue();
    });
    
    // Try tracking another event to ensure it works after error recovery
    await page.evaluate(() => {
      // @ts-ignore - window is available in browser context
      return window.amplitude.track('RECOVERY-TEST-EVENT', {
        source: 'playwright-test',
        timestamp: Date.now(),
        recovery: true
      });
    });
    
    await page.waitForTimeout(2000);
    
    // Verify that the recovery event was tracked
    const recoveryEvent = proxyRequests.find(request => 
      request.data && request.data.events && 
      request.data.events.some((event: any) => event.event_type === 'RECOVERY-TEST-EVENT')
    );
    
    expect(recoveryEvent).toBeDefined();
  });
}); 