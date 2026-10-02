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
    expect(tracker.getState().minY).toBe(0);
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
    expect(tracker.getState().minY).toBe(0);

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
    expect(tracker.getState().minY).toBe(0);
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
    expect(tracker.getState().minY).toBe(0);
  });

  test('should record only the scroll position at attach, not positions from before the tracker existed', () => {
    // A visitor can scroll to the bottom and back before the SDK loads. There is
    // no scroll listener yet, so the earlier peak is gone; the sample at attach
    // is the whole range.
    setScroll(80, 1600);
    setScroll(20, 480);

    const tracker = trackScroll({
      amplitude,
      allObservables,
    });
    unsubscribe = tracker.unsubscribe;

    expect(tracker.getState()).toEqual({ maxX: 20, maxY: 480, minY: 480 });
  });

  test('should seed from page offsets when scrollX and scrollY are missing', () => {
    Object.defineProperty(window, 'scrollX', { value: undefined, writable: true });
    Object.defineProperty(window, 'scrollY', { value: undefined, writable: true });
    Object.defineProperty(window, 'pageXOffset', { value: 12, writable: true });
    Object.defineProperty(window, 'pageYOffset', { value: 340, writable: true });

    const tracker = trackScroll({
      amplitude,
      allObservables,
    });
    unsubscribe = tracker.unsubscribe;

    expect(tracker.getState()).toEqual({ maxX: 12, maxY: 340, minY: 340 });
  });

  test('should seed min and max from the scroll position at attach time', () => {
    setScroll(25, 480);

    const tracker = trackScroll({
      amplitude,
      allObservables,
    });
    unsubscribe = tracker.unsubscribe;

    expect(tracker.getState()).toEqual({ maxX: 25, maxY: 480, minY: 480 });
    // Already seeded; a second seed must not run and cannot clear the range.
    expect(tracker.seed()).toBe(false);

    setScroll(10, 120);
    triggerScroll();
    expect(tracker.getState()).toEqual({ maxX: 25, maxY: 480, minY: 120 });

    setScroll(40, 900);
    triggerScroll();
    expect(tracker.getState()).toEqual({ maxX: 40, maxY: 900, minY: 120 });
  });

  test('should re-seed after reset from the current scroll position', () => {
    const tracker = trackScroll({
      amplitude,
      allObservables,
    });
    unsubscribe = tracker.unsubscribe;

    setScroll(100, 200);
    triggerScroll();
    tracker.reset();

    setScroll(15, 640);
    expect(tracker.isAwaitingSeed()).toBe(true);
    expect(tracker.seed()).toBe(true);
    expect(tracker.isAwaitingSeed()).toBe(false);
    expect(tracker.getState()).toEqual({ maxX: 15, maxY: 640, minY: 640 });
    expect(tracker.seed()).toBe(false);
    expect(tracker.getState().maxY).toBe(640);
  });

  test('should treat the first scroll after reset as the new baseline when seed was not called', () => {
    const tracker = trackScroll({
      amplitude,
      allObservables,
    });
    unsubscribe = tracker.unsubscribe;

    setScroll(100, 200);
    triggerScroll();
    tracker.reset();

    setScroll(30, 450);
    triggerScroll();
    expect(tracker.getState()).toEqual({ maxX: 30, maxY: 450, minY: 450 });

    setScroll(30, 100);
    triggerScroll();
    expect(tracker.getState()).toEqual({ maxX: 30, maxY: 450, minY: 100 });
  });
});
