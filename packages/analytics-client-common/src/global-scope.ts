/* eslint-disable no-restricted-globals */
/* Only file allowed to access to globalThis, window, self */

export const getGlobalScope = (): typeof globalThis | undefined => {
  if (typeof globalThis !== 'undefined') {
    return globalThis;
  }
  if (typeof window !== 'undefined') {
    return window;
  }
  if (typeof self !== 'undefined') {
    return self;
  }
  if (typeof global !== 'undefined') {
    return global;
  }
  return undefined;
};
