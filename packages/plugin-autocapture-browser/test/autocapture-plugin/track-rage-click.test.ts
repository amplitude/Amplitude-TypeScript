/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */

import { Subject } from 'rxjs';
import {
  BrowserClient,
  DEFAULT_RAGE_CLICK_THRESHOLD,
  DEFAULT_RAGE_CLICK_WINDOW_MS,
  Observable,
} from '@amplitude/analytics-core';
import { trackRageClicks } from '../../src/autocapture/track-rage-click';
import { AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT } from '../../src/constants';
import { AllWindowObservables, ObservablesEnum } from '../../src/autocapture-plugin';

describe('trackRageClicks', () => {
  let mockAmplitude: jest.Mocked<BrowserClient>;
  let clickObservable: Subject<any>;
  let clickObservableZen: Observable<any>;
  let allObservables: AllWindowObservables;
  let shouldTrackRageClick: jest.Mock;
  let clickObserver: any;

  beforeEach(() => {
    jest.useFakeTimers();
    mockAmplitude = {
      track: jest.fn(),
    } as any;

    clickObservable = new Subject();
    clickObservableZen = new Observable<any>((observer) => {
      clickObserver = observer;
    });

    allObservables = {
      [ObservablesEnum.ClickObservable]: clickObservable,
      [ObservablesEnum.ClickObservableZen]: clickObservableZen,
      [ObservablesEnum.ChangeObservable]: new Subject(),
      [ObservablesEnum.NavigateObservable]: new Subject(),
      [ObservablesEnum.MutationObservable]: new Subject(),
    };
    shouldTrackRageClick = jest.fn().mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('should track rage clicks when threshold is met', async () => {
    const subscription = trackRageClicks({
      amplitude: mockAmplitude,
      allObservables,
      shouldTrackRageClick,
    });

    // Create a mock element
    const mockElement = document.createElement('div');

    // Simulate clicks that exceed the time window to trigger immediate rage click detection
    const startTime = Date.now();

    // First click
    clickObserver.next({
      event: {
        target: mockElement,
        clientX: 100,
        clientY: 100,
      },
      timestamp: startTime,
      closestTrackedAncestor: mockElement,
      targetElementProperties: { id: 'test-element' },
    });

    // Add clicks that exceed the time window
    for (let i = 1; i < DEFAULT_RAGE_CLICK_THRESHOLD + 1; i++) {
      clickObserver.next({
        event: {
          target: mockElement,
          clientX: 100,
          clientY: 100,
        },
        timestamp: startTime + DEFAULT_RAGE_CLICK_WINDOW_MS + i * 50, // Exceed the time window
        closestTrackedAncestor: mockElement,
        targetElementProperties: { id: 'test-element' },
      });
    }

    // Advance timers to trigger the event processing
    await jest.runAllTimersAsync();

    expect(mockAmplitude.track).toHaveBeenCalledWith(
      AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT,
      expect.objectContaining({
        '[Amplitude] Click Count': DEFAULT_RAGE_CLICK_THRESHOLD,
        '[Amplitude] Clicks': expect.arrayContaining([
          expect.objectContaining({
            X: 100,
            Y: 100,
          }),
        ]),
        id: 'test-element',
      }),
      expect.any(Object),
    );
    subscription?.unsubscribe();
  });

  it('should track rage clicks via timer when threshold is met within time window', async () => {
    const subscription = trackRageClicks({
      amplitude: mockAmplitude,
      allObservables,
      shouldTrackRageClick,
    });

    // Create a mock element
    const mockElement = document.createElement('div');

    // Simulate clicks within the time window to trigger timer-based rage click detection
    const startTime = Date.now();
    for (let i = 0; i < DEFAULT_RAGE_CLICK_THRESHOLD; i++) {
      clickObserver.next({
        event: {
          target: mockElement,
          clientX: 100,
          clientY: 100,
        },
        timestamp: startTime + i * 50, // Space clicks 50ms apart (well within 1000ms window)
        closestTrackedAncestor: mockElement,
        targetElementProperties: { id: 'test-element' },
      });
    }

    // Advance timers to complete the timer and call amplitude.track directly
    await jest.runAllTimersAsync();

    expect(mockAmplitude.track).toHaveBeenCalledWith(
      AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT,
      expect.objectContaining({
        '[Amplitude] Click Count': DEFAULT_RAGE_CLICK_THRESHOLD,
        '[Amplitude] Clicks': expect.arrayContaining([
          expect.objectContaining({
            X: 100,
            Y: 100,
          }),
        ]),
        id: 'test-element',
      }),
      expect.any(Object),
    );
    subscription?.unsubscribe();
  });

  it('should track if clicks exceed threshold but first click is outside the rage click window', async () => {
    const subscription = trackRageClicks({
      amplitude: mockAmplitude,
      allObservables,
      shouldTrackRageClick,
    });

    // Create a mock element
    const mockElement = document.createElement('div');

    // Simulate clicks where the first click is outside the rage click window
    const startTime = Date.now();
    clickObserver.next({
      event: {
        target: mockElement,
        clientX: 100,
        clientY: 100,
      },
      timestamp: startTime,
      closestTrackedAncestor: mockElement,
      targetElementProperties: { id: 'test-element' },
    });

    // Add clicks within the rage click window
    for (let i = 0; i < DEFAULT_RAGE_CLICK_THRESHOLD; i++) {
      clickObserver.next({
        event: {
          target: mockElement,
          clientX: 100,
          clientY: 100,
        },
        timestamp: startTime + (DEFAULT_RAGE_CLICK_WINDOW_MS - 200) + i * 50,
        closestTrackedAncestor: mockElement,
        targetElementProperties: { id: 'test-element' },
      });
    }

    await jest.runAllTimersAsync();

    expect(mockAmplitude.track).toHaveBeenCalledTimes(1);
    subscription?.unsubscribe();
  });

  it('should not track when clicks are below threshold', () => {
    const subscription = trackRageClicks({
      amplitude: mockAmplitude,
      allObservables,
      shouldTrackRageClick,
    });

    // Create a mock element
    const mockElement = document.createElement('div');

    // Simulate only 3 clicks (below threshold of 4)
    const startTime = Date.now();
    for (let i = 0; i < DEFAULT_RAGE_CLICK_THRESHOLD - 1; i++) {
      clickObservable.next({
        event: {
          target: mockElement,
          clientX: 100,
          clientY: 100,
        },
        timestamp: startTime + i * 50,
        closestTrackedAncestor: mockElement,
        targetElementProperties: { id: 'test-element' },
      });
    }

    jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS + 100);

    expect(mockAmplitude.track).not.toHaveBeenCalled();
    subscription?.unsubscribe();
  });

  it('should not track when clicks are on different elements', () => {
    const subscription = trackRageClicks({
      amplitude: mockAmplitude,
      allObservables,
      shouldTrackRageClick,
    });

    // Create two different mock elements
    const mockElement1 = document.createElement('div');
    const mockElement2 = document.createElement('div');

    // Simulate clicks alternating between elements
    const startTime = Date.now();
    for (let i = 0; i < DEFAULT_RAGE_CLICK_THRESHOLD * 2; i++) {
      clickObservable.next({
        event: {
          target: i % 2 === 0 ? mockElement1 : mockElement2,
          clientX: 100,
          clientY: 100,
        },
        timestamp: startTime + i * 50,
        closestTrackedAncestor: i % 2 === 0 ? mockElement1 : mockElement2,
        targetElementProperties: { id: `test-element-${(i % 2) + 1}` },
      });
    }

    jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS + 100);

    expect(mockAmplitude.track).not.toHaveBeenCalled();
    subscription?.unsubscribe();
  });

  it('should not track untracked elements', () => {
    shouldTrackRageClick.mockReturnValue(false);

    const subscription = trackRageClicks({
      amplitude: mockAmplitude,
      allObservables,
      shouldTrackRageClick,
    });

    // element that is not tracked
    const mockElement = document.createElement('div');

    // Simulate 4 rapid clicks (threshold)
    const startTime = Date.now();
    for (let i = 0; i < DEFAULT_RAGE_CLICK_THRESHOLD; i++) {
      clickObservable.next({
        event: {
          target: mockElement,
          clientX: 100,
          clientY: 100,
        },
        timestamp: startTime + i * 50,
        closestTrackedAncestor: mockElement,
        targetElementProperties: { id: 'test-element' },
      });
    }

    jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS + 100);

    expect(mockAmplitude.track).not.toHaveBeenCalled();
    subscription?.unsubscribe();
  });

  it('should handle clicks that exceed the time window correctly', async () => {
    const subscription = trackRageClicks({
      amplitude: mockAmplitude,
      allObservables,
      shouldTrackRageClick,
    });

    // Create a mock element
    const mockElement = document.createElement('div');

    // Simulate clicks that exceed the time window
    const startTime = Date.now();

    // First set of clicks within the window
    for (let i = 0; i < DEFAULT_RAGE_CLICK_THRESHOLD; i++) {
      clickObserver.next({
        event: {
          target: mockElement,
          clientX: 100,
          clientY: 100,
        },
        timestamp: startTime + i * 50,
        closestTrackedAncestor: mockElement,
        targetElementProperties: { id: 'test-element' },
      });
    }

    await jest.runAllTimersAsync();

    // Add a click that exceeds the time window
    clickObserver.next({
      event: {
        target: mockElement,
        clientX: 100,
        clientY: 100,
      },
      timestamp: startTime + DEFAULT_RAGE_CLICK_WINDOW_MS + 100,
      closestTrackedAncestor: mockElement,
      targetElementProperties: { id: 'test-element' },
    });

    await jest.runAllTimersAsync();

    // Should track the first rage click event
    expect(mockAmplitude.track).toHaveBeenCalledTimes(1);
    subscription?.unsubscribe();
  });

  it('should trigger rage click when switching to different element with enough previous clicks', async () => {
    const subscription = trackRageClicks({
      amplitude: mockAmplitude,
      allObservables,
      shouldTrackRageClick,
    });

    // Create two different mock elements
    const mockElement1 = document.createElement('div');
    const mockElement2 = document.createElement('div');

    const startTime = Date.now();

    // Simulate enough clicks on the first element to meet threshold
    for (let i = 0; i < DEFAULT_RAGE_CLICK_THRESHOLD; i++) {
      clickObserver.next({
        event: {
          target: mockElement1,
          clientX: 100,
          clientY: 100,
        },
        timestamp: startTime + i * 50,
        closestTrackedAncestor: mockElement1,
        targetElementProperties: { id: 'test-element-1' },
      });
    }

    await jest.runAllTimersAsync();

    // Now click on a different element - this should trigger rage click for the previous element
    clickObserver.next({
      event: {
        target: mockElement2,
        clientX: 200,
        clientY: 200,
      },
      timestamp: startTime + DEFAULT_RAGE_CLICK_THRESHOLD * 50 + 100,
      closestTrackedAncestor: mockElement2,
      targetElementProperties: { id: 'test-element-2' },
    });

    await jest.runAllTimersAsync();

    // Should track the rage click event for the first element
    expect(mockAmplitude.track).toHaveBeenCalledWith(
      AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT,
      expect.objectContaining({
        '[Amplitude] Click Count': DEFAULT_RAGE_CLICK_THRESHOLD,
        '[Amplitude] Clicks': expect.arrayContaining([
          expect.objectContaining({
            X: 100,
            Y: 100,
          }),
        ]),
        id: 'test-element-1',
      }),
      expect.any(Object),
    );
    subscription?.unsubscribe();
  });

  it('should not trigger rage click when switching to different element without enough previous clicks', () => {
    const subscription = trackRageClicks({
      amplitude: mockAmplitude,
      allObservables,
      shouldTrackRageClick,
    });

    // Create two different mock elements
    const mockElement1 = document.createElement('div');
    const mockElement2 = document.createElement('div');

    const startTime = Date.now();

    // Simulate clicks on the first element but not enough to meet threshold
    for (let i = 0; i < DEFAULT_RAGE_CLICK_THRESHOLD - 1; i++) {
      clickObservable.next({
        event: {
          target: mockElement1,
          clientX: 100,
          clientY: 100,
        },
        timestamp: startTime + i * 50,
        closestTrackedAncestor: mockElement1,
        targetElementProperties: { id: 'test-element-1' },
      });
    }

    // Now click on a different element - this should NOT trigger rage click
    clickObservable.next({
      event: {
        target: mockElement2,
        clientX: 200,
        clientY: 200,
      },
      timestamp: startTime + (DEFAULT_RAGE_CLICK_THRESHOLD - 1) * 50 + 100,
      closestTrackedAncestor: mockElement2,
      targetElementProperties: { id: 'test-element-2' },
    });

    jest.advanceTimersByTime(100);

    // Should NOT track any rage click event
    expect(mockAmplitude.track).not.toHaveBeenCalled();
    subscription?.unsubscribe();
  });

  it('should not track rage clicks when threshold is met but clicks are out of bounds', () => {
    const subscription = trackRageClicks({
      amplitude: mockAmplitude,
      allObservables,
      shouldTrackRageClick,
    });

    // Create a mock element
    const mockElement = document.createElement('div');

    // Simulate clicks that exceed the time window to trigger immediate rage click detection
    const startTime = Date.now();

    // First click
    clickObservable.next({
      event: {
        target: mockElement,
        clientX: 100,
        clientY: 100,
      },
      timestamp: startTime,
      closestTrackedAncestor: mockElement,
      targetElementProperties: { id: 'test-element' },
    });

    // Add clicks that exceed the time window
    for (let i = 0; i < DEFAULT_RAGE_CLICK_THRESHOLD; i++) {
      clickObservable.next({
        event: {
          target: mockElement,
          clientX: i === DEFAULT_RAGE_CLICK_THRESHOLD - 1 ? 1000 : 100,
          clientY: i === DEFAULT_RAGE_CLICK_THRESHOLD - 1 ? 1000 : 100,
        },
        timestamp: startTime + DEFAULT_RAGE_CLICK_WINDOW_MS + i * 50, // Exceed the time window
        closestTrackedAncestor: mockElement,
        targetElementProperties: { id: 'test-element' },
      });
    }

    // Advance timers for the event to be processed
    jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS + 100); // Short wait since we're triggering immediate detection

    expect(mockAmplitude.track).not.toHaveBeenCalled();
    subscription?.unsubscribe();
  });
});
