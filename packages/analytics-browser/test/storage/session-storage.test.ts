import { SessionStorage } from '../../src/storage/session-storage';
import * as AnalyticsCore from '@amplitude/analytics-core';

describe('session-storage', () => {
  test('should return true if storage is available', async () => {
    const sessionStorage = new SessionStorage();
    expect(await sessionStorage.isEnabled()).toBe(true);
  });

  test('should return false if storage is unavailable', async () => {
    jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(undefined);
    const sessionStorage = new SessionStorage();
    expect(await sessionStorage.isEnabled()).toBe(false);
  });
});
