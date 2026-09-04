import { trackExposure } from '../../src/autocapture/track-exposure';
import { AllWindowObservables, ObservablesEnum } from '../../src/autocapture-plugin';
import { DataExtractor } from '../../src';
import { DEFAULT_EXPOSURE_DURATION } from '@amplitude/analytics-core';

describe('trackExposure', () => {
  let exposureObservable: any;
  let allObservables: AllWindowObservables;
  let onExposure: jest.Mock;
  let unsubscribe: () => void;
  let reset: () => void;
  let observers: Array<(val: any) => void> = [];

  beforeEach(() => {
    jest.useFakeTimers();
    onExposure = jest.fn();
    observers = [];

    // Mock Observable implementation
    exposureObservable = {
      subscribe: (fn: (val: any) => void) => {
        observers.push(fn);
        return {
          unsubscribe: () => {
            observers = observers.filter((o) => o !== fn);
          },
        };
      },
    };

    allObservables = {
      [ObservablesEnum.ExposureObservable]: exposureObservable,
    } as any;

    const dataExtractor = new DataExtractor({});
    const result = trackExposure({
      allObservables,
      onExposure,
      dataExtractor,
    });
    unsubscribe = result.unsubscribe;
    reset = result.reset;
  });

  afterEach(() => {
    unsubscribe();
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  const triggerExposure = (entry: Partial<IntersectionObserverEntry>) => {
    observers.forEach((observer) => observer(entry));
  };

  const rect = (width: number, height: number) => ({ width, height } as DOMRectReadOnly);

  test('should mark element as exposed after 2 seconds of visibility', () => {
    const element = document.createElement('div');
    element.id = 'test-div';

    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 1.0,
    });

    // Should not be exposed yet
    expect(onExposure).not.toHaveBeenCalled();

    // Fast forward 2 seconds
    jest.advanceTimersByTime(2000);

    expect(onExposure).toHaveBeenCalledWith('div#test-div');
  });

  test('should not mark element as exposed if it becomes invisible before timeout (1 second)', () => {
    const element = document.createElement('div');
    element.id = 'test-div-cancel';

    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 1.0,
    });

    jest.advanceTimersByTime(50);

    // Element leaves viewport
    triggerExposure({
      isIntersecting: false,
      target: element,
      intersectionRatio: 0,
    });

    jest.advanceTimersByTime(50);

    expect(onExposure).not.toHaveBeenCalled();
  });

  test('should replace a pending exposure timer on a second intersecting callback', () => {
    const element = document.createElement('div');
    element.id = 'test-div-reobserve';
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 1.0,
    });
    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION / 2);

    // A rescan unobserve/observe delivers another intersecting callback while the
    // first timer is still pending. The old timer must not fire after reset/nav.
    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 1.0,
    });
    expect(clearTimeoutSpy).toHaveBeenCalled();

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION / 2);
    expect(onExposure).not.toHaveBeenCalled();

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION / 2);
    expect(onExposure).toHaveBeenCalledTimes(1);
    expect(onExposure).toHaveBeenCalledWith('div#test-div-reobserve');
  });

  test('should not re-expose already exposed element', () => {
    const element = document.createElement('div');
    element.id = 'test-div-repeat';
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    // First exposure
    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 1.0,
    });

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION * 1.5);
    expect(onExposure).toHaveBeenCalledWith('div#test-div-repeat');
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

    // Reset spy
    setTimeoutSpy.mockClear();

    // Element leaves and comes back
    triggerExposure({
      isIntersecting: false,
      target: element,
      intersectionRatio: 0,
    });

    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 1.0,
    });

    // Should not start a new timer because it is already exposed in the internal map
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  test('should handle multiple elements independently', () => {
    const element1 = document.createElement('div');
    element1.id = 'div-1';
    const element2 = document.createElement('div');
    element2.id = 'div-2';

    // Start element 1
    triggerExposure({
      isIntersecting: true,
      target: element1,
      intersectionRatio: 1.0,
    });

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION / 2);

    // Start element 2
    triggerExposure({
      isIntersecting: true,
      target: element2,
      intersectionRatio: 1.0,
    });

    // Element 1 finishes
    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION / 2);
    expect(onExposure).toHaveBeenCalledWith('div#div-1');
    expect(onExposure).not.toHaveBeenCalledWith('div#div-2');

    // Element 2 finishes
    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION / 2);
    expect(onExposure).toHaveBeenCalledWith('div#div-2');
  });

  test('should clear timer when element leaves viewport (intersection check)', () => {
    const element = document.createElement('div');
    element.id = 'test-div-leave';
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 1.0,
    });

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION / 2);

    triggerExposure({
      isIntersecting: false,
      target: element,
      intersectionRatio: 0,
    });

    expect(clearTimeoutSpy).toHaveBeenCalled();

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION * 1.5);
    expect(onExposure).not.toHaveBeenCalled();
  });

  test('should expose an element that is half visible', () => {
    const element = document.createElement('div');
    element.id = 'half-visible';

    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 0.5,
    });

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION * 1.5);
    expect(onExposure).toHaveBeenCalledWith('div#half-visible');
  });

  test('should not expose an element that is visible by less than half', () => {
    const element = document.createElement('div');
    element.id = 'barely-visible';

    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 0.3,
      rootBounds: null,
    });

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION * 1.5);
    expect(onExposure).not.toHaveBeenCalled();
  });

  test('should not expose a partially visible element when the viewport has no area', () => {
    const element = document.createElement('div');
    element.id = 'zero-area-viewport';

    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 0.3,
      rootBounds: rect(0, 0),
      intersectionRect: rect(0, 0),
    });

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION * 1.5);
    expect(onExposure).not.toHaveBeenCalled();
  });

  test('should cancel a pending exposure when the element scrolls below half visible', () => {
    const element = document.createElement('div');
    element.id = 'scrolled-away';

    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 0.6,
    });

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION / 2);

    // Still touching the viewport, but no longer visible enough to count.
    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 0.4,
      rootBounds: rect(1024, 768),
      intersectionRect: rect(1024, 100),
    });

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION * 1.5);
    expect(onExposure).not.toHaveBeenCalled();
  });

  test('should expose an element taller than the viewport once it fills half the viewport', () => {
    const element = document.createElement('div');
    element.id = 'taller-than-viewport';

    // A 2560px tall element can only ever reach a ratio of 0.3 in a 768px viewport.
    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 0.3,
      rootBounds: rect(1024, 768),
      intersectionRect: rect(1024, 768),
    });

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION * 1.5);
    expect(onExposure).toHaveBeenCalledWith('div#taller-than-viewport');
  });

  test('should clear all timers and exposure map on reset', () => {
    const element1 = document.createElement('div');
    element1.id = 'reset-div-1';
    const element2 = document.createElement('div');
    element2.id = 'reset-div-2';
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    // Start element 2 exposure and complete it
    triggerExposure({
      isIntersecting: true,
      target: element2,
      intersectionRatio: 1.0,
    });
    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION * 1.5);
    expect(onExposure).toHaveBeenCalledWith('div#reset-div-2');
    onExposure.mockClear();

    // Start element 1 exposure (will be pending)
    triggerExposure({
      isIntersecting: true,
      target: element1,
      intersectionRatio: 1.0,
    });

    // Call reset
    reset();

    // Expect pending timer for element 1 to be cleared
    expect(clearTimeoutSpy).toHaveBeenCalled();

    // Fast forward to see if pending timer fires (should not)
    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION * 1.5);
    expect(onExposure).not.toHaveBeenCalledWith('div#reset-div-1');

    // Re-expose element 2 (should work again because map was cleared)
    triggerExposure({
      isIntersecting: true,
      target: element2,
      intersectionRatio: 1.0,
    });
    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION * 1.5);
    expect(onExposure).toHaveBeenCalledWith('div#reset-div-2');
  });
});
