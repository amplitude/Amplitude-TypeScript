import { trackExposure } from '../../src/autocapture/track-exposure';
import { AllWindowObservables, ObservablesEnum } from '../../src/autocapture-plugin';
import { DataExtractor } from '../../src';

// Mock finder to avoid DOM complexity dependencies
jest.mock('../../src/libs/finder', () => ({
  finder: (element: Element) => {
    return element.id ? `#${element.id}` : element.tagName.toLowerCase();
  },
}));

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

    expect(onExposure).toHaveBeenCalledWith('#test-div');
  });

  test('should not mark element as exposed if it becomes invisible before 2 seconds', () => {
    const element = document.createElement('div');
    element.id = 'test-div-cancel';

    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 1.0,
    });

    jest.advanceTimersByTime(1000);

    // Element leaves viewport
    triggerExposure({
      isIntersecting: false,
      target: element,
      intersectionRatio: 0,
    });

    jest.advanceTimersByTime(1500);

    expect(onExposure).not.toHaveBeenCalled();
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

    jest.advanceTimersByTime(2000);
    expect(onExposure).toHaveBeenCalledWith('#test-div-repeat');
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

    jest.advanceTimersByTime(1000);

    // Start element 2
    triggerExposure({
      isIntersecting: true,
      target: element2,
      intersectionRatio: 1.0,
    });

    // Element 1 finishes
    jest.advanceTimersByTime(1000);
    expect(onExposure).toHaveBeenCalledWith('#div-1');
    expect(onExposure).not.toHaveBeenCalledWith('#div-2');

    // Element 2 finishes
    jest.advanceTimersByTime(1000);
    expect(onExposure).toHaveBeenCalledWith('#div-2');
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

    jest.advanceTimersByTime(500);

    triggerExposure({
      isIntersecting: false,
      target: element,
      intersectionRatio: 0.5, // < 1.0
    });

    expect(clearTimeoutSpy).toHaveBeenCalled();

    jest.advanceTimersByTime(2000);
    expect(onExposure).not.toHaveBeenCalled();
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
    jest.advanceTimersByTime(2000);
    expect(onExposure).toHaveBeenCalledWith('#reset-div-2');
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
    jest.advanceTimersByTime(2000);
    expect(onExposure).not.toHaveBeenCalledWith('#reset-div-1');

    // Re-expose element 2 (should work again because map was cleared)
    triggerExposure({
      isIntersecting: true,
      target: element2,
      intersectionRatio: 1.0,
    });
    jest.advanceTimersByTime(2000);
    expect(onExposure).toHaveBeenCalledWith('#reset-div-2');
  });
});
