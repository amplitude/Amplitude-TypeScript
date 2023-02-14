import { AmplitudeReturn } from '@amplitude/analytics-types';

export const returnWrapper: {
  (): AmplitudeReturn<void>;
  <T>(awaitable: Promise<T>): AmplitudeReturn<T>;
} = <T>(awaitable?: Promise<T>) => ({
  promise: awaitable || Promise.resolve(),
});
