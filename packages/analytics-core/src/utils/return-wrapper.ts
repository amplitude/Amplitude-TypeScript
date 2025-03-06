export interface AmplitudeReturn<T> {
  promise: Promise<T>;
}

export const returnWrapper: {
  (): AmplitudeReturn<void>;
  <T>(awaitable: Promise<T>): AmplitudeReturn<T>;
} = <T>(awaitable?: Promise<T>) => ({
  promise: awaitable || Promise.resolve(),
});
