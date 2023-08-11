import { Logger } from '@amplitude/analytics-core';
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

  test('should drop events when set more than 1000 events and use console log', async () => {
    const localStorage = new LocalStorage();
    const errorMock = jest.spyOn(console, 'error');

    await localStorage.set('storage-key', new Array(1001).fill(1));
    expect(errorMock).toHaveBeenCalledTimes(1);
    expect(errorMock).toHaveBeenCalledWith('Dropped 1 events because the queue length exceeded 1000.');
  });

  test('should drop events when set more than 1000 events and use custom logger', async () => {
    const logger = new Logger();
    const localStorage = new LocalStorage(logger);
    const errorMock = jest.spyOn(logger, 'error');

    await localStorage.set('storage-key', new Array(1001).fill(1));
    expect(errorMock).toHaveBeenCalledTimes(1);
    expect(errorMock).toHaveBeenCalledWith('Dropped 1 events because the queue length exceeded 1000.');
  });
});
