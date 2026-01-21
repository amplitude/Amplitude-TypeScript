/* eslint-disable no-restricted-globals, @typescript-eslint/no-empty-function, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */

export const mockWindowLocationFromURL = (url: URL) => {
  window.location.href = url.toString();
  window.location.search = url.search;
  window.location.hostname = url.hostname;
  window.location.pathname = url.pathname;
};

export const dispatchUnhandledRejection = (window: Window, reason: unknown = new Error('Synthetic rejection')) => {
  const promise = Promise.reject(reason);
  promise.catch(() => {}); // prevent Node from treating it as truly unhandled

  const evt = new (window as any).Event('unhandledrejection', { cancelable: true });

  // Match browser PromiseRejectionEvent shape:
  evt.reason = reason;
  evt.promise = promise;

  window.dispatchEvent(evt);
  return { event: evt, promise };
};
