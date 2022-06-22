import { AmplitudeReturn } from '@amplitude/analytics-types';

export const returnWrapper = <T extends (...args: any) => any>(fn: T) => {
  return (...args: Parameters<T>): AmplitudeReturn<ReturnType<T>> => ({
    promise: fn(...args) as ReturnType<T>,
  });
};
