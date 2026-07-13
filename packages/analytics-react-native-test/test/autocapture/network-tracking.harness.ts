/**
 * On-device harness for autocapture network tracking.
 *
 * Runs on a real device/simulator (not Jest/Node).
 * Requires react-native-harness + examples/react-native/app built and installed.
 * Host mock API is started by scripts/mock-api-plugin.mjs (port 9876).
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach, afterEach } from 'react-native-harness';
import { createInstance, Types } from '@amplitude/analytics-react-native';
import { createEventCapture, EventCapture } from '../helpers/event-capture';
import { mockApiUrl } from '../helpers/mock-api';

const API_KEY = 'dummyApiKey';
const NETWORK_REQUEST_EVENT = '[Amplitude] Network Request';
let client: Types.ReactNativeClient;

describe('autocapture.networkTracking', () => {
  let capture: EventCapture;

  beforeEach(async () => {
    client = createInstance();
    capture = createEventCapture();
    client.add(capture.plugin);

    await client.init(API_KEY, 'harness-user', {
      flushQueueSize: 1,
      logLevel: Types.LogLevel.None,
      attribution: {
        disabled: true,
      },
      autocapture: {
        appLifecycles: false,
        sessions: false,
        networkTracking: true,
      },
    } as any).promise;
  });

  afterEach(() => {
    capture.clear();
  });

  it('tracks requests with a 500 status code', async () => {
    const res = await fetch(mockApiUrl('/api/status/500'));
    expect(res.status).toBe(500);

    await capture.waitForEvents(1);
    expect(capture.events[0]?.event_type).toBe(NETWORK_REQUEST_EVENT);
    expect(capture.events[0]?.event_properties?.['[Amplitude] Status Code']).toBe(500);
    expect(capture.events[0]?.event_properties?.['[Amplitude] Request Method']).toBe('GET');
  });

  it('does not track requests with a 200 status code', async () => {
    const res = await fetch(mockApiUrl('/api/status/200'));
    expect(res.status).toBe(200);

    // Default network tracking only captures 500–599 when no captureRules are set.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(capture.events.map((e) => e.event_type)).toEqual([]);
  });
});
