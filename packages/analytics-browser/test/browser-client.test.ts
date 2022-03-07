import { init } from '../src/browser-client';
import * as core from '@amplitude/analytics-core';

describe('browser-client', () => {
  const API_KEY = 'apiKey';
  const USER_ID = 'userId';

  describe('init', () => {
    test('should call core init', () => {
      const _init = jest.spyOn(core, 'init').mockImplementation(() => undefined);
      init(API_KEY, USER_ID);
      expect(_init).toHaveBeenCalledTimes(1);
    });
  });
});
