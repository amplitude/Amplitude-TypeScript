import { LocalStorage } from '../../src/storage/local-storage';
import * as AnalyticsClientCommon from '@amplitude/analytics-client-common';

describe('local-storage', () => {
  test('should return true if storage is available', async () => {
    const localStorage = new LocalStorage();
    expect(await localStorage.isEnabled()).toBe(true);
  });

  test('should return false if storage is unavailable', async () => {
    jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue(undefined);
    const localStorage = new LocalStorage();
    expect(await localStorage.isEnabled()).toBe(false);
  });
});
