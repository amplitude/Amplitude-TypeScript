import { Observable, asyncMap, merge } from '../../src/index';

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
    await jest.runAllTimers();
    expect(results).toEqual([1, 2]);
  });

  test('should error if one of the observables errors', async () => {
    const source1 = new Observable<number>((observer) => {
      observer.next(1);
      observer.complete();
    });
    const source2 = new Observable<number>((observer) => {
      observer.error(new Error('Error'));
    });
    const mergedObservable = merge(source1, source2);
    const results: number[] = [];
    mergedObservable.subscribe((value) => {
      results.push(value);
    });
    await jest.runAllTimers();
    expect(results).toEqual([1]);
  });
});
