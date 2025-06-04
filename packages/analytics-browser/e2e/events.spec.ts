import { test, expect } from '@playwright/test';

interface StorageState {
  origins: Array<{
    origin: string;
    localStorage: Array<{
      name: string;
      value: string;
    }>;
  }>;
}

test.describe('Events Page', () => {
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

  test('should track events in sequence', async ({ page }) => {
    // Navigate to the events page
    await page.goto('/browser-sdk/events-precision.html');
    
    // Wait for all status elements to be present
    const statusElements = [
      'event1-status',
      'event2-status',
      'event3-status',
      'event4-status'
    ];

    // Wait for all events to complete (status changes to 'complete')
    for (const id of statusElements) {
      await expect(page.locator(`#${id}`)).toHaveClass(/complete/);
    }

    // Verify the final state of all status elements
    for (const id of statusElements) {
      const element = page.locator(`#${id}`);
      await expect(element).toHaveClass(/complete/);
      await expect(element).toHaveText(/Tracked Event/);
    }

    // Wait for all network requests to complete
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const events = requests[0].events;
    // Verify the network requests
    expect(events.length).toBe(4);
    events.forEach((event: any, index: number) => {
      expect(event.event_type).toBe(`Event ${index + 1}`);
      expect(event.user_id).toBe('test-user');
    });
  });

  test('should track events even if offline', async ({ page }) => {
    // Navigate to the events page
    await page.goto('/browser-sdk/events-precision.html');
    
    // Set browser to offline mode
    await page.context().setOffline(true);
    
    // Wait for all status elements to be present
    const statusElements = [
      'event1-status',
      'event2-status',
      'event3-status',
      'event4-status'
    ];

    // Wait for all events to complete (status changes to 'complete')
    for (const id of statusElements) {
      await expect(page.locator(`#${id}`)).toHaveClass(/complete/);
    }

    // Verify the final state of all status elements
    for (const id of statusElements) {
      const element = page.locator(`#${id}`);
      await expect(element).toHaveClass(/complete/);
      await expect(element).toHaveText(/Tracked Event/);
    }

    // Verify no requests were sent while offline
    expect(requests.length).toBe(0);

    // Wait for localStorage to be populated
    await page.waitForFunction(() => {
      return Object.keys((globalThis as any).localStorage)
        .some(key => key.startsWith('AMP_unsent_'));
    });

    // Check localStorage for queued events
    const storage = await page.context().storageState() as StorageState;
    
    // Find all unsent event keys
    const unsentItems = storage.origins[0].localStorage
      .filter(item => item.name.startsWith('AMP_unsent_'));
    let unsentValues: any[] = JSON.parse(unsentItems[0].value);
    expect(unsentValues.length).toBe(4);
    
    // Parse the stored events
    const storedEvents: any[][] = [];
    for (const item of unsentItems) {
      storedEvents.push(JSON.parse(item.value));
    }

    // Verify events are in localStorage
    expect(storedEvents.length).toBeGreaterThan(0);
    const queuedEvents = storedEvents.flat();
    expect(queuedEvents.length).toBe(4);
    queuedEvents.forEach((event: any, index: number) => {
      expect(event.event_type).toBe(`Event ${index + 1}`);
      expect(event.user_id).toBe('test-user');
    });

    // Set browser back to online mode
    await page.context().setOffline(false);

    // Wait for all network requests to complete
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const events = requests[0].events;
    // Verify the network requests
    expect(events.length).toBe(4);
    events.forEach((event: any, index: number) => {
      expect(event.event_type).toBe(`Event ${index + 1}`);
      expect(event.user_id).toBe('test-user');
    });

    // Verify localStorage is cleared after sending
    await page.waitForTimeout(1000);
    const finalStorage = await page.context().storageState() as StorageState;
    const remainingItems = finalStorage.origins[0].localStorage
      .filter(item => item.name.startsWith('AMP_unsent_'));
    unsentValues = JSON.parse(remainingItems[0].value);
    expect(unsentValues.length).toBe(0);
  });
}); 