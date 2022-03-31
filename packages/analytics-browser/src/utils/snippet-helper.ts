import { QueueProxy, InstanceProxy } from '../typings/browser-snippet';

/**
 * Applies the proxied functions on the proxied amplitude snippet to an instance of the real object.
 */
export const runQueuedFunctions = (instance: object, queue: QueueProxy) => {
  convertProxyObjectToRealObject(instance, queue);
};

/**
 * Applies the proxied functions on the proxied object to an instance of the real object.
 * Used to convert proxied Identify and Revenue objects.
 */
export const convertProxyObjectToRealObject = <T>(instance: T, queue: QueueProxy): T => {
  for (let i = 0; i < queue.length; i++) {
    const [functionName, ...args] = queue[i];
    const fn = instance && instance[functionName as keyof T];
    if (typeof fn === 'function') {
      fn.apply(instance, args);
    }
  }
  return instance;
};

/**
 * Check if the param is snippet proxy
 */
export const isInstanceProxy = (instance: unknown): instance is InstanceProxy => {
  const instanceProxy = instance as InstanceProxy;
  return instanceProxy && instanceProxy._q !== undefined;
};
