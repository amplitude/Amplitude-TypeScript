export const amplitudePromise =
  <T extends (...args: any) => any>(fn: T) =>
  (...args: Parameters<T>) => ({
    promise: fn(...args) as ReturnType<T>,
  });
