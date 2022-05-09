import { AmplitudeReturn } from '@amplitude/analytics-types';

export const returnWrapper =
  <T extends (...args: any) => any>(fn: T) =>
  (...args: Parameters<T>): AmplitudeReturn<Awaited<ReturnType<T>>> => ({
    promise: fn(...args) as ReturnType<T>,
  });
