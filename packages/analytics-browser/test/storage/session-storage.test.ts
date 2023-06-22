import { SessionStorage } from '../../src/storage/session-storage';
import * as AnalyticsClientCommon from '@amplitude/analytics-client-common';

describe('session-storage', () => {
  test('should return true if storage is available', async () => {
    const sessionStorage = new SessionStorage();
    expect(await sessionStorage.isEnabled()).toBe(true);
  });

  test('should return false if storage is unavailable', async () => {
    jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue(undefined);
    const sessionStorage = new SessionStorage();
    expect(await sessionStorage.isEnabled()).toBe(false);
  });
});
