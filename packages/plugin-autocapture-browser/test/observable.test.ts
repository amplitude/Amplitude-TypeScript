import { createExposureObservable } from '../src/observables';
import { Observable } from '@amplitude/analytics-core';
import { TimestampedEvent } from '../src/helpers';

describe('createExposureObservable', () => {
  let mutationObservable: Observable<TimestampedEvent<MutationRecord[]>>;
  let mockMutationObserver: { subscribe: jest.Mock };
  let mockIntersectionObserver: { observe: jest.Mock; unobserve: jest.Mock; disconnect: jest.Mock };
  let intersectionCallback: (entries: IntersectionObserverEntry[]) => void;
  let observers: ((value: TimestampedEvent<MutationRecord[]>) => void)[] = [];

  beforeEach(() => {
    observers = [];
    // Mock Mutation Observable
    mockMutationObserver = {
      subscribe: jest.fn((cb) => {
        observers.push(cb);
        return { unsubscribe: jest.fn() };
      }),
    };
    mutationObservable = mockMutationObserver as unknown as Observable<TimestampedEvent<MutationRecord[]>>;

    // Mock IntersectionObserver
    mockIntersectionObserver = {
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    };

    (global as any).IntersectionObserver = jest.fn((cb) => {
      intersectionCallback = cb;
      return mockIntersectionObserver;
    });

    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  test('should observe initial elements matching the allowlist', () => {
    const div = document.createElement('div');
    div.className = 'track-me';
    document.body.appendChild(div);

    const exposureObservable = createExposureObservable(mutationObservable, ['.track-me']);
    exposureObservable.subscribe(() => {
      return;
    });

    expect(mockIntersectionObserver.observe).toHaveBeenCalledWith(div);
  });

  test('should emit event when element intersects (visible)', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const listener = jest.fn();

    const exposureObservable = createExposureObservable(mutationObservable, ['div']);
    exposureObservable.subscribe(listener);

    // Simulate intersection
    const entry = {
      isIntersecting: true,
      intersectionRatio: 1.0,
      target: div,
    } as unknown as IntersectionObserverEntry;

    intersectionCallback([entry]);

    expect(listener).toHaveBeenCalledWith(entry);
  });

  test('should emit event when element leaves viewport (invisible)', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const listener = jest.fn();

    const exposureObservable = createExposureObservable(mutationObservable, ['div']);
    exposureObservable.subscribe(listener);

    // Simulate leaving viewport
    const entry = {
      isIntersecting: false,
      intersectionRatio: 0.5,
      target: div,
    } as unknown as IntersectionObserverEntry;

    intersectionCallback([entry]);

    expect(listener).toHaveBeenCalledWith(entry);
  });

  test('should observe new elements added via mutation that match allowlist', () => {
    const exposureObservable = createExposureObservable(mutationObservable, ['div']);
    exposureObservable.subscribe(() => {
      return;
    });

    // Simulate mutation adding a node
    const newDiv = document.createElement('div');
    const mutationRecord = {
      addedNodes: [newDiv] as unknown as NodeList,
    } as MutationRecord;

    // Trigger mutation subscription callback
    observers.forEach((cb) => {
      cb({
        event: [mutationRecord],
        timestamp: Date.now(),
        type: 'mutation',
      });
    });

    expect(mockIntersectionObserver.observe).toHaveBeenCalledWith(newDiv);
  });

  test('should NOT observe new elements added via mutation that do not match allowlist', () => {
    const exposureObservable = createExposureObservable(mutationObservable, ['.track-me']);
    exposureObservable.subscribe(() => {
      return;
    });

    // Reset observe calls from initial querySelectorAll
    mockIntersectionObserver.observe.mockClear();

    const newSpan = document.createElement('span');
    const mutationRecord = {
      addedNodes: [newSpan] as unknown as NodeList,
    } as MutationRecord;

    observers.forEach((cb) => {
      cb({
        event: [mutationRecord],
        timestamp: Date.now(),
        type: 'mutation',
      });
    });

    expect(mockIntersectionObserver.observe).not.toHaveBeenCalled();
  });

  test('should observe matching descendants within added mutation nodes', () => {
    const exposureObservable = createExposureObservable(mutationObservable, ['.track-me']);
    exposureObservable.subscribe(() => {
      return;
    });

    mockIntersectionObserver.observe.mockClear();

    // Container div that doesn't match, but has a child that does
    const container = document.createElement('div');
    const matchingChild = document.createElement('span');
    matchingChild.className = 'track-me';
    container.appendChild(matchingChild);

    const mutationRecord = {
      addedNodes: [container] as unknown as NodeList,
    } as MutationRecord;

    observers.forEach((cb) => {
      cb({
        event: [mutationRecord],
        timestamp: Date.now(),
        type: 'mutation',
      });
    });

    // Container doesn't match, but its child does
    expect(mockIntersectionObserver.observe).not.toHaveBeenCalledWith(container);
    expect(mockIntersectionObserver.observe).toHaveBeenCalledWith(matchingChild);
  });

  test('should skip non-Element nodes added via mutation', () => {
    const exposureObservable = createExposureObservable(mutationObservable, ['div']);
    exposureObservable.subscribe(() => {
      return;
    });

    mockIntersectionObserver.observe.mockClear();

    const textNode = document.createTextNode('hello');
    const mutationRecord = {
      addedNodes: [textNode] as unknown as NodeList,
    } as MutationRecord;

    observers.forEach((cb) => {
      cb({
        event: [mutationRecord],
        timestamp: Date.now(),
        type: 'mutation',
      });
    });

    expect(mockIntersectionObserver.observe).not.toHaveBeenCalled();
  });

  test('should disconnect observer on unsubscribe', () => {
    const exposureObservable = createExposureObservable(mutationObservable, ['div']);
    const subscription = exposureObservable.subscribe(() => {
      return;
    });

    subscription.unsubscribe();

    expect(mockIntersectionObserver.disconnect).toHaveBeenCalled();
  });

  test('should re-observe elements in the viewport when asked to reobserve', () => {
    const inViewport = document.createElement('div');
    const outOfViewport = document.createElement('div');
    document.body.appendChild(inViewport);
    document.body.appendChild(outOfViewport);

    let reobserve: (() => void) | undefined;
    const exposureObservable = createExposureObservable(mutationObservable, ['div'], (fn) => {
      reobserve = fn;
    });
    exposureObservable.subscribe(() => {
      return;
    });

    intersectionCallback([
      { isIntersecting: true, intersectionRatio: 1.0, target: inViewport } as unknown as IntersectionObserverEntry,
      { isIntersecting: false, intersectionRatio: 0.5, target: outOfViewport } as unknown as IntersectionObserverEntry,
    ]);

    mockIntersectionObserver.observe.mockClear();
    expect(reobserve).toBeDefined();
    reobserve?.();

    // Only the element in the viewport needs to be reported again
    expect(mockIntersectionObserver.unobserve).toHaveBeenCalledTimes(1);
    expect(mockIntersectionObserver.unobserve).toHaveBeenCalledWith(inViewport);
    expect(mockIntersectionObserver.observe).toHaveBeenCalledTimes(1);
    expect(mockIntersectionObserver.observe).toHaveBeenCalledWith(inViewport);

    // Reobserving again is a no-op until the observer reports the element as visible again
    mockIntersectionObserver.observe.mockClear();
    reobserve?.();
    expect(mockIntersectionObserver.observe).not.toHaveBeenCalled();
  });

  test('should not re-observe elements in the viewport that left the DOM', () => {
    const removed = document.createElement('div');
    document.body.appendChild(removed);

    let reobserve: (() => void) | undefined;
    const exposureObservable = createExposureObservable(mutationObservable, ['div'], (fn) => {
      reobserve = fn;
    });
    exposureObservable.subscribe(() => {
      return;
    });

    intersectionCallback([
      { isIntersecting: true, intersectionRatio: 1.0, target: removed } as unknown as IntersectionObserverEntry,
    ]);

    removed.remove();
    mockIntersectionObserver.observe.mockClear();
    reobserve?.();

    expect(mockIntersectionObserver.unobserve).toHaveBeenCalledWith(removed);
    expect(mockIntersectionObserver.observe).not.toHaveBeenCalled();
  });

  test('should clear the reobserve function on unsubscribe', () => {
    const registerReobserve = jest.fn();
    const exposureObservable = createExposureObservable(mutationObservable, ['div'], registerReobserve);
    const subscription = exposureObservable.subscribe(() => {
      return;
    });

    expect(registerReobserve).toHaveBeenCalledWith(expect.any(Function));

    subscription.unsubscribe();
    expect(registerReobserve).toHaveBeenLastCalledWith(undefined);
  });

  test('should handle missing IntersectionObserver support gracefully', () => {
    const originalIntersectionObserver = (global as any).IntersectionObserver;
    (global as any).IntersectionObserver = undefined;

    const exposureObservable = createExposureObservable(mutationObservable, ['div']);
    const subscription = exposureObservable.subscribe(() => {
      return;
    });

    subscription.unsubscribe();
    (global as any).IntersectionObserver = originalIntersectionObserver;
  });
});
