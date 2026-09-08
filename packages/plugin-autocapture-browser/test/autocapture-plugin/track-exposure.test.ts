import { trackExposure } from '../../src/autocapture/track-exposure';
import { AllWindowObservables, ObservablesEnum } from '../../src/autocapture-plugin';
import { DataExtractor } from '../../src';
import { DEFAULT_EXPOSURE_DURATION } from '@amplitude/analytics-core';

describe('trackExposure', () => {
  let exposureObservable: any;
  let scrollObservable: any;
  let allObservables: AllWindowObservables;
  let onExposure: jest.Mock;
  let unsubscribe: () => void;
  let reset: () => void;
  let exposureObservers: Array<(val: any) => void> = [];
  let scrollObservers: Array<(val: any) => void> = [];

  beforeEach(() => {
    jest.useFakeTimers();
    onExposure = jest.fn();
    exposureObservers = [];
    scrollObservers = [];
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 700,
      bottom: 800,
      left: 0,
      right: 100,
      width: 100,
      height: 100,
    } as DOMRect);

    const observable = (observers: Array<(val: any) => void>) => ({
      subscribe: (fn: (val: any) => void) => {
        observers.push(fn);
        return {
          unsubscribe: () => {
            observers = observers.filter((o) => o !== fn);
          },
        };
      },
    });
    exposureObservable = observable(exposureObservers);
    scrollObservable = observable(scrollObservers);

    allObservables = {
      [ObservablesEnum.ExposureObservable]: exposureObservable,
      [ObservablesEnum.ScrollObservable]: scrollObservable,
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
    exposureObservers.forEach((observer) => observer(entry));
  };

  const triggerScroll = () => {
    scrollObservers.forEach((observer) => observer(new Event('scroll')));
  };

  const setRect = (
    element: Element,
    { top, height = 100, left = 0, width = 100 }: { top: number; height?: number; left?: number; width?: number },
  ) => {
    element.getBoundingClientRect = jest.fn(
      () =>
        ({
          top,
          bottom: top + height,
          left,
          right: left + width,
          width,
          height,
        } as DOMRect),
    );
  };

  test('should mark element as exposed after its mid-height line is visible for the exposure duration', () => {
    const element = document.createElement('div');
    element.id = 'test-div';
    setRect(element, { top: 700 });

    triggerExposure({
      isIntersecting: true,
      target: element,
    });

    // Should not be exposed yet
    expect(onExposure).not.toHaveBeenCalled();

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION);

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

  test('should preserve a pending exposure timer across repeated intersecting callbacks', () => {
    const element = document.createElement('div');
    element.id = 'test-div-reobserve';
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 1.0,
    });
    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION / 2);

    // A rescan or scroll can evaluate an element again while its midpoint remains
    // visible. That must not restart the timer or slow scrolling would never expose.
    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 1.0,
    });
    expect(clearTimeoutSpy).not.toHaveBeenCalled();

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

  test('should expose an element once its mid-height line enters the viewport', () => {
    const element = document.createElement('div');
    element.id = 'half-visible';
    setRect(element, { top: 718 });

    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 0.1,
    });

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION * 1.5);
    expect(onExposure).toHaveBeenCalledWith('div#half-visible');
  });

  test('should expose when the mid-height line lands a sub-pixel below the viewport edge', () => {
    const element = document.createElement('div');
    element.id = 'sub-pixel-boundary';
    // jsdom reports innerHeight 768; engines disagree by well under a pixel on where
    // the line sits after an identical scroll, so this must not flip the outcome.
    setRect(element, { top: 718.6 });

    triggerExposure({
      isIntersecting: true,
      target: element,
    });

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION);
    expect(onExposure).toHaveBeenCalledWith('div#sub-pixel-boundary');
  });

  test('should not expose an element before its mid-height line enters the viewport', () => {
    const element = document.createElement('div');
    element.id = 'barely-visible';
    setRect(element, { top: 740 });

    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 0.3,
    });

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION * 1.5);
    expect(onExposure).not.toHaveBeenCalled();
  });

  test('should expose a zone taller than the viewport when its mid-height line is viewed', () => {
    const element = document.createElement('div');
    element.id = 'oversized';
    setRect(element, { top: -900, height: 2000 });

    triggerExposure({
      isIntersecting: true,
      target: element,
      // Less than half its area can ever be visible at once.
      intersectionRatio: 0.384,
    });

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION);
    expect(onExposure).toHaveBeenCalledWith('div#oversized');
  });

  test('should not expose a midpoint clipped by an overflow ancestor', () => {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'hidden';
    const element = document.createElement('div');
    element.id = 'vertically-clipped';
    scroller.appendChild(element);
    document.body.appendChild(scroller);

    setRect(scroller, { top: 200, height: 100 });
    setRect(element, { top: 100, height: 100 });
    triggerExposure({ isIntersecting: true, target: element });

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION);
    expect(onExposure).not.toHaveBeenCalled();
  });

  test('should not expose a midpoint below an overflow ancestor', () => {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    const element = document.createElement('div');
    element.id = 'clipped-below';
    scroller.appendChild(element);
    document.body.appendChild(scroller);

    setRect(scroller, { top: 0, height: 100 });
    setRect(element, { top: 100, height: 100 });
    triggerExposure({ isIntersecting: true, target: element });

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION);
    expect(onExposure).not.toHaveBeenCalled();
  });

  test('should expose through non-clipping ancestors and open shadow roots', () => {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const wrapper = document.createElement('div');
    const element = document.createElement('button');
    element.id = 'shadow-midpoint';
    wrapper.appendChild(element);
    root.appendChild(wrapper);
    document.body.appendChild(host);

    setRect(host, { top: 0, height: 300 });
    setRect(wrapper, { top: 0, height: 300 });
    setRect(element, { top: 100, height: 100 });
    triggerExposure({ isIntersecting: true, target: element });

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION);
    expect(onExposure).toHaveBeenCalledTimes(1);
  });

  test('should follow assigned slots when checking clipping ancestors', () => {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const slot = document.createElement('slot');
    slot.name = 'content';
    root.appendChild(slot);
    const element = document.createElement('button');
    element.slot = 'content';
    element.id = 'slotted-midpoint';
    host.appendChild(element);
    document.body.appendChild(host);

    expect(element.assignedSlot).toBe(slot);
    setRect(host, { top: 0, height: 300 });
    setRect(slot, { top: 0, height: 300 });
    setRect(element, { top: 100, height: 100 });
    triggerExposure({ isIntersecting: true, target: element });

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION);
    expect(onExposure).toHaveBeenCalledTimes(1);
  });

  test('should not expose a midpoint whose entire line is outside the viewport horizontally', () => {
    const element = document.createElement('div');
    element.id = 'horizontally-outside';

    setRect(element, { top: 100, height: 100, left: -100, width: 100 });
    triggerExposure({ isIntersecting: true, target: element });

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION);
    expect(onExposure).not.toHaveBeenCalled();
  });

  test('should start exposure on scroll when an intersecting zone reaches its mid-height line', () => {
    const element = document.createElement('div');
    element.id = 'scrolled-to-midpoint';
    setRect(element, { top: 740 });

    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 0.28,
    });
    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION);
    expect(onExposure).not.toHaveBeenCalled();

    setRect(element, { top: 700 });
    triggerScroll();
    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION);
    expect(onExposure).toHaveBeenCalledWith('div#scrolled-to-midpoint');
  });

  test('should cancel a pending exposure when the mid-height line leaves the viewport', () => {
    const element = document.createElement('div');
    element.id = 'scrolled-away';
    setRect(element, { top: 700 });

    triggerExposure({
      isIntersecting: true,
      target: element,
      intersectionRatio: 0.6,
    });

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION / 2);

    // Still touching the viewport, but its midpoint is now below it.
    setRect(element, { top: 740 });
    triggerScroll();

    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION * 1.5);
    expect(onExposure).not.toHaveBeenCalled();
  });

  test('should keep evaluating still-intersecting elements on scroll after a reset', () => {
    const element = document.createElement('div');
    element.id = 'reset-then-scroll';
    // Below its midpoint, so nothing is exposed before the reset.
    setRect(element, { top: 740 });
    triggerExposure({ isIntersecting: true, target: element });
    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION);
    expect(onExposure).not.toHaveBeenCalled();

    // A page-view end resets state. IntersectionObserver will not fire again for
    // an element that never stopped intersecting, so scroll must still drive it.
    reset();

    setRect(element, { top: 700 });
    triggerScroll();
    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION);
    expect(onExposure).toHaveBeenCalledWith('div#reset-then-scroll');
  });

  test('should restart the dwell on reset for an element already at its midpoint', () => {
    const element = document.createElement('div');
    element.id = 'reset-at-midpoint';
    setRect(element, { top: 700 });
    triggerExposure({ isIntersecting: true, target: element });
    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION);
    expect(onExposure).toHaveBeenCalledTimes(1);
    onExposure.mockClear();

    // New page view: the zone is still on screen at its midpoint, so it should be
    // reported again without requiring another scroll or intersection change.
    reset();
    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION);
    expect(onExposure).toHaveBeenCalledWith('div#reset-at-midpoint');
  });

  test('should stop evaluating elements after unsubscribe', () => {
    const element = document.createElement('div');
    element.id = 'after-unsubscribe';
    setRect(element, { top: 700 });
    triggerExposure({ isIntersecting: true, target: element });
    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION);
    onExposure.mockClear();

    unsubscribe();
    triggerScroll();
    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION);
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
    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION * 1.5);
    expect(onExposure).toHaveBeenCalledWith('div#reset-div-2');
    onExposure.mockClear();

    // Start element 1 exposure (will be pending)
    triggerExposure({
      isIntersecting: true,
      target: element1,
      intersectionRatio: 1.0,
    });
    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION * 0.6);

    // Call reset
    reset();

    // Expect the part-elapsed timer for element 1 to be cleared
    expect(clearTimeoutSpy).toHaveBeenCalled();

    // The partially elapsed dwell must not carry into the new page view: element 1
    // is still at its midpoint, so it re-exposes only after a full fresh duration.
    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION * 0.6);
    expect(onExposure).not.toHaveBeenCalledWith('div#reset-div-1');

    // Both zones remain at their midpoints, so the new page view reports both again
    // because the exposure map was cleared.
    jest.advanceTimersByTime(DEFAULT_EXPOSURE_DURATION * 0.6);
    expect(onExposure).toHaveBeenCalledWith('div#reset-div-1');
    expect(onExposure).toHaveBeenCalledWith('div#reset-div-2');
  });
});
