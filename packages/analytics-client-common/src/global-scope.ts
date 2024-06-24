/* eslint-disable no-restricted-globals */
/* Only file allowed to access to globalThis, window, self */

export const getGlobalScope = (): typeof globalThis | undefined => {
  // This should only be used for integrations with Amplitude that are not running in a browser environment
  //   We need to specify the name of the global variable as a string to prevent it from being minified
  const ampIntegrationContextName = 'ampIntegrationContext' as keyof typeof globalThis;
  if (typeof globalThis !== 'undefined' && typeof globalThis[ampIntegrationContextName] !== 'undefined') {
    return globalThis[ampIntegrationContextName] as typeof globalThis;
  }
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
