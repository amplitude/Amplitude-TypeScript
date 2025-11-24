import { trackScroll } from '../../src/autocapture/track-scroll';
import { ObservablesEnum } from '../../src/autocapture-plugin';
import { BrowserClient } from '@amplitude/analytics-core';

describe('trackScroll', () => {
  let scrollObservable: any;
  let allObservables: any;
  let unsubscribe: () => void;
  let triggerScroll: () => void;
  let amplitude: BrowserClient;

  beforeEach(() => {
    // Mock Observable
    const observers: Array<() => void> = [];
    scrollObservable = {
      subscribe: jest.fn((fn) => {
        observers.push(fn);
        return {
          unsubscribe: jest.fn(() => {
            const index = observers.indexOf(fn);
            if (index > -1) observers.splice(index, 1);
          }),
        };
      }),
    };

    triggerScroll = () => {
      observers.forEach((fn) => fn());
    };

    allObservables = {
      [ObservablesEnum.ScrollObservable]: scrollObservable,
    };

    amplitude = {} as BrowserClient; // unused

    // Reset window scroll properties
    Object.defineProperty(window, 'scrollX', { value: 0, writable: true });
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
    Object.defineProperty(window, 'pageXOffset', { value: 0, writable: true });
    Object.defineProperty(window, 'pageYOffset', { value: 0, writable: true });
  });

  afterEach(() => {
    if (unsubscribe) unsubscribe();
    jest.clearAllMocks();
  });

  // Helper to set window scroll
  const setScroll = (x: number, y: number) => {
    Object.defineProperty(window, 'scrollX', { value: x, writable: true });
    Object.defineProperty(window, 'scrollY', { value: y, writable: true });
    Object.defineProperty(window, 'pageXOffset', { value: x, writable: true });
    Object.defineProperty(window, 'pageYOffset', { value: y, writable: true });
  };

  test('should update state on scroll', () => {
    const tracker = trackScroll({
      amplitude,
      allObservables,
    });
    unsubscribe = tracker.unsubscribe;

    setScroll(100, 200);
    triggerScroll();

    expect(tracker.getState().maxX).toBe(100);
    expect(tracker.getState().maxY).toBe(200);
  });

  test('should keep max values when scrolling back', () => {
    const tracker = trackScroll({
      amplitude,
      allObservables,
    });
    unsubscribe = tracker.unsubscribe;

    // Scroll down/right
    setScroll(100, 200);
    triggerScroll();
    expect(tracker.getState().maxX).toBe(100);
    expect(tracker.getState().maxY).toBe(200);

    // Scroll back up/left
    setScroll(50, 50);
    triggerScroll();
    expect(tracker.getState().maxX).toBe(100); // Should remain 100
    expect(tracker.getState().maxY).toBe(200); // Should remain 200

    // Scroll further down/right
    setScroll(150, 300);
    triggerScroll();
    expect(tracker.getState().maxX).toBe(150);
    expect(tracker.getState().maxY).toBe(300);
  });

  test('should handle missing scroll properties gracefully (fallback to 0)', () => {
    const tracker = trackScroll({
      amplitude,
      allObservables,
    });
    unsubscribe = tracker.unsubscribe;

    // Simulate environment where properties are missing or undefined
    Object.defineProperty(window, 'scrollX', { value: undefined, writable: true });
    Object.defineProperty(window, 'scrollY', { value: undefined, writable: true });
    Object.defineProperty(window, 'pageXOffset', { value: undefined, writable: true });
    Object.defineProperty(window, 'pageYOffset', { value: undefined, writable: true });

    triggerScroll();

    expect(tracker.getState().maxX).toBe(0);
    expect(tracker.getState().maxY).toBe(0);
  });

  test('should reset state', () => {
    const tracker = trackScroll({
      amplitude,
      allObservables,
    });
    unsubscribe = tracker.unsubscribe;

    setScroll(100, 200);
    triggerScroll();
    expect(tracker.getState().maxX).toBe(100);
    expect(tracker.getState().maxY).toBe(200);

    tracker.reset();
    expect(tracker.getState().maxX).toBe(0);
    expect(tracker.getState().maxY).toBe(0);
  });
});
