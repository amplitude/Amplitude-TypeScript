/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-empty-function */

import { BrowserClient, Observable, Unsubscribable } from '@amplitude/analytics-core';
import {
  createMouseDirectionChangeObservable,
  createThrashedCursorObservable,
  trackThrashedCursor,
} from '../../src/autocapture/track-thrashed-cursor';
import { AllWindowObservables } from '../../src/frustration-plugin';
import { ObservablesEnum } from '../../src/autocapture-plugin';
import { createMockBrowserClient } from '../mock-browser-client';
import { AMPLITUDE_THRASHED_CURSOR_EVENT } from '../../src/constants';

describe('trackThrashedCursor', () => {
  let amplitude: BrowserClient;
  let mouseMoveObserver: any = {};
  beforeEach(() => {
    amplitude = createMockBrowserClient();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function setupAndSimulateThrashedCursor(
    config: {
      directionChanges?: number;
      thresholdMs?: number;
      options?: {
        pageUrlAllowlist?: RegExp[];
        pageUrlExcludelist?: RegExp[];
      };
      windowLocation?: {
        href: string;
      };
      mouseMovements?: {
        iterations?: number;
        timeAdvance?: number;
      };
    } = {},
  ): Promise<{ mouseMoveObserver: any; startTime: number }> {
    const {
      directionChanges,
      thresholdMs,
      options = {
        pageUrlAllowlist: [],
        pageUrlExcludelist: [],
      },
      windowLocation,
      mouseMovements = {
        iterations: 10,
        timeAdvance: 1,
      },
    } = config;

    if (windowLocation) {
      Object.defineProperty(window, 'location', {
        value: windowLocation,
        writable: true,
      });
    }

    const promise = new Promise<void>((resolve) => {
      trackThrashedCursor({
        amplitude,
        allObservables: {
          [ObservablesEnum.MouseMoveObservable]: new Observable<MouseEvent>((observer) => {
            mouseMoveObserver = observer;
            resolve();
          }),
        } as AllWindowObservables,
        ...(directionChanges !== undefined && { directionChanges }),
        ...(thresholdMs !== undefined && { thresholdMs }),
        options,
      });
    });

    jest.runAllTimers();
    await promise;

    const startTime = +Date.now();
    if (mouseMoveObserver.next) {
      // simulate a circular mouse motion
      const origin = { clientX: 100, clientY: 100 };
      const destination = { clientX: 101, clientY: 101 };
      for (let i = 0; i < mouseMovements.iterations!; i++) {
        if (i % 2 === 0) {
          mouseMoveObserver.next(origin);
        } else {
          mouseMoveObserver.next(destination);
        }
        jest.advanceTimersByTime(mouseMovements.timeAdvance!);
      }
    }
    jest.runAllTimers();

    return { mouseMoveObserver, startTime };
  }

  it('should track thrashed cursor', async () => {
    const { startTime } = await setupAndSimulateThrashedCursor({
      mouseMovements: {
        iterations: 20,
        timeAdvance: 100,
      },
    });
    expect(amplitude.track).toHaveBeenCalledWith(AMPLITUDE_THRASHED_CURSOR_EVENT, undefined, { time: startTime + 200 });
  });

  it('should track thrashed cursor with custom threshold and window ms', async () => {
    await setupAndSimulateThrashedCursor({
      directionChanges: 5,
      thresholdMs: 100,
    });
    expect(amplitude.track).toHaveBeenCalledWith(AMPLITUDE_THRASHED_CURSOR_EVENT, undefined, {
      time: expect.any(Number),
    });
  });

  it('should not track thrashed cursor when pageUrlExcludelist is set', async () => {
    await setupAndSimulateThrashedCursor({
      directionChanges: 5,
      thresholdMs: 100,
      windowLocation: {
        href: 'http://localhost/test',
      },
      options: {
        pageUrlAllowlist: [],
        pageUrlExcludelist: [new RegExp('/test')],
      },
    });
    expect(amplitude.track).not.toHaveBeenCalled();
  });

  it('should not track thrashed cursor when pageUrlAllowlist is set', async () => {
    await setupAndSimulateThrashedCursor({
      directionChanges: 5,
      thresholdMs: 100,
      windowLocation: {
        href: 'http://localhost/nomatch',
      },
      options: {
        pageUrlAllowlist: [new RegExp('/match')],
        pageUrlExcludelist: [],
      },
    });
    expect(amplitude.track).not.toHaveBeenCalled();
  });
});

describe('createMouseDirectionChangeObservable', () => {
  let mouseMoveObservable: any;
  let mouseMoveObserver: any;
  let allWindowObservables: AllWindowObservables;
  let directionChangeObservable: Observable<string>;
  let subscription: Unsubscribable | undefined;
  let subscriptionPromise: Promise<string>;

  beforeEach(() => {
    mouseMoveObservable = new Observable<any>((observer) => {
      mouseMoveObserver = observer;
    });

    allWindowObservables = {
      [ObservablesEnum.MouseMoveObservable]: mouseMoveObservable,
    } as AllWindowObservables;

    directionChangeObservable = createMouseDirectionChangeObservable({
      allWindowObservables,
    });

    subscriptionPromise = new Promise<string>((resolve) => {
      subscription = directionChangeObservable.subscribe((axis) => {
        resolve(axis);
      });
    });
  });

  afterEach(() => {
    subscription?.unsubscribe();
    jest.clearAllMocks();
  });

  it('should emit X direction change when mouse moves to the right', async () => {
    mouseMoveObserver.next({ clientX: 1, clientY: 1 });
    mouseMoveObserver.next({ clientX: 2, clientY: 1 });
    mouseMoveObserver.next({ clientX: 1, clientY: 1 });
    const axis = await subscriptionPromise;
    expect(axis).toEqual('x');
  });

  it('should emit X direction change when mouse moves to the left', async () => {
    mouseMoveObserver.next({ clientX: 2, clientY: 1 });
    mouseMoveObserver.next({ clientX: 1, clientY: 1 });
    mouseMoveObserver.next({ clientX: 2, clientY: 1 });
    const axis = await subscriptionPromise;
    expect(axis).toEqual('x');
  });

  it('should emit Y direction change when mouse moves up', async () => {
    mouseMoveObserver.next({ clientX: 1, clientY: 1 });
    mouseMoveObserver.next({ clientX: 1, clientY: 2 });
    mouseMoveObserver.next({ clientX: 1, clientY: 1 });
    const axis = await subscriptionPromise;
    expect(axis).toEqual('y');
  });

  it('should emit Y direction change when mouse moves down', async () => {
    mouseMoveObserver.next({ clientX: 1, clientY: 2 });
    mouseMoveObserver.next({ clientX: 1, clientY: 1 });
    mouseMoveObserver.next({ clientX: 1, clientY: 2 });
    const axis = await subscriptionPromise;
    expect(axis).toEqual('y');
  });
});

describe('createThrashedCursorObservable', () => {
  let mouseDirectionChangeObservable: Observable<'x' | 'y'>;
  let directionChangeObserver: any;
  let thrashedCursorObservable: Observable<number>;
  let subscription: Unsubscribable | undefined;
  let emittedTimes: number[];
  let startTime: number;
  const DEFAULT_THRESHOLD = 10;
  const DEFAULT_WINDOW_MS = 2000;

  beforeEach(() => {
    jest.useFakeTimers();
    emittedTimes = [];
    mouseDirectionChangeObservable = new Observable<'x' | 'y'>((observer) => {
      directionChangeObserver = observer;
    });

    thrashedCursorObservable = createThrashedCursorObservable({
      mouseDirectionChangeObservable: mouseDirectionChangeObservable as any,
    });

    subscription = thrashedCursorObservable.subscribe((time) => {
      emittedTimes.push(time);
    });
    startTime = +Date.now();
  });

  afterEach(() => {
    subscription?.unsubscribe();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('should not emit when direction changes are below threshold', () => {
    for (let i = 0; i < DEFAULT_THRESHOLD - 1; i++) {
      jest.advanceTimersByTime(100);
      directionChangeObserver.next('x');
    }
    jest.advanceTimersByTime(DEFAULT_WINDOW_MS + 100);
    expect(emittedTimes).toHaveLength(0);
  });

  it('should emit when X axis direction changes meet threshold within window', async () => {
    for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
      directionChangeObserver.next('x');
      jest.advanceTimersByTime(100);
    }
    await jest.runAllTimersAsync();
    expect(emittedTimes).toEqual([startTime]);
  });

  it('should emit when Y axis direction changes meet threshold within window', async () => {
    for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
      directionChangeObserver.next('y');
      jest.advanceTimersByTime(100);
    }
    await jest.runAllTimersAsync();
    expect(emittedTimes).toEqual([startTime]);
  });

  it('should emit when both X and Y axes meet threshold', async () => {
    // Emit 10 X and Y direction changes
    for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
      directionChangeObserver.next('x');
      jest.advanceTimersByTime(50);
      directionChangeObserver.next('y');
      jest.advanceTimersByTime(50);
    }
    await jest.runAllTimersAsync();
    expect(emittedTimes.length).toBeGreaterThan(0);
    expect(emittedTimes).toEqual([startTime]);
  });

  it('should not emit when direction changes exceed window time', () => {
    const mouseMoveIntervals = DEFAULT_WINDOW_MS / (DEFAULT_THRESHOLD - 1) + 10;
    for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
      directionChangeObserver.next('x');
      jest.advanceTimersByTime(mouseMoveIntervals);
    }
    jest.advanceTimersByTime(100);
    expect(emittedTimes).toHaveLength(0);
  });

  it('should only trigger one thrashed cursor if there are more mouse moves than threshold', async () => {
    for (let i = 0; i < DEFAULT_THRESHOLD + 100; i++) {
      directionChangeObserver.next('x');
      jest.advanceTimersByTime(100);
    }
    expect(emittedTimes).toHaveLength(0);
    await jest.runAllTimersAsync();
    expect(emittedTimes).toEqual([startTime]);
  });

  it('should trigger two thrashed cursors if there is time between them', async () => {
    // first thrashed cursor
    for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
      directionChangeObserver.next('x');
      jest.advanceTimersByTime(100);
    }
    await jest.runAllTimersAsync();

    // second thrashed cursor
    jest.advanceTimersByTime(DEFAULT_WINDOW_MS + 100);
    const secondStartTime = +Date.now();
    for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
      directionChangeObserver.next('x');
      jest.advanceTimersByTime(100);
    }
    await jest.runAllTimersAsync();
    expect(emittedTimes).toEqual([startTime, secondStartTime]);
  });

  it('should trigger one thrashed cursor if trailing window is above threshold', async () => {
    for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
      directionChangeObserver.next('x');
      jest.advanceTimersByTime(100);
    }
    jest.advanceTimersByTime(DEFAULT_WINDOW_MS - 100);
    directionChangeObserver.next('x');
    expect(emittedTimes).toEqual([startTime]);
  });

  it('should use custom threshold and window ms', async () => {
    const customWindowMs = 10;
    const customThreshold = 5;
    thrashedCursorObservable = createThrashedCursorObservable({
      mouseDirectionChangeObservable: mouseDirectionChangeObservable as any,
      thresholdMs: customWindowMs,
      directionChanges: customThreshold,
    });
    subscription?.unsubscribe();
    emittedTimes = [];
    subscription = thrashedCursorObservable.subscribe((time) => {
      emittedTimes.push(time);
    });

    for (let i = 0; i < customThreshold; i++) {
      directionChangeObserver.next('x');
      jest.advanceTimersByTime(2);
    }
    await jest.runAllTimersAsync();
    expect(emittedTimes).toEqual([startTime]);
  });

  it('should trigger a start time when the first direction change is made', async () => {
    const testStartTime = +Date.now();
    directionChangeObserver.next('x');
    jest.advanceTimersByTime(DEFAULT_WINDOW_MS + 100);
    const thrashedCursorStartTime = +Date.now();
    for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
      directionChangeObserver.next('x');
      jest.advanceTimersByTime(100);
    }
    await jest.runAllTimersAsync();
    expect(emittedTimes[0]).toBeGreaterThan(testStartTime);
    expect(emittedTimes).toEqual([thrashedCursorStartTime]);
  });

  it('should slide window to the right when direction changes are above threshold', async () => {
    // run a direction change and wait 1.5 seconds
    directionChangeObserver.next('x');
    jest.advanceTimersByTime(DEFAULT_WINDOW_MS - 500);

    // run 10 direction changes over 1 second; which will push the first change out of the window
    const expectedStartTime = +Date.now();
    for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
      directionChangeObserver.next('x');
      jest.advanceTimersByTime(100);
    }
    await jest.runAllTimersAsync();

    // expect the start time to be the start of the last 10 changes and not the first change
    expect(emittedTimes).toEqual([expectedStartTime]);
  });
});
