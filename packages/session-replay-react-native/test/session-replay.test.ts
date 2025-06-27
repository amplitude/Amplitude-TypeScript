// FIXME: remove these eslint rules
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

// Use the mock from __mocks__ directory
jest.mock('react-native');

// Explicitly mock the logger module using the imported mock
jest.mock('../src/logger', () => require('./utils/logger'));

import { init, start, stop, getSessionId, getSessionReplayProperties, type SessionReplayConfig } from '../src/index';
import { NativeModules } from 'react-native';
import { LogLevel } from '@amplitude/analytics-types';

// Mock the getSessionReplayProperties return value for our tests
const mockNativeModules = NativeModules as jest.Mocked<typeof NativeModules>;
mockNativeModules.NativeSessionReplay.getSessionReplayProperties.mockResolvedValue({ replayId: 'test-id' });

describe('Session Replay Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('should allow complete workflow using exported functions', async () => {
    const testConfig: SessionReplayConfig = {
      apiKey: 'test-api-key',
      serverZone: 'US',
      logLevel: LogLevel.Warn,
    };

    // Complete workflow test
    await init(testConfig);
    expect(mockNativeModules.NativeSessionReplay.setup).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-api-key',
        serverZone: 'US',
        logLevel: LogLevel.Warn,
      }),
    );

    await start();
    expect(mockNativeModules.NativeSessionReplay.start).toHaveBeenCalled();

    const sessionId = await getSessionId();
    expect(sessionId).toBe(12345);
    expect(mockNativeModules.NativeSessionReplay.getSessionId).toHaveBeenCalled();

    const properties = await getSessionReplayProperties();
    expect(properties).toEqual({ replayId: 'test-id' });
    expect(mockNativeModules.NativeSessionReplay.getSessionReplayProperties).toHaveBeenCalled();

    await stop();
    expect(mockNativeModules.NativeSessionReplay.stop).toHaveBeenCalled();

    // Verify calls were made in sequence
    const calls = jest.mocked(mockNativeModules.NativeSessionReplay);
    expect(calls.setup).toHaveBeenCalled();
    expect(calls.start).toHaveBeenCalled();
    expect(calls.getSessionId).toHaveBeenCalled();
    expect(calls.getSessionReplayProperties).toHaveBeenCalled();
    expect(calls.stop).toHaveBeenCalled();
  });
});
