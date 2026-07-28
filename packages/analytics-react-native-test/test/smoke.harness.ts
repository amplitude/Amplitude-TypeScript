/**
 * Basic React Native Harness smoke test for @amplitude/analytics-react-native.
 *
 * Runs on a real device/simulator (not Jest/Node), so NativeModules are real.
 * Requires react-native-harness + examples/react-native/app built and installed.
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect } from 'react-native-harness';
import { Platform } from 'react-native';
import { createInstance, Types } from '@amplitude/analytics-react-native';

const API_KEY = '17fcb31e58fc138462fd64bfe7add49e'; // TODO: Remove hardcoded key

describe('@amplitude/analytics-react-native harness smoke', () => {
  it('runs on ios or android', () => {
    expect(Platform.OS).toMatch(/^(ios|android)$/);
  });

  it('initializes and tracks an event', async () => {
    const client = createInstance();
    await client.init(API_KEY, 'harness-user', {
      flushQueueSize: 1,
      logLevel: Types.LogLevel.None,
      attribution: {
        disabled: true,
      },
    }).promise;

    expect(client.getUserId()).toBe('harness-user');
    expect(typeof client.getDeviceId()).toBe('string');
    expect(client.getDeviceId()?.length).toBeGreaterThan(0);
    expect(typeof client.getSessionId()).toBe('number');

    const result = await client.track('TEST EVENT 4:43pm', {
      source: 'react-native-harness',
    }).promise;

    expect(result.code).toBe(200);
  });
});
