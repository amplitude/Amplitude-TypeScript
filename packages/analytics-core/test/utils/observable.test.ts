import { Observable, asyncMap, multicast } from '../../src/index';

describe('asyncMap', () => {
  test('should map values using async function and emit results in order', async () => {
    const sourceValues = [1, 2, 3];
    const source = new Observable<number>((observer) => {
      sourceValues.forEach((value, index) => {
        setTimeout(() => observer.next(value), index * 10);
      });
      setTimeout(() => observer.complete(), 50);
    });

    const asyncFn = jest.fn((value: number) => Promise.resolve(value * 2));

    const mappedObservable = asyncMap(source, asyncFn);

    const results: number[] = [];
    const errors: any[] = [];
    let completed = false;

    const promise = new Promise<void>((resolve) => {
      mappedObservable.subscribe({
        next: (value: number) => {
          results.push(value);
        },
        error: (error: any) => {
          errors.push(error);
        },
        complete: () => {
          completed = true;
          expect(results).toEqual([2, 4, 6]);
          expect(errors).toHaveLength(0);
          expect(completed).toBe(true);
          resolve();
        },
      });
    });

    return promise;
  });

  test('should handle async function errors', async () => {
    const sourceValues = [1, 2, 3];
    const source = new Observable<number>((observer) => {
      sourceValues.forEach((value, index) => {
        setTimeout(() => observer.next(value), index * 10);
      });
      setTimeout(() => observer.complete(), 50);
    });

    const asyncFn = jest.fn((value: number) => {
      if (value === 2) {
        return Promise.reject(new Error('Test error'));
      }
      return Promise.resolve(value * 2);
    });

    const mappedObservable = asyncMap(source, asyncFn);

    const results: number[] = [];
    const errors: any[] = [];

    return new Promise<void>((resolve) => {
      mappedObservable.subscribe({
        next: (value: number) => {
          results.push(value);
        },
        error: (error: any) => {
          errors.push(error);
          expect(error.message).toBe('Test error');
          expect(results).toEqual([2]); // Only first value should be emitted
          expect(asyncFn).toHaveBeenCalledTimes(2); // Called for 1 and 2
          resolve();
        },
        complete: () => {
          // Should not complete due to error
        },
      });
    });
  });

  test('should handle source observable errors', async () => {
    const source = new Observable<number>((observer) => {
      setTimeout(() => observer.next(1), 10);
      setTimeout(() => observer.error(new Error('Source error')), 20);
    });

    const asyncFn = jest.fn((value: number) => Promise.resolve(value * 2));

    const mappedObservable = asyncMap(source, asyncFn);

    const results: number[] = [];
    const errors: any[] = [];

    return new Promise<void>((resolve) => {
      mappedObservable.subscribe({
        next: (value: number) => {
          results.push(value);
        },
        error: (error: any) => {
          errors.push(error);
          expect(error.message).toBe('Source error');
          expect(results).toEqual([2]); // First value should be processed
          expect(asyncFn).toHaveBeenCalledTimes(1);
          resolve();
        },
        complete: () => {
          // Should not complete due to error
        },
      });
    });
  });

  test('should handle empty source observable', async () => {
    const source = new Observable<any>((observer) => {
      setTimeout(() => observer.complete(), 10);
    });

    const asyncFn = jest.fn((value: any) => Promise.resolve(value));

    const mappedObservable = asyncMap(source, asyncFn);

    const results: any[] = [];
    const errors: any[] = [];
    let completed = false;

    return new Promise<void>((resolve) => {
      mappedObservable.subscribe({
        next: (value: any) => {
          results.push(value);
        },
        error: (error: any) => {
          errors.push(error);
        },
        complete: () => {
          completed = true;
          expect(results).toHaveLength(0);
          expect(errors).toHaveLength(0);
          expect(completed).toBe(true);
          expect(asyncFn).not.toHaveBeenCalled();
          resolve();
        },
      });
    });
  });
});

describe('multicast', () => {
  test('should multicast values to multiple observers', async () => {
    const sourceValues = [1, 2, 3];
    const source = new Observable<number>((observer) => {
      sourceValues.forEach((value, index) => {
        setTimeout(() => observer.next(value), index * 10);
      });
      setTimeout(() => observer.complete(), 50);
    });

    const multicasted = multicast(source);

    const observer1Results: number[] = [];
    const observer2Results: number[] = [];
    let observer1Completed = false;
    let observer2Completed = false;

    const promise = new Promise<void>((resolve) => {
      let completedCount = 0;
      const checkComplete = () => {
        completedCount++;
        if (completedCount === 2) {
          expect(observer1Results).toEqual([1, 2, 3]);
          expect(observer2Results).toEqual([1, 2, 3]);
          expect(observer1Completed).toBe(true);
          expect(observer2Completed).toBe(true);
          resolve();
        }
      };

      multicasted.subscribe({
        next: (value: number) => observer1Results.push(value),
        complete: () => {
          observer1Completed = true;
          checkComplete();
        },
      });

      multicasted.subscribe({
        next: (value: number) => observer2Results.push(value),
        complete: () => {
          observer2Completed = true;
          checkComplete();
        },
      });
    });

    return promise;
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

    const observer1Results: number[] = [];
    const observer2Results: number[] = [];
    const observer3Results: number[] = [];

    const promise = new Promise<void>((resolve) => {
      let completedCount = 0;
      const checkComplete = () => {
        completedCount++;
        if (completedCount === 3) {
          expect(subscriptionCount).toBe(1); // Should only subscribe once
          expect(observer1Results).toEqual([1, 2]);
          expect(observer2Results).toEqual([1, 2]);
          expect(observer3Results).toEqual([1, 2]);
          resolve();
        }
      };

      multicasted.subscribe({
        next: (value: number) => observer1Results.push(value),
        complete: checkComplete,
      });

      multicasted.subscribe({
        next: (value: number) => observer2Results.push(value),
        complete: checkComplete,
      });

      multicasted.subscribe({
        next: (value: number) => observer3Results.push(value),
        complete: checkComplete,
      });
    });

    return promise;
  });

  test('should unsubscribe from source when all observers unsubscribe', async () => {
    let isSubscribed = false;
    let isUnsubscribed = false;
    const source = new Observable<number>((observer) => {
      isSubscribed = true;
      setTimeout(() => observer.next(1), 10);
      setTimeout(() => observer.complete(), 20);

      return () => {
        isUnsubscribed = true;
      };
    });

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

  test('should propagate errors to all observers', async () => {
    const source = new Observable<number>((observer) => {
      setTimeout(() => observer.next(1), 10);
      setTimeout(() => observer.error(new Error('Test error')), 20);
    });

    const multicasted = multicast(source);

    const observer1Results: number[] = [];
    const observer2Results: number[] = [];
    const observer1Errors: any[] = [];
    const observer2Errors: any[] = [];

    const promise = new Promise<void>((resolve) => {
      let errorCount = 0;
      const checkError = () => {
        errorCount++;
        if (errorCount === 2) {
          expect(observer1Results).toEqual([1]);
          expect(observer2Results).toEqual([1]);
          expect(observer1Errors).toHaveLength(1);
          expect(observer2Errors).toHaveLength(1);
          expect(observer1Errors[0].message).toBe('Test error');
          expect(observer2Errors[0].message).toBe('Test error');
          resolve();
        }
      };

      multicasted.subscribe({
        next: (value: number) => observer1Results.push(value),
        error: (error: any) => {
          observer1Errors.push(error);
          checkError();
        },
      });

      multicasted.subscribe({
        next: (value: number) => observer2Results.push(value),
        error: (error: any) => {
          observer2Errors.push(error);
          checkError();
        },
      });
    });

    return promise;
  });

  test('should propagate completion to all observers', async () => {
    const source = new Observable<number>((observer) => {
      setTimeout(() => observer.next(1), 10);
      setTimeout(() => observer.next(2), 20);
      setTimeout(() => observer.complete(), 30);
    });

    const multicasted = multicast(source);

    const observer1Results: number[] = [];
    const observer2Results: number[] = [];
    let observer1Completed = false;
    let observer2Completed = false;

    const promise = new Promise<void>((resolve) => {
      let completedCount = 0;
      const checkComplete = () => {
        completedCount++;
        if (completedCount === 2) {
          expect(observer1Results).toEqual([1, 2]);
          expect(observer2Results).toEqual([1, 2]);
          expect(observer1Completed).toBe(true);
          expect(observer2Completed).toBe(true);
          resolve();
        }
      };

      multicasted.subscribe({
        next: (value: number) => observer1Results.push(value),
        complete: () => {
          observer1Completed = true;
          checkComplete();
        },
      });

      multicasted.subscribe({
        next: (value: number) => observer2Results.push(value),
        complete: () => {
          observer2Completed = true;
          checkComplete();
        },
      });
    });

    return promise;
  });

  test('should handle observers that unsubscribe before completion', async () => {
    const source = new Observable<number>((observer) => {
      setTimeout(() => observer.next(1), 10);
      setTimeout(() => observer.next(2), 20);
      setTimeout(() => observer.complete(), 30);
    });

    const multicasted = multicast(source);

    const observer1Results: number[] = [];
    const observer2Results: number[] = [];
    let observer1Completed = false;
    let observer2Completed = false;

    const promise = new Promise<void>((resolve) => {
      let completedCount = 0;
      const checkComplete = () => {
        completedCount++;
        if (completedCount === 1) {
          expect(observer1Results).toEqual([1, 2]);
          expect(observer2Results).toEqual([1]); // Only first value before unsubscribe
          expect(observer1Completed).toBe(true);
          expect(observer2Completed).toBe(false); // Should not complete
          resolve();
        }
      };

      const unsubscribe2 = multicasted.subscribe({
        next: (value: number) => observer2Results.push(value),
        complete: () => {
          observer2Completed = true;
          checkComplete();
        },
      });

      multicasted.subscribe({
        next: (value: number) => observer1Results.push(value),
        complete: () => {
          observer1Completed = true;
          checkComplete();
        },
      });

      // Unsubscribe second observer after first value
      setTimeout(() => unsubscribe2.unsubscribe(), 15);
    });

    return promise;
  });

  test('should handle empty source observable', async () => {
    const source = new Observable<number>((observer) => {
      setTimeout(() => observer.complete(), 10);
    });

    const multicasted = multicast(source);

    const observer1Results: number[] = [];
    const observer2Results: number[] = [];
    let observer1Completed = false;
    let observer2Completed = false;

    const promise = new Promise<void>((resolve) => {
      let completedCount = 0;
      const checkComplete = () => {
        completedCount++;
        if (completedCount === 2) {
          expect(observer1Results).toHaveLength(0);
          expect(observer2Results).toHaveLength(0);
          expect(observer1Completed).toBe(true);
          expect(observer2Completed).toBe(true);
          resolve();
        }
      };

      multicasted.subscribe({
        next: (value: number) => observer1Results.push(value),
        complete: () => {
          observer1Completed = true;
          checkComplete();
        },
      });

      multicasted.subscribe({
        next: (value: number) => observer2Results.push(value),
        complete: () => {
          observer2Completed = true;
          checkComplete();
        },
      });
    });

    return promise;
  });

  test('should handle source that errors immediately', async () => {
    const source = new Observable<number>((observer) => {
      setTimeout(() => observer.error(new Error('Immediate error')), 10);
    });

    const multicasted = multicast(source);

    const observer1Errors: any[] = [];
    const observer2Errors: any[] = [];

    const promise = new Promise<void>((resolve) => {
      let errorCount = 0;
      const checkError = () => {
        errorCount++;
        if (errorCount === 2) {
          expect(observer1Errors).toHaveLength(1);
          expect(observer2Errors).toHaveLength(1);
          expect(observer1Errors[0].message).toBe('Immediate error');
          expect(observer2Errors[0].message).toBe('Immediate error');
          resolve();
        }
      };

      multicasted.subscribe({
        next: () => {},
        error: (error: any) => {
          observer1Errors.push(error);
          checkError();
        },
      });

      multicasted.subscribe({
        next: () => {},
        error: (error: any) => {
          observer2Errors.push(error);
          checkError();
        },
      });
    });

    return promise;
  });
});
