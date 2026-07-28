/**
 * On-device harness for autocapture session_start / session_end.
 *
 * Runs on a real device/simulator (not Jest/Node).
 * Requires react-native-harness + examples/react-native/app built and installed.
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, beforeEach, afterEach } from 'react-native-harness';
import { createInstance, Types } from '@amplitude/analytics-react-native';
import { createEventCapture, EventCapture } from '../helpers/event-capture';

const API_KEY = 'dummyApiKey';
let client: Types.ReactNativeClient;

describe('autocapture.sessions', () => {
  let capture: EventCapture;

  beforeEach(async () => {
    client = createInstance();
    capture = createEventCapture();

    // Queue plugin before init so it is registered in core _init and sees session_start.
    client.add(capture.plugin);

    await client.init(API_KEY, 'harness-user', {
      flushQueueSize: 1,
      logLevel: Types.LogLevel.None,
      attribution: {
        disabled: true,
      },
      autocapture: {
        appLifecycles: false,
        sessions: true,
      },
    } as any).promise;

    await capture.waitForEvents(1);
  });

  afterEach(() => {
    capture.clear();
  });

  it('captures session_start and session rotation', async () => {
    const { events, waitForEvents } = capture;
    expect(events[0]?.event_type).toBe('session_start');

    // force a session change.
    const previousSessionId = client.getSessionId();
    expect(typeof previousSessionId).toBe('number');
    client.setSessionId(previousSessionId! + 1);

    await waitForEvents(3);
    expect(events[1]?.event_type).toBe('session_end');
    expect(events[2]?.event_type).toBe('session_start');

    await client.track('test_event').promise;
    await waitForEvents(4);
    expect(events[3]?.event_type).toBe('test_event');
  });
});
