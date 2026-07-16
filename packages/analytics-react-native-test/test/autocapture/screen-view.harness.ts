/**
 * On-device harness for trackScreenView / trackNavigationStateChange.
 *
 * Runs on a real device/simulator (not Jest/Node).
 * Requires react-native-harness + examples/react-native/app built and installed.
 *
 * Do not await track*.promise here — that waits on the destination network flush
 * (and retries). Use the enrichment capture instead so tests stay deterministic.
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, beforeEach, afterEach } from 'react-native-harness';
import { createInstance, Types } from '@amplitude/analytics-react-native';
import { createEventCapture, EventCapture } from '../helpers/event-capture';

const API_KEY = 'dummyApiKey';
let client: Types.ReactNativeClient;

describe('autocapture.screenViews', () => {
  let capture: EventCapture;

  beforeEach(async () => {
    client = createInstance();
    capture = createEventCapture();
    client.add(capture.plugin);

    await client.init(API_KEY, 'harness-user', {
      flushQueueSize: 1,
      flushIntervalMillis: 1,
      logLevel: Types.LogLevel.None,
      attribution: {
        disabled: true,
      },
      autocapture: {
        appLifecycles: false,
        sessions: false,
        screenViews: true,
      },
    } as any).promise;
  });

  afterEach(() => {
    capture.clear();
  });

  it('captures Screen Viewed events', async () => {
    void client.trackScreenView('Screen 1');
    await capture.waitForEvents(1);
    expect(capture.events[0]?.event_type).toBe('[Amplitude] Screen Viewed');
    expect(capture.events[0]?.event_properties?.[`[Amplitude] Screen Name`]).toBe('Screen 1');
  });

  it('captures Screen Viewed events from NavigationState events', async () => {
    void client.trackNavigationStateChange({
      routes: [{ name: 'Screen abc' }],
      index: 0,
    });
    await capture.waitForEvents(1);
    expect(capture.events[0]?.event_type).toBe('[Amplitude] Screen Viewed');
    expect(capture.events[0]?.event_properties?.[`[Amplitude] Screen Name`]).toBe('Screen abc');
  });

  it('captures the focused leaf screen from nested NavigationState', async () => {
    void client.trackNavigationStateChange({
      index: 0,
      routes: [
        {
          name: 'Main',
          state: {
            index: 1,
            routes: [{ name: 'Home' }, { name: 'Settings' }],
          },
        },
      ],
    });
    await capture.waitForEvents(1);
    expect(capture.events[0]?.event_type).toBe('[Amplitude] Screen Viewed');
    expect(capture.events[0]?.event_properties?.[`[Amplitude] Screen Name`]).toBe('Settings');
  });

  it('does not duplicate Screen Viewed for the same focused route', async () => {
    const homeState = {
      routes: [{ name: 'Home' }],
      index: 0,
    };
    void client.trackNavigationStateChange(homeState);
    void client.trackNavigationStateChange(homeState);
    await capture.waitForEvents(1);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(capture.events).toHaveLength(1);
    expect(capture.events[0]?.event_properties?.[`[Amplitude] Screen Name`]).toBe('Home');
  });
});
