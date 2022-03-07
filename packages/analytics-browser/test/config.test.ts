import { getConfig } from '../src/config';
import * as core from '@amplitude/analytics-core';

describe('config', () => {
  describe('getConfig', () => {
    test('should call core get config', () => {
      const _getConfig = jest.spyOn(core, 'getConfig');
      const config = getConfig();
      expect(config).toBe(undefined);
      expect(_getConfig).toHaveBeenCalledTimes(1);
    });
  });
});
