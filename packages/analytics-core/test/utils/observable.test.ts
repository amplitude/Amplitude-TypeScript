import { Observable, asyncMap, merge, multicast } from '../../src/index';

/* eslint-disable jest/no-conditional-expect, @typescript-eslint/no-empty-function */

// Test helper functions
const createTimedObservable = <T>(values: T[], delay = 10): Observable<T> => {
  return new Observable<T>((observer) => {
    values.forEach((value, index) => {
      setTimeout(() => observer.next(value), index * delay);
    });
    setTimeout(() => observer.complete(), values.length * delay + 10);
  });
};

const createEmptyObservable = (delay = 10): Observable<any> => {
  return new Observable<any>((observer) => {
    setTimeout(() => observer.complete(), delay);
  });
};

const createImmediateErrorObservable = <T>(error: Error): Observable<T> => {
  return new Observable<T>((observer) => {
    setTimeout(() => observer.error(error), 10);
  });
};

const createObservableWithUnsubscribe = <T>(
  values: T[],
  onSubscribe: () => void,
  onUnsubscribe: () => void,
): Observable<T> => {
  return new Observable<T>((observer) => {
    onSubscribe();
    values.forEach((value, index) => {
      setTimeout(() => observer.next(value), index * 10);
    });
    setTimeout(() => observer.complete(), values.length * 10 + 10);
    return onUnsubscribe;
  });
};

interface SubscriptionResult<T> {
  results: T[];
  errors: any[];
  completed: boolean;
}

const subscribeToObservable = <T>(observable: Observable<T>): Promise<SubscriptionResult<T>> => {
  return new Promise<SubscriptionResult<T>>((resolve) => {
    const result: SubscriptionResult<T> = {
      results: [],
      errors: [],
      completed: false,
    };

    observable.subscribe({
      next: (value: T) => result.results.push(value),
      error: (error: any) => result.errors.push(error),
      complete: () => {
        result.completed = true;
        resolve(result);
      },
    });
  });
};

const subscribeToObservableWithError = <T>(observable: Observable<T>): Promise<SubscriptionResult<T>> => {
  return new Promise<SubscriptionResult<T>>((resolve) => {
    const result: SubscriptionResult<T> = {
      results: [],
      errors: [],
      completed: false,
    };

    observable.subscribe({
      next: (value: T) => result.results.push(value),
      error: (error: any) => {
        result.errors.push(error);
        resolve(result);
      },
      complete: () => {
        result.completed = true;
        resolve(result);
      },
    });
  });
};

interface MultiObserverResult<T> {
  observer1: SubscriptionResult<T>;
  observer2: SubscriptionResult<T>;
  observer3?: SubscriptionResult<T>;
}

const subscribeMultipleObservers = <T>(
  observable: Observable<T>,
  observerCount: 2 | 3 = 2,
): Promise<MultiObserverResult<T>> => {
  return new Promise<MultiObserverResult<T>>((resolve) => {
    const results: MultiObserverResult<T> = {
      observer1: { results: [], errors: [], completed: false },
      observer2: { results: [], errors: [], completed: false },
    };

    if (observerCount === 3) {
      results.observer3 = { results: [], errors: [], completed: false };
    }

    let completedCount = 0;
    const checkComplete = () => {
      completedCount++;
      const expectedCount = observerCount;
      if (completedCount === expectedCount) {
        resolve(results);
      }
    };

    observable.subscribe({
      next: (value: T) => results.observer1.results.push(value),
      error: (error: any) => {
        results.observer1.errors.push(error);
        checkComplete();
      },
      complete: () => {
        results.observer1.completed = true;
        checkComplete();
      },
    });

    observable.subscribe({
      next: (value: T) => results.observer2.results.push(value),
      error: (error: any) => {
        results.observer2.errors.push(error);
        checkComplete();
      },
      complete: () => {
        results.observer2.completed = true;
        checkComplete();
      },
    });

    if (observerCount === 3 && results.observer3) {
      observable.subscribe({
        next: (value: T) => results.observer3!.results.push(value),
        error: (error: any) => {
          results.observer3!.errors.push(error);
          checkComplete();
        },
        complete: () => {
          results.observer3!.completed = true;
          checkComplete();
        },
      });
    }
  });
};

describe('asyncMap', () => {
  test('should map values using async function and emit results in order', async () => {
    const source = createTimedObservable([1, 2, 3]);
    const asyncFn = jest.fn((value: number) => Promise.resolve(value * 2));
    const mappedObservable = asyncMap(source, asyncFn);
    const result = await subscribeToObservable(mappedObservable);

    expect(result.results).toEqual([2, 4, 6]);
    expect(result.errors).toHaveLength(0);
    expect(result.completed).toBe(true);
  });

  test('should handle async function errors', async () => {
    const source = createTimedObservable([1, 2, 3]);
    const asyncFn = jest.fn((value: number) => {
      if (value === 2) {
        return Promise.reject(new Error('Test error'));
      }
      return Promise.resolve(value);
    });

    const mappedObservable = asyncMap(source, asyncFn);
    const result = await subscribeToObservableWithError(mappedObservable);

    expect(result.errors[0].message).toBe('Test error');
    expect(result.results).toEqual([1]); // Only first value should be emitted
    expect(asyncFn).toHaveBeenCalledTimes(2); // Called for 1 and 2
  });

  test('should handle source observable errors', async () => {
    const source = new Observable<number>((observer) => {
      setTimeout(() => observer.next(1), 10);
      setTimeout(() => observer.error(new Error('Source error')), 20);
    });

    const asyncFn = jest.fn((value: number) => Promise.resolve(value * 2));
    const mappedObservable = asyncMap(source, asyncFn);
    const result = await subscribeToObservableWithError(mappedObservable);

    expect(result.errors[0].message).toBe('Source error');
    expect(result.results).toEqual([2]); // First value should be processed
    expect(asyncFn).toHaveBeenCalledTimes(1);
  });

  test('should handle empty source observable', async () => {
    const source = createEmptyObservable();
    const asyncFn = jest.fn((value: any) => Promise.resolve(value));
    const mappedObservable = asyncMap(source, asyncFn);
    const result = await subscribeToObservable(mappedObservable);

    expect(result.results).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.completed).toBe(true);
    expect(asyncFn).not.toHaveBeenCalled();
  });
});

describe('merge', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should merge two observables', async () => {
    const source1 = new Observable<number>((observer) => {
      observer.next(1);
      observer.complete();
    });
    const source2 = new Observable<number>((observer) => {
      observer.next(2);
      observer.complete();
    });
    const mergedObservable = merge(source1, source2);
    const results: number[] = [];
    mergedObservable.subscribe((value) => {
      results.push(value);
    });
    await jest.runAllTimersAsync();
    expect(results).toEqual([1, 2]);
  });

  test('should error if one of the observables errors', async () => {
    const source1 = new Observable<number>((observer) => {
      observer.next(1);
    });
    const source2 = new Observable<number>((observer) => {
      setTimeout(() => {
        observer.error(new Error('Error'));
      }, 10);
    });
    const mergedObservable = merge(source1, source2);
    const results: number[] = [];
    const errors: Error[] = [];
    mergedObservable.subscribe({
      next: (value) => results.push(value),
      error: (error) => errors.push(error),
      complete: () => {},
    });
    await jest.runAllTimersAsync();
    expect(results).toEqual([1]);
    expect(errors).toEqual([new Error('Error')]);
  });
});

describe('multicast', () => {
  test('should multicast values to multiple observers', async () => {
    const source = createTimedObservable([1, 2, 3]);
    const multicasted = multicast(source);
    const results = await subscribeMultipleObservers(multicasted);

    expect(results.observer1.results).toEqual([1, 2, 3]);
    expect(results.observer2.results).toEqual([1, 2, 3]);
    expect(results.observer1.completed).toBe(true);
    expect(results.observer2.completed).toBe(true);
  });

  test('should only subscribe to source once with multiple observers', async () => {
    let subscriptionCount = 0;
    const source = new Observable<number>((observer) => {
      subscriptionCount++;
      setTimeout(() => observer.next(1), 10);
      setTimeout(() => observer.next(2), 20);
      setTimeout(() => observer.complete(), 30);
    });

    const multicasted = multicast(source);
    const results = await subscribeMultipleObservers(multicasted, 3);

    expect(subscriptionCount).toBe(1); // Should only subscribe once
    expect(results.observer1.results).toEqual([1, 2]);
    expect(results.observer2.results).toEqual([1, 2]);
    expect(results.observer3!.results).toEqual([1, 2]);
  });

  test('should unsubscribe from source when all observers unsubscribe', async () => {
    let isSubscribed = false;
    let isUnsubscribed = false;
    const source = createObservableWithUnsubscribe(
      [1],
      () => {
        isSubscribed = true;
      },
      () => {
        isUnsubscribed = true;
      },
    );

    const multicasted = multicast(source);

    const unsubscribe1 = multicasted.subscribe({
      next: () => {},
      complete: () => {},
    });

    const unsubscribe2 = multicasted.subscribe({
      next: () => {},
      complete: () => {},
    });

    // Wait for subscription to be established
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(isSubscribed).toBe(true);

    // Unsubscribe all observers
    unsubscribe1.unsubscribe();
    unsubscribe2.unsubscribe();

    // Wait a bit to ensure cleanup happens
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(isUnsubscribed).toBe(true);
  });

  test('should propagate completion to all observers', async () => {
    const source = createTimedObservable([1, 2]);
    const multicasted = multicast(source);
    const results = await subscribeMultipleObservers(multicasted);

    expect(results.observer1.results).toEqual([1, 2]);
    expect(results.observer2.results).toEqual([1, 2]);
    expect(results.observer1.completed).toBe(true);
    expect(results.observer2.completed).toBe(true);
  });

  test('should handle empty source observable', async () => {
    const source = createEmptyObservable();
    const multicasted = multicast(source);
    const results = await subscribeMultipleObservers(multicasted);

    expect(results.observer1.results).toHaveLength(0);
    expect(results.observer2.results).toHaveLength(0);
    expect(results.observer1.completed).toBe(true);
    expect(results.observer2.completed).toBe(true);
  });

  test('should handle source that errors immediately', async () => {
    const multicasted = multicast(createImmediateErrorObservable(new Error('Immediate error')));
    const results = await subscribeMultipleObservers(multicasted);

    expect(results.observer1.errors).toHaveLength(1);
    expect(results.observer2.errors).toHaveLength(1);
    expect(results.observer1.errors[0].message).toBe('Immediate error');
    expect(results.observer2.errors[0].message).toBe('Immediate error');
  });
});
