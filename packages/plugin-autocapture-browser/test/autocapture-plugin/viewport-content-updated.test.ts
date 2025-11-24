import { autocapturePlugin } from '../../src/autocapture-plugin';
import { BrowserClient, BrowserConfig, ILogger } from '@amplitude/analytics-core';
import { createMockBrowserClient } from '../mock-browser-client';
import { trackExposure } from '../../src/autocapture/track-exposure';
import { fireViewportContentUpdated } from '../../src/autocapture/track-viewport-content-updated';
import * as constants from '../../src/constants';

// Mock trackExposure to capture onExposure callback
jest.mock('../../src/autocapture/track-exposure', () => ({
  trackExposure: jest.fn(),
}));

// Mock fireViewportContentUpdated to verify calls
jest.mock('../../src/autocapture/track-viewport-content-updated', () => {
  const originalModule = jest.requireActual<typeof import('../../src/autocapture/track-viewport-content-updated')>(
    '../../src/autocapture/track-viewport-content-updated',
  );
  return {
    ...originalModule,
    fireViewportContentUpdated: jest.fn((...args: Parameters<typeof originalModule.fireViewportContentUpdated>) =>
      originalModule.fireViewportContentUpdated(...args),
    ),
  };
});

describe('autocapturePlugin - Viewport Content Updated (Exposure)', () => {
  let plugin: any;
  let instance: BrowserClient;
  let track: jest.SpyInstance;
  let onExposureCallback: (elementPath: string) => void;
  let trackExposureMock: jest.Mock;
  let fireViewportContentUpdatedMock: jest.Mock;

  const TESTING_DEBOUNCE_TIME = 0;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(jest.fn());

    trackExposureMock = trackExposure as unknown as jest.Mock;
    trackExposureMock.mockImplementation(({ onExposure }) => {
      onExposureCallback = onExposure;
      return {
        unsubscribe: jest.fn(),
        reset: jest.fn(),
      };
    });

    fireViewportContentUpdatedMock = fireViewportContentUpdated as unknown as jest.Mock;

    const loggerProvider = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as ILogger;

    plugin = autocapturePlugin({ debounceTime: TESTING_DEBOUNCE_TIME });
    instance = createMockBrowserClient();
    await instance.init('API_KEY', 'USER_ID').promise;
    track = jest.spyOn(instance, 'track').mockImplementation(jest.fn());

    const config: Partial<BrowserConfig> = {
      defaultTracking: false,
      loggerProvider: loggerProvider,
    };
    await plugin.setup(config as BrowserConfig, instance);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    window.sessionStorage.clear();
    plugin.teardown();
  });

  test('should trigger Viewport Content Updated when exposed elements exceed 18k chars', async () => {
    // Verify onExposure was captured
    expect(onExposureCallback).toBeDefined();

    // 1. Add a small element, should not trigger track
    onExposureCallback('small-element');
    expect(fireViewportContentUpdatedMock).not.toHaveBeenCalled();

    // 2. Add a very large element path to exceed 18k chars
    // We need to exceed 18000 characters in JSON.stringify(array)
    // The array will be ["small-element", "large..."]
    // We can just add one massive string.
    const largeString = 'a'.repeat(19000);
    onExposureCallback(largeString);

    // Should trigger track
    expect(fireViewportContentUpdatedMock).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith(
      '[Amplitude] Viewport Content Updated',
      expect.objectContaining({
        '[Amplitude] Element Exposed': expect.arrayContaining(['small-element', largeString]),
      }),
    );

    // 3. Verify the batch is cleared after tracking
    track.mockClear();
    fireViewportContentUpdatedMock.mockClear();

    // Add another small element
    onExposureCallback('another-small-element');

    // Should not trigger again immediately
    expect(fireViewportContentUpdatedMock).not.toHaveBeenCalled();

    // But if we trigger page view end (e.g. via beforeunload), it should flush the new batch
    window.dispatchEvent(new Event('beforeunload'));

    expect(fireViewportContentUpdatedMock).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith(
      '[Amplitude] Viewport Content Updated',
      expect.objectContaining({
        '[Amplitude] Element Exposed': expect.arrayContaining(['another-small-element']),
      }),
    );
  });

  test('should not re-add already exposed elements to the current batch', async () => {
    // 1. Add an element
    onExposureCallback('element-1');

    // 2. Add the same element again
    onExposureCallback('element-1');

    // 3. Force flush via beforeunload
    window.dispatchEvent(new Event('beforeunload'));

    // Should only be in the array once
    expect(track).toHaveBeenCalledWith(
      '[Amplitude] Viewport Content Updated',
      expect.objectContaining({
        '[Amplitude] Element Exposed': ['element-1'],
      }),
    );
  });

  test('should include page view ID when available', async () => {
    window.sessionStorage.setItem(
      constants.PAGE_VIEW_SESSION_STORAGE_KEY,
      JSON.stringify({ pageViewId: 'pv-test-123' }),
    );

    onExposureCallback('element-1');
    window.dispatchEvent(new Event('beforeunload'));

    expect(track).toHaveBeenCalledWith(
      '[Amplitude] Viewport Content Updated',
      expect.objectContaining({
        '[Amplitude] Element Exposed': ['element-1'],
        '[Amplitude] Page View ID': 'pv-test-123',
      }),
    );
  });
});
