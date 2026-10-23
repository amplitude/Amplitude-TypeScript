/**
 * Real native presses + Session Replay UI observation (no mocked signals/timers).
 * Requires NEW_ARCH=1 for @react-native-harness/ui and a rebuilt host binary
 * with @amplitude/plugin-session-replay-react-native linked.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TurboModuleRegistry, View } from 'react-native';
import type { TurboModule } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, render, waitFor } from 'react-native-harness';
import { screen, userEvent } from '@react-native-harness/ui';
import { MemoryStorage, Status } from '@amplitude/analytics-core';
import { ampCapture, Types } from '@amplitude/analytics-react-native';
import { AmplitudeReactNative } from '@amplitude/analytics-react-native/src/react-native-client';
import { SessionReplayPlugin } from '@amplitude/plugin-session-replay-react-native';
import { createEventCapture, EventCapture } from '../helpers/event-capture';

const THRESHOLD = 3_000;
const LATE_CHANGE = THRESHOLD + 1_500;
const DEAD_CLICK = '[Amplitude] Dead Click';
const BUTTON_ID = 'dead-click-harness-button';
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface ReplaySignals extends TurboModule {
  getInterfaceSignalState(): Promise<{
    isProviding: boolean;
    lastChangeTime: number;
    sessionId: string;
    deviceId: string | null;
  }>;
}

function DeadClickScreen({ changeDelay, onPress }: { changeDelay?: number; onPress: () => void }) {
  const [changed, setChanged] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'white' }}>
      {/* Static styling avoids a press ripple/opacity change satisfying the UI-activity detector. */}
      <Pressable
        testID={BUTTON_ID}
        style={{ padding: 24, backgroundColor: '#ddd' }}
        onPress={ampCapture(
          () => {
            onPress();
            if (changeDelay === 0) setChanged(true);
            else if (changeDelay !== undefined) timer.current = setTimeout(() => setChanged(true), changeDelay);
          },
          { action: 'Press', testID: BUTTON_ID, element: 'Pressable' },
        )}
      >
        <Text>Press me</Text>
      </Pressable>
      <View style={{ width: 160, height: 100, backgroundColor: changed ? 'blue' : 'red' }}>
        <Text testID="dead-click-response">{changed ? 'Changed' : 'Unchanged'}</Text>
      </View>
    </View>
  );
}

describe('autocapture.deadClicks with native Session Replay', () => {
  let client: AmplitudeReactNative | undefined;
  let replay: SessionReplayPlugin | undefined;
  let capture: EventCapture;
  let signals: ReplaySignals;
  let unmount: (() => void) | undefined;
  let pressedAt: number;

  const deadClicks = () => capture.events.filter((event) => event.event_type === DEAD_CLICK);

  beforeEach(async () => {
    client = undefined;
    replay = undefined;
    unmount = undefined;
    capture = createEventCapture();
    const nativeReplay = TurboModuleRegistry.get<ReplaySignals>('PluginSessionReplayReactNative');
    if (typeof nativeReplay?.getInterfaceSignalState !== 'function') {
      throw new Error(
        'Dead-click harness requires a rebuilt host with Session Replay UI signals. ' +
          'Run FORCE_REBUILD=1 pnpm test:harness:ios:new-arch dead-click ' +
          '(or test:harness:android:new-arch on Android).',
      );
    }
    signals = nativeReplay;
    client = new AmplitudeReactNative();
    client.add(capture.plugin);
    await client.init('deadClickHarnessApiKey', 'harness-user', {
      deviceId: 'dead-click-harness-device',
      cookieStorage: new MemoryStorage(),
      storageProvider: new MemoryStorage(),
      transportProvider: {
        send: async () => ({
          status: Status.Success,
          statusCode: 200,
          body: { eventsIngested: 1, payloadSizeBytes: 0, serverUploadTime: Date.now() },
        }),
      },
      remoteConfig: { fetchRemoteConfig: false },
      logLevel: Types.LogLevel.None,
      autocapture: {
        appLifecycles: false,
        sessions: false,
        screenViews: false,
        elementInteractions: true,
        frustrationInteractions: { deadClick: true, rageClick: false },
      },
    }).promise;
    replay = new SessionReplayPlugin({ sampleRate: 1, enableRemoteConfig: false, autoStart: true });
    await client.add(replay).promise;
    // An enabled JS plugin alone is insufficient: assert actual native recording
    // and the identity required by the detector before testing any presses.
    await waitFor(
      async () => {
        const state = await signals.getInterfaceSignalState();
        expect(state.isProviding).toBe(true);
        expect(state.sessionId).toBe(String(client?.getSessionId()));
        expect(state.deviceId).toBe(client?.getDeviceId());
      },
      { timeout: 5_000 },
    );
    pressedAt = 0;
    unmount = undefined;
  });

  afterEach(async () => {
    client?.setOptOut(true);
    await client?.remove('@amplitude/plugin-frustration-react-native').promise;
    if (replay) await client?.remove(replay.name).promise;
    client?.shutdown();
    unmount?.();
    capture.clear();
  });

  async function press(changeDelay?: number) {
    const rendered = await render(
      <DeadClickScreen
        changeDelay={changeDelay}
        onPress={() => {
          pressedAt = Date.now();
        }}
      />,
    );
    unmount = () => rendered.unmount();
    const button = await screen.findByTestId(BUTTON_ID);
    // Let native mount/layout signals settle before pressing. Fail if the screen
    // keeps changing, rather than silently testing an unavailable signal source.
    await waitFor(
      async () => {
        const state = await signals.getInterfaceSignalState();
        expect(Date.now() - state.lastChangeTime).toBeGreaterThan(750);
      },
      { timeout: 5_000 },
    );
    capture.clear();
    await userEvent.press(button);
    expect(pressedAt).toBeGreaterThan(0);
    // Witness that the real press reached autocapture, even in negative cases.
    await waitFor(() => {
      expect(capture.events.some((event) => event.event_type === '[Amplitude] Element Interacted')).toBe(true);
    });
  }

  async function expectOneDeadClick() {
    await waitFor(() => expect(deadClicks()).toHaveLength(1), { timeout: THRESHOLD + 1_000 });
    expect(deadClicks()[0].event_properties).toMatchObject({
      '[Amplitude] Target Test ID': BUTTON_ID,
      '[Amplitude] Duration': THRESHOLD,
      '[Amplitude] Click Count': 1,
    });
  }

  it('captures a dead click when the UI changes after the threshold', async () => {
    await press(LATE_CHANGE);
    await expectOneDeadClick();
    // Verify that this case really changes the native UI, after the event.
    await waitFor(
      async () => {
        expect((await signals.getInterfaceSignalState()).lastChangeTime).toBeGreaterThan(pressedAt + THRESHOLD);
      },
      { timeout: LATE_CHANGE },
    );
    await sleep(250);
    expect(deadClicks()).toHaveLength(1);
  });

  it('captures a dead click when the UI never changes', async () => {
    await press();
    await expectOneDeadClick();
    expect((await signals.getInterfaceSignalState()).lastChangeTime).toBeLessThan(pressedAt);
  });

  it('does not capture a dead click when the UI changes immediately', async () => {
    await press(0);
    await waitFor(async () => {
      expect((await signals.getInterfaceSignalState()).lastChangeTime).toBeGreaterThanOrEqual(pressedAt);
    });
    // waitForEvents(0) resolves immediately; negative assertions must observe
    // the entire detection window, including native round-trip headroom.
    await sleep(Math.max(0, pressedAt + THRESHOLD + 1_000 - Date.now()));
    expect(deadClicks()).toHaveLength(0);
  });

  it('does not capture a dead click with Replay stopped and no UI change', async () => {
    await replay?.stop();
    await waitFor(async () => expect((await signals.getInterfaceSignalState()).isProviding).toBe(false));
    await press();
    await sleep(Math.max(0, pressedAt + THRESHOLD + 1_000 - Date.now()));
    expect((await signals.getInterfaceSignalState()).isProviding).toBe(false);
    expect(deadClicks()).toHaveLength(0);
  });
});
