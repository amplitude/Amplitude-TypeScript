/**
 * On-device harness for autocapture app lifecycle events.
 *
 * Runs on a real device/simulator (not Jest/Node).
 * Requires react-native-harness + examples/react-native/app built and installed.
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach, afterEach } from 'react-native-harness';
import { DeviceEventEmitter } from 'react-native';
import { createInstance, Types } from '@amplitude/analytics-react-native';
import { createEventCapture, EventCapture } from '../helpers/event-capture';

const API_KEY = 'dummyApiKey';
let client: Types.ReactNativeClient;

/** RN AppState listens on RCTDeviceEventEmitter for `{ app_state }` payloads. */
function emitAppState(state: 'active' | 'background' | 'inactive') {
  DeviceEventEmitter.emit('appStateDidChange', { app_state: state });
}

describe('autocapture.appState', () => {
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
        appLifecycles: true,
        sessions: false,
      },
    } as any).promise;
  });

  afterEach(() => {
    capture.clear();
  });

  it('tracks Application Backgrounded and Opened for background → active', async () => {
    emitAppState('background');
    emitAppState('active');

    await capture.waitForEvents(2);
    expect(capture.events[0]?.event_type).toBe('[Amplitude] Application Backgrounded');
    expect(capture.events[1]?.event_type).toBe('[Amplitude] Application Opened');
  });

  it('does not track Application Opened for inactive → active (e.g. Control Center)', async () => {
    emitAppState('inactive');
    emitAppState('active');

    // Give the runtime a beat; no lifecycle events should arrive.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(capture.events.map((e) => e.event_type)).toEqual([]);
  });
});
