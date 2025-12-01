import { autocapturePlugin } from '../../src/autocapture-plugin';
import { BrowserClient, BrowserConfig, ILogger } from '@amplitude/analytics-core';
import { createMockBrowserClient } from '../mock-browser-client';
import { trackExposure } from '../../src/autocapture/track-exposure';
import {
  fireViewportContentUpdated,
  ScrollTracker,
  ExposureTracker,
} from '../../src/autocapture/track-viewport-content-updated';
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

    // Advance timers to allow pageViewEndFired to reset (100ms timeout in handleViewportContentUpdated)
    jest.advanceTimersByTime(150);

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

  test('should not include page view ID when sessionStorage contains invalid JSON', async () => {
    window.sessionStorage.setItem(constants.PAGE_VIEW_SESSION_STORAGE_KEY, 'invalid-json{not-valid');

    onExposureCallback('element-1');
    window.dispatchEvent(new Event('beforeunload'));

    expect(track).toHaveBeenCalledWith(
      '[Amplitude] Viewport Content Updated',
      expect.objectContaining({
        '[Amplitude] Element Exposed': ['element-1'],
      }),
    );

    // Verify Page View ID is NOT in the event properties
    const trackCall = track.mock.calls[0];
    expect(trackCall[1]).not.toHaveProperty('[Amplitude] Page View ID');
  });

  test('should call handleViewportContentUpdated with isPageEnd=true on beforeunload', async () => {
    onExposureCallback('element-1');
    window.dispatchEvent(new Event('beforeunload'));

    expect(fireViewportContentUpdatedMock).toHaveBeenCalledTimes(1);
    expect(fireViewportContentUpdatedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isPageEnd: true,
      }),
    );
  });

  test('should call handleViewportContentUpdated with isPageEnd=false when exposure exceeds 18k chars', async () => {
    // Add a very large element path to exceed 18k chars
    const largeString = 'a'.repeat(19000);
    onExposureCallback(largeString);

    expect(fireViewportContentUpdatedMock).toHaveBeenCalledTimes(1);
    expect(fireViewportContentUpdatedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isPageEnd: false,
      }),
    );
  });
});

describe('fireViewportContentUpdated - exposureTracker optional chaining', () => {
  let mockAmplitude: BrowserClient;
  let mockScrollTracker: ScrollTracker;

  beforeEach(async () => {
    mockAmplitude = createMockBrowserClient();
    await mockAmplitude.init('API_KEY', 'USER_ID').promise;
    jest.spyOn(mockAmplitude, 'track').mockImplementation(jest.fn());

    mockScrollTracker = {
      getState: jest.fn().mockReturnValue({ maxX: 100, maxY: 200 }),
      reset: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should handle undefined exposureTracker gracefully when isPageEnd is true', () => {
    const currentElementExposed = new Set<string>(['element-1']);
    const elementExposedForPage = new Set<string>(['element-1']);

    // Call with exposureTracker as undefined and isPageEnd as true
    expect(() => {
      fireViewportContentUpdated({
        amplitude: mockAmplitude,
        scrollTracker: mockScrollTracker,
        currentElementExposed,
        elementExposedForPage,
        exposureTracker: undefined,
        isPageEnd: true,
        lastScroll: { maxX: undefined, maxY: undefined },
      });
    }).not.toThrow();

    // Verify scrollTracker.reset was still called
    expect(mockScrollTracker.reset).toHaveBeenCalled();
    // Verify elementExposedForPage was cleared
    expect(elementExposedForPage.size).toBe(0);
  });

  test('should call exposureTracker.reset when exposureTracker is defined and isPageEnd is true', () => {
    const currentElementExposed = new Set<string>(['element-1']);
    const elementExposedForPage = new Set<string>(['element-1']);
    const mockExposureTracker: ExposureTracker = {
      reset: jest.fn(),
    };

    fireViewportContentUpdated({
      amplitude: mockAmplitude,
      scrollTracker: mockScrollTracker,
      currentElementExposed,
      elementExposedForPage,
      exposureTracker: mockExposureTracker,
      isPageEnd: true,
      lastScroll: { maxX: undefined, maxY: undefined },
    });

    // Verify exposureTracker.reset was called
    expect(mockExposureTracker.reset).toHaveBeenCalled();
    // Verify scrollTracker.reset was also called
    expect(mockScrollTracker.reset).toHaveBeenCalled();
  });

  test('should not call exposureTracker.reset when isPageEnd is false', () => {
    const currentElementExposed = new Set<string>(['element-1']);
    const elementExposedForPage = new Set<string>(['element-1']);
    const mockExposureTracker: ExposureTracker = {
      reset: jest.fn(),
    };

    fireViewportContentUpdated({
      amplitude: mockAmplitude,
      scrollTracker: mockScrollTracker,
      currentElementExposed,
      elementExposedForPage,
      exposureTracker: mockExposureTracker,
      isPageEnd: false,
      lastScroll: { maxX: undefined, maxY: undefined },
    });

    // Verify exposureTracker.reset was NOT called
    expect(mockExposureTracker.reset).not.toHaveBeenCalled();
    // Verify scrollTracker.reset was also NOT called
    expect(mockScrollTracker.reset).not.toHaveBeenCalled();
  });
});

describe('fireViewportContentUpdated - early return when no changes', () => {
  let mockAmplitude: BrowserClient;
  let mockScrollTracker: ScrollTracker;
  let trackSpy: jest.SpyInstance;

  beforeEach(async () => {
    mockAmplitude = createMockBrowserClient();
    await mockAmplitude.init('API_KEY', 'USER_ID').promise;
    trackSpy = jest.spyOn(mockAmplitude, 'track').mockImplementation(jest.fn());

    mockScrollTracker = {
      getState: jest.fn().mockReturnValue({ maxX: 100, maxY: 200 }),
      reset: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should not track when no elements exposed and scroll position unchanged', () => {
    const currentElementExposed = new Set<string>();
    const elementExposedForPage = new Set<string>();

    fireViewportContentUpdated({
      amplitude: mockAmplitude,
      scrollTracker: mockScrollTracker,
      currentElementExposed,
      elementExposedForPage,
      exposureTracker: undefined,
      isPageEnd: false,
      lastScroll: { maxX: 100, maxY: 200 }, // Same as scrollTracker state
    });

    // Should NOT call track because no elements exposed and scroll is same
    expect(trackSpy).not.toHaveBeenCalled();
  });

  test('should track when elements are exposed even if scroll position unchanged', () => {
    const currentElementExposed = new Set<string>(['element-1']);
    const elementExposedForPage = new Set<string>(['element-1']);

    fireViewportContentUpdated({
      amplitude: mockAmplitude,
      scrollTracker: mockScrollTracker,
      currentElementExposed,
      elementExposedForPage,
      exposureTracker: undefined,
      isPageEnd: false,
      lastScroll: { maxX: 100, maxY: 200 }, // Same as scrollTracker state
    });

    // Should call track because there are exposed elements
    expect(trackSpy).toHaveBeenCalledWith(
      '[Amplitude] Viewport Content Updated',
      expect.objectContaining({
        '[Amplitude] Element Exposed': ['element-1'],
      }),
    );
  });

  test('should track when maxX changed even if no elements exposed', () => {
    const currentElementExposed = new Set<string>();
    const elementExposedForPage = new Set<string>();

    fireViewportContentUpdated({
      amplitude: mockAmplitude,
      scrollTracker: mockScrollTracker,
      currentElementExposed,
      elementExposedForPage,
      exposureTracker: undefined,
      isPageEnd: false,
      lastScroll: { maxX: 50, maxY: 200 }, // Different maxX
    });

    // Should call track because maxX changed
    expect(trackSpy).toHaveBeenCalledWith(
      '[Amplitude] Viewport Content Updated',
      expect.objectContaining({
        '[Amplitude] Element Exposed': [],
      }),
    );
  });

  test('should track when maxY changed even if no elements exposed', () => {
    const currentElementExposed = new Set<string>();
    const elementExposedForPage = new Set<string>();

    fireViewportContentUpdated({
      amplitude: mockAmplitude,
      scrollTracker: mockScrollTracker,
      currentElementExposed,
      elementExposedForPage,
      exposureTracker: undefined,
      isPageEnd: false,
      lastScroll: { maxX: 100, maxY: 150 }, // Different maxY
    });

    // Should call track because maxY changed
    expect(trackSpy).toHaveBeenCalledWith(
      '[Amplitude] Viewport Content Updated',
      expect.objectContaining({
        '[Amplitude] Element Exposed': [],
      }),
    );
  });

  test('should track when lastScroll has undefined values', () => {
    const currentElementExposed = new Set<string>();
    const elementExposedForPage = new Set<string>();

    fireViewportContentUpdated({
      amplitude: mockAmplitude,
      scrollTracker: mockScrollTracker,
      currentElementExposed,
      elementExposedForPage,
      exposureTracker: undefined,
      isPageEnd: false,
      lastScroll: { maxX: undefined, maxY: undefined }, // First call, undefined values
    });

    // Should call track because undefined !== 100 and undefined !== 200
    expect(trackSpy).toHaveBeenCalledWith(
      '[Amplitude] Viewport Content Updated',
      expect.objectContaining({
        '[Amplitude] Element Exposed': [],
      }),
    );
  });
});
