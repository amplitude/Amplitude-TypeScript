import * as AnalyticsCore from '@amplitude/analytics-core';
import { waitForDeferredRecordStart } from '../../src/utils/deferred-record-start';

type Listener = () => void;

function createScope(readyState: 'loading' | 'interactive' | 'complete', withIdle: boolean) {
  const listeners: Record<string, Listener[]> = {};
  const idleCallbacks: Array<() => void> = [];
  const scope = {
    document: { readyState },
    addEventListener: jest.fn((type: string, cb: Listener) => {
      (listeners[type] ||= []).push(cb);
    }),
    removeEventListener: jest.fn((type: string, cb: Listener) => {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== cb);
    }),
    ...(withIdle
      ? {
          requestIdleCallback: jest.fn((cb: () => void) => {
            idleCallbacks.push(cb);
            return idleCallbacks.length;
          }),
          cancelIdleCallback: jest.fn(),
        }
      : {}),
  };
  const fireLoad = () => {
    for (const cb of [...(listeners['load'] ?? [])]) cb();
  };
  const fireIdle = () => {
    for (const cb of idleCallbacks.splice(0)) cb();
  };
  return { scope, fireLoad, fireIdle, listeners };
}

describe('waitForDeferredRecordStart', () => {
  let globalSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    globalSpy?.mockRestore();
    jest.useRealTimers();
  });

  const settle = async <T>(promise: Promise<T>): Promise<T | 'pending'> => {
    let result: T | 'pending' = 'pending';
    void promise.then((value) => {
      result = value;
    });
    await Promise.resolve();
    await Promise.resolve();
    return result;
  };

  test("until: 'load' waits for the load event when the document is still loading", async () => {
    const { scope, fireLoad } = createScope('loading', true);
    globalSpy = jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(scope as unknown as typeof globalThis);

    const promise = waitForDeferredRecordStart({ enabled: true, until: 'load', delayMs: 0, maxWaitMs: 5000 });
    expect(await settle(promise)).toBe('pending');
    expect(scope.addEventListener).toHaveBeenCalledWith('load', expect.any(Function));

    jest.advanceTimersByTime(1200);
    fireLoad();

    const result = await promise;
    expect(result.resolvedBy).toBe('load');
    expect(result.waitedMs).toBe(1200);
    // The load listener and the max-wait timer are torn down once released.
    expect(scope.removeEventListener).toHaveBeenCalledWith('load', expect.any(Function));
    expect(jest.getTimerCount()).toBe(0);
  });

  test("until: 'load' resolves immediately when the document is already complete", async () => {
    const { scope } = createScope('complete', true);
    globalSpy = jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(scope as unknown as typeof globalThis);

    const result = await waitForDeferredRecordStart({ enabled: true, until: 'load', delayMs: 0, maxWaitMs: 5000 });
    expect(result.resolvedBy).toBe('load');
    expect(scope.addEventListener).not.toHaveBeenCalled();
  });

  test("until: 'idle' waits for load and then requestIdleCallback", async () => {
    const { scope, fireLoad, fireIdle } = createScope('loading', true);
    globalSpy = jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(scope as unknown as typeof globalThis);

    const promise = waitForDeferredRecordStart({ enabled: true, until: 'idle', delayMs: 0, maxWaitMs: 5000 });
    fireLoad();
    // Load alone is not enough — still waiting on the idle callback.
    expect(await settle(promise)).toBe('pending');
    expect(scope.requestIdleCallback).toHaveBeenCalledTimes(1);

    fireIdle();
    const result = await promise;
    expect(result.resolvedBy).toBe('idle');
  });

  test("until: 'idle' falls back to a macrotask after load when requestIdleCallback is unavailable", async () => {
    const { scope, fireLoad } = createScope('loading', false);
    globalSpy = jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(scope as unknown as typeof globalThis);

    const promise = waitForDeferredRecordStart({ enabled: true, until: 'idle', delayMs: 0, maxWaitMs: 5000 });
    fireLoad();
    expect(await settle(promise)).toBe('pending');

    jest.advanceTimersByTime(0);
    const result = await promise;
    expect(result.resolvedBy).toBe('idle');
  });

  test('delayMs adds a fixed delay after the milestone and reports resolvedBy: delay', async () => {
    const { scope, fireLoad } = createScope('loading', true);
    globalSpy = jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(scope as unknown as typeof globalThis);

    const promise = waitForDeferredRecordStart({ enabled: true, until: 'load', delayMs: 750, maxWaitMs: 5000 });
    fireLoad();
    expect(await settle(promise)).toBe('pending');

    jest.advanceTimersByTime(749);
    expect(await settle(promise)).toBe('pending');
    jest.advanceTimersByTime(1);

    const result = await promise;
    expect(result.resolvedBy).toBe('delay');
  });

  test('maxWaitMs releases the start when load never fires and cancels the pending listeners', async () => {
    const { scope, listeners } = createScope('loading', true);
    globalSpy = jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(scope as unknown as typeof globalThis);

    const promise = waitForDeferredRecordStart({ enabled: true, until: 'idle', delayMs: 0, maxWaitMs: 3000 });
    jest.advanceTimersByTime(3000);

    const result = await promise;
    expect(result.resolvedBy).toBe('max-wait');
    expect(result.waitedMs).toBe(3000);
    expect(listeners['load'] ?? []).toHaveLength(0);
  });

  test('maxWaitMs cancels a pending idle callback and resolves only once', async () => {
    const { scope, fireLoad, fireIdle } = createScope('loading', true);
    globalSpy = jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(scope as unknown as typeof globalThis);

    const promise = waitForDeferredRecordStart({ enabled: true, until: 'idle', delayMs: 0, maxWaitMs: 2000 });
    fireLoad();
    jest.advanceTimersByTime(2000);

    const result = await promise;
    expect(result.resolvedBy).toBe('max-wait');
    expect(scope.cancelIdleCallback).toHaveBeenCalledWith(1);

    // A late idle callback must not re-resolve or throw.
    expect(() => fireIdle()).not.toThrow();
  });

  test('resolves immediately-ish when there is no global scope', async () => {
    globalSpy = jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(undefined);

    const result = await waitForDeferredRecordStart({ enabled: true, until: 'load', delayMs: 0, maxWaitMs: 5000 });
    expect(result.resolvedBy).toBe('load');
  });
});
