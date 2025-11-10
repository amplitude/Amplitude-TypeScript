import { BrowserClient } from '@amplitude/analytics-core';

// Mock BrowserClient implementation
export const createMockBrowserClient = (): jest.Mocked<BrowserClient> => {
  const mockClient = {
    init: jest.fn(),
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
    _setDiagnosticsSampleRate: jest.fn(),
    getOptOut: jest.fn(),
    getIdentity: jest.fn(),
  } as jest.Mocked<BrowserClient>;

  // Set up default return values for methods that return promises
  mockClient.init.mockReturnValue({
    promise: Promise.resolve(),
  });

  mockClient.track.mockReturnValue({
    promise: Promise.resolve({
      code: 200,
      message: '',
      event: {
        event_type: '[Amplitude] Page Viewed',
      },
    }),
  });

  return mockClient;
};
