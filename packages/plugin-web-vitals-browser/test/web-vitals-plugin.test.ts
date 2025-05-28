import { BrowserClient, getGlobalScope } from '@amplitude/analytics-core';
import { onLCP, onINP, onCLS, onFCP } from 'web-vitals';
import { webVitalsPlugin } from '../src';
import { PLUGIN_NAME, WEB_VITALS_EVENT_NAME } from '../src/constants';

/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

// Mock web-vitals
jest.mock('web-vitals', () => ({
  onLCP: jest.fn(),
  onINP: jest.fn(),
  onCLS: jest.fn(),
  onFCP: jest.fn(),
}));

// Mock getGlobalScope
jest.mock('@amplitude/analytics-core', () => ({
  ...jest.requireActual('@amplitude/analytics-core'),
  getGlobalScope: jest.fn(),
}));

describe('webVitalsPlugin', () => {
  let amplitude: BrowserClient;
  let config: any;
  let mockDocument: Document;
  let mockPerformance: Performance;
  let mockGlobalScope: typeof globalThis;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock document and performance
    mockDocument = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      visibilityState: 'visible',
    } as unknown as Document;

    mockPerformance = {
      timeOrigin: 1000,
    } as unknown as Performance;

    // Mock global scope with document
    mockGlobalScope = {
      document: mockDocument,
      performance: mockPerformance,
    } as unknown as typeof globalThis;

    // Mock getGlobalScope function to return our mock global scope
    (getGlobalScope as jest.Mock).mockReturnValue(mockGlobalScope);

    // Setup amplitude mock
    amplitude = {
      track: jest.fn(),
    } as unknown as BrowserClient;

    config = {
      loggerProvider: {
        log: jest.fn(),
      },
    };
  });

  it('should be defined', () => {
    expect(webVitalsPlugin).toBeDefined();
  });

  it('should have the correct name and type', () => {
    const plugin = webVitalsPlugin();
    expect(plugin.name).toBe(PLUGIN_NAME);
    expect(plugin.type).toBe('enrichment');
  });

  it('should not setup if document is not available', async () => {
    // Mock getGlobalScope to return an object without document
    (getGlobalScope as jest.Mock).mockReturnValue({});
    const plugin = webVitalsPlugin();
    await plugin?.setup?.(config, amplitude);
    expect(onLCP).not.toHaveBeenCalled();
    expect(onFCP).not.toHaveBeenCalled();
    expect(onINP).not.toHaveBeenCalled();
    expect(onCLS).not.toHaveBeenCalled();
  });

  it('should not setup if globalScope is not available', async () => {
    // Mock getGlobalScope to return undefined
    (getGlobalScope as jest.Mock).mockReturnValue(undefined);
    const plugin = webVitalsPlugin();
    await plugin?.setup?.(config, amplitude);

    // Verify getGlobalScope was called and returned undefined
    expect(getGlobalScope).toHaveBeenCalled();
    expect(getGlobalScope()).toBeUndefined();

    // Verify no web vitals listeners were set up
    expect(onLCP).not.toHaveBeenCalled();
    expect(onFCP).not.toHaveBeenCalled();
    expect(onINP).not.toHaveBeenCalled();
    expect(onCLS).not.toHaveBeenCalled();
  });

  it('should setup web vitals listeners', async () => {
    const plugin = webVitalsPlugin();
    await plugin?.setup?.(config, amplitude);

    // Verify getGlobalScope was called and returned our mock document
    expect(getGlobalScope).toHaveBeenCalled();
    expect(getGlobalScope()).toBe(mockGlobalScope);
    expect(getGlobalScope()?.document).toBe(mockDocument);

    expect(onLCP).toHaveBeenCalled();
    expect(onFCP).toHaveBeenCalled();
    expect(onINP).toHaveBeenCalled();
    expect(onCLS).toHaveBeenCalled();
    expect(mockDocument.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('should track web vitals when visibility changes to hidden', async () => {
    const plugin = webVitalsPlugin();
    await plugin?.setup?.(config, amplitude);

    // Get the visibility change listener
    const visibilityListener = (mockDocument.addEventListener as jest.Mock).mock.calls[0][1];

    // Mock web vitals callbacks
    const mockMetric = {
      value: 100,
      rating: 'good',
      delta: 0,
      navigationType: 'navigate',
      id: 'test-id',
      entries: [{ startTime: 0 }],
    };

    // Simulate web vitals being collected
    const lcpCallback = (onLCP as jest.Mock).mock.calls[0][0];
    const fcpCallback = (onFCP as jest.Mock).mock.calls[0][0];
    const inpCallback = (onINP as jest.Mock).mock.calls[0][0];
    const clsCallback = (onCLS as jest.Mock).mock.calls[0][0];

    if (lcpCallback && fcpCallback && inpCallback && clsCallback) {
      lcpCallback(mockMetric);
      fcpCallback(mockMetric);
      inpCallback(mockMetric);
      clsCallback(mockMetric);
    }

    // Change visibility to hidden
    Object.defineProperty(mockDocument, 'visibilityState', { value: 'hidden' });
    visibilityListener();

    // Verify track was called with correct payload
    expect(amplitude.track).toHaveBeenCalledWith(
      WEB_VITALS_EVENT_NAME,
      expect.objectContaining({
        metricId: expect.any(String),
        '[Amplitude] LCP': expect.objectContaining({
          value: 100,
          rating: 'good',
          timestamp: expect.any(String),
        }),
        '[Amplitude] FCP': expect.objectContaining({
          value: 100,
          rating: 'good',
          timestamp: expect.any(String),
        }),
        '[Amplitude] INP': expect.objectContaining({
          value: 100,
          rating: 'good',
          timestamp: expect.any(String),
        }),
        '[Amplitude] CLS': expect.objectContaining({
          value: 100,
          rating: 'good',
          timestamp: expect.any(String),
        }),
      }),
    );
  });

  it('should not track web vitals if no changes occurred', async () => {
    const plugin = webVitalsPlugin();
    await plugin?.setup?.(config, amplitude);

    const visibilityListener = (mockDocument.addEventListener as jest.Mock).mock.calls[0][1];
    if (visibilityListener) {
      Object.defineProperty(mockDocument, 'visibilityState', { value: 'hidden' });
      visibilityListener();
    }

    expect(amplitude.track).not.toHaveBeenCalled();
  });

  it('should cleanup event listeners on teardown', async () => {
    const plugin = webVitalsPlugin();
    await plugin?.setup?.(config, amplitude);
    await plugin?.teardown?.();

    expect(mockDocument.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('should pass through events in execute', async () => {
    const plugin = webVitalsPlugin();
    const event = { event_type: 'test' };
    const result = await plugin?.execute?.(event);
    expect(result).toBe(event);
  });
});
