import type { BrowserClient, BrowserConfig } from '@amplitude/analytics-types';
import * as pageUrlEnrichment from '../src/page-url-enrichment';
import { UUID } from '@amplitude/analytics-core';

// Mock BrowserClient implementation
const createMockBrowserClient = (): jest.Mocked<BrowserClient> => {
  const mockClient = {
    init: jest.fn().mockReturnValue({
      promise: Promise.resolve(),
    }),
    add: jest.fn(),
    remove: jest.fn(),
    track: jest.fn(),
    logEvent: jest.fn(),
    identify: jest.fn(),
    groupIdentify: jest.fn(),
    setGroup: jest.fn(),
    revenue: jest.fn(),
    flush: jest.fn(),
    getUserId: jest.fn(),
    setUserId: jest.fn(),
    getDeviceId: jest.fn(),
    setDeviceId: jest.fn(),
    getSessionId: jest.fn(),
    setSessionId: jest.fn(),
    extendSession: jest.fn(),
    reset: jest.fn(),
    setOptOut: jest.fn(),
    setTransport: jest.fn(),
  } as unknown as jest.Mocked<BrowserClient>;

  return mockClient;
};

describe('pageUrlPreviousPagePlugin', () => {
  const apiKey = UUID();
  const userId = 'user@amplitude.com';
  let client: jest.Mocked<BrowserClient>;

  beforeEach(() => {
    client = createMockBrowserClient();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should add page url previous page plugin if pageUrlPreviousPage is true', async () => {
    const pageUrlPreviousPagePlugin = jest.spyOn(pageUrlEnrichment, 'pageUrlPreviousPagePlugin');
    await client.init(apiKey, userId, {
      autocapture: {
        pageUrlPreviousPage: true,
      },
    } as unknown as BrowserConfig).promise;
    expect(pageUrlPreviousPagePlugin).toHaveBeenCalledTimes(1);
  });

  test('should NOT add page url previous page plugin if pageUrlPreviousPage is false', async () => {
    const pageUrlPreviousPagePlugin = jest.spyOn(pageUrlEnrichment, 'pageUrlPreviousPagePlugin');
    await client.init(apiKey, userId, {
      autocapture: {
        pageUrlPreviousPage: false,
      },
    } as unknown as BrowserConfig).promise;
    expect(pageUrlPreviousPagePlugin).toHaveBeenCalledTimes(0);
  });

  test('should NOT add page url previous page plugin if pageUrlPreviousPage is undefined', async () => {
    const pageUrlPreviousPagePlugin = jest.spyOn(pageUrlEnrichment, 'pageUrlPreviousPagePlugin');
    await client.init(apiKey, userId, {
      autocapture: {},
    } as unknown as BrowserConfig).promise;
    expect(pageUrlPreviousPagePlugin).toHaveBeenCalledTimes(0);
  });
});

describe('isPageUrlPreviousPageEnabled', () => {
  test('should return true with true parameter', () => {
    expect(pageUrlEnrichment.isPageUrlPreviousPageEnabled(true)).toBe(true);
  });

  test('should return false with undefined parameter', () => {
    expect(pageUrlEnrichment.isPageUrlPreviousPageEnabled(undefined)).toBe(false);
  });

  test('should return false with false parameter', () => {
    expect(pageUrlEnrichment.isPageUrlPreviousPageEnabled(false)).toBe(false);
  });

  test('should return true with object parameter set to true', () => {
    expect(
      pageUrlEnrichment.isPageUrlPreviousPageEnabled({
        pageUrlPreviousPage: true,
      }),
    ).toBe(true);
  });

  test('should return false with object parameter set to false', () => {
    expect(
      pageUrlEnrichment.isPageUrlPreviousPageEnabled({
        pageUrlPreviousPage: false,
      }),
    ).toBe(false);
  });

  test('should return false with object parameter undefined', () => {
    expect(
      pageUrlEnrichment.isPageUrlPreviousPageEnabled({
        pageUrlPreviousPage: undefined,
      }),
    ).toBe(false);
  });
});
