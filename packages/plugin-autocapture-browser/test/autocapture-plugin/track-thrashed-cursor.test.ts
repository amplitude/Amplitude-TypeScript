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

  it('should track thrashed cursor', async () => {
    const promise = new Promise<void>((resolve) => {
      trackThrashedCursor({
        amplitude,
        allObservables: {
          [ObservablesEnum.MouseMoveObservable]: new Observable<MouseEvent>((observer) => {
            mouseMoveObserver = observer;
            resolve();
          }),
        } as AllWindowObservables,
      });
    });
    jest.runAllTimers();
    await promise;
    const startTime = +Date.now();
    if (mouseMoveObserver.next) {
      // simulate a circular mouse motion
      const origin = { clientX: 100, clientY: 100 };
      const destination = { clientX: 101, clientY: 101 };
      for (let i = 0; i < 20; i++) {
        if (i % 2 === 0) {
          mouseMoveObserver.next(origin);
        } else {
          mouseMoveObserver.next(destination);
        }
        jest.advanceTimersByTime(100);
      }
    }
    jest.runAllTimers();
    expect(amplitude.track).toHaveBeenCalledWith(AMPLITUDE_THRASHED_CURSOR_EVENT, {}, { time: startTime + 200 });
  });

  it('should track thrashed cursor with custom threshold and window ms', async () => {
    const promise = new Promise<void>((resolve) => {
      trackThrashedCursor({
        amplitude,
        allObservables: {
          [ObservablesEnum.MouseMoveObservable]: new Observable<MouseEvent>((observer) => {
            mouseMoveObserver = observer;
            resolve();
          }),
        } as AllWindowObservables,
        directionChanges: 5,
        thresholdMs: 100,
      });
    });
    jest.runAllTimers();
    await promise;
    if (mouseMoveObserver.next) {
      // simulate a circular mouse motion
      const origin = { clientX: 100, clientY: 100 };
      const destination = { clientX: 101, clientY: 101 };
      for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) {
          mouseMoveObserver.next(origin);
        } else {
          mouseMoveObserver.next(destination);
        }
        jest.advanceTimersByTime(1);
      }
    }
    jest.runAllTimers();
    expect(amplitude.track).toHaveBeenCalledWith(AMPLITUDE_THRASHED_CURSOR_EVENT, {}, { time: expect.any(Number) });
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

  it('should trigger two thrashed cursors if trailing window is too long', async () => {
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
});
