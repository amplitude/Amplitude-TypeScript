import { AmplitudeReturn, InstanceProxy, QueueProxy, Result } from '@amplitude/analytics-types';

/**
 * Applies the proxied functions on the proxied amplitude snippet to an instance of the real object.
 * @ignore
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
    const { name, args, resolve } = queue[i];
    const fn = instance && instance[name as keyof T];
    if (typeof fn === 'function') {
      const result = fn.apply(instance, args) as AmplitudeReturn<Result>;
      if (typeof resolve === 'function') {
        resolve(result?.promise);
      }
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
