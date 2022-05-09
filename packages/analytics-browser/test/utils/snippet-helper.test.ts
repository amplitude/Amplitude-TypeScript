import * as SnippetHelper from '../../src/utils/snippet-helper';

describe('snippet-helper', () => {
  const API_KEY = 'apiKey';

  describe('runQueuedFunctions', () => {
    test('should convert to real object', () => {
      const obj = {};
      const convertProxyObjectToRealObject = jest
        .spyOn(SnippetHelper, 'convertProxyObjectToRealObject')
        .mockReturnValueOnce(obj);
      SnippetHelper.runQueuedFunctions(obj, []);
      expect(convertProxyObjectToRealObject).toHaveBeenCalledTimes(1);
    });
  });

  describe('convertProxyObjectToRealObject', () => {
    test('should convert to real object', () => {
      const init = (apiKey: string) => {
        expect(apiKey).toBe(API_KEY);
        return { promise: Promise.resolve() };
      };
      const resolve = jest.fn();
      const proxyObj = {
        name: 'init',
        args: [API_KEY],
        resolve,
      };
      const queue = [proxyObj];
      const instance = { init };
      SnippetHelper.convertProxyObjectToRealObject(instance, queue);
      expect(resolve).toHaveBeenCalledTimes(1);
    });

    test('should handle no result', () => {
      const init = () => {
        return undefined;
      };
      const resolve = jest.fn();
      const proxyObj = {
        name: 'init',
        args: [],
        resolve,
      };
      const queue = [proxyObj];
      const instance = { init };
      expect(SnippetHelper.convertProxyObjectToRealObject(instance, queue)).toBe(instance);
      expect(resolve).toHaveBeenCalledTimes(1);
    });
  });
});
