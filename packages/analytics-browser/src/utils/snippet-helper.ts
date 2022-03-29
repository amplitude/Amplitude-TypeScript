import { AmplitudeProxy, SnippetProxy } from '../typings/browser-snippet';

/**
 * Applies the proxied functions on the proxied amplitude snippet to an instance of the real object.
 */
export const runQueuedFunctions = (instance: object, amplitudeProxy: AmplitudeProxy) => {
  convertProxyObjectToRealObject(instance, amplitudeProxy);
};

/**
 * Applies the proxied functions on the proxied object to an instance of the real object.
 * Used to convert proxied Identify and Revenue objects.
 */
export const convertProxyObjectToRealObject = <T>(instance: T, proxy: SnippetProxy): T => {
  const queue = proxy._q;
  proxy._q = [];

  for (let i = 0; i < queue.length; i++) {
    const [functionName, ...args] = queue[i];
    const fn = instance[functionName as keyof typeof instance];
    if (typeof fn === 'function') {
      fn.apply(instance, args);
    }
  }
  return instance;
};

/**
 * Check if the param is snippet proxy
 */
export const isSnippetProxy = (snippetProxy: object): snippetProxy is SnippetProxy => {
  return (snippetProxy as SnippetProxy)._q !== undefined;
};
