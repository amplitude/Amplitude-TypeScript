import type { QueueProxy } from '../../src/typings/browser-snippet';
import { convertProxyObjectToRealObject, isInstanceProxy } from '../../src/utils/snippet-helper';

describe('snippet-helper', () => {
  describe('convertProxyObjectToRealObject', () => {
    test('should convert proxy object to real object', () => {
      const proxyObj = { name: 'init', args: [], resolve: () => undefined };
      const proxyResolve = jest.spyOn(proxyObj, 'resolve');
      const queue: QueueProxy = [proxyObj];
      convertProxyObjectToRealObject({ init: () => null }, queue);
      expect(proxyResolve).toHaveBeenCalledWith(undefined);
      expect(proxyResolve).toHaveBeenCalledTimes(1);
    });
  });

  describe('isInstanceProxy', () => {
    test('should return true if instance has _q', () => {
      expect(isInstanceProxy({ _q: [] })).toBe(true);
    });

    test('should return false if instance does not have _q', () => {
      expect(isInstanceProxy({})).toBe(false);
    });
  });
});
