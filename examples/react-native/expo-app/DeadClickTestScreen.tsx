import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ampCapture, Types } from '@amplitude/analytics-react-native';
import { SessionReplayPlugin } from '@amplitude/plugin-session-replay-react-native';

export const deadClickReplay = new SessionReplayPlugin({
  sampleRate: 1,
  enableRemoteConfig: false,
  autoStart: true,
  logLevel: Types.LogLevel.Debug,
});

type DeadClickResult = { time: number; properties: Record<string, unknown> };
let results: DeadClickResult[] = [];
let replayRecording = true;
const listeners = new Set<(events: DeadClickResult[]) => void>();
const testTargets = new Set([
  'dead-click-no-response',
  'dead-click-immediate-update',
  'dead-click-update-1s',
  'dead-click-update-4s',
]);

function publish(next: DeadClickResult[]) {
  results = next;
  listeners.forEach((listener) => listener(next));
}

export const deadClickDebugPlugin: Types.EnrichmentPlugin<Types.ReactNativeClient, Types.ReactNativeConfig> = {
  name: 'expo-app-dead-click-debug',
  type: 'enrichment',
  execute: async (event) => {
    const properties = (event.event_properties ?? {}) as Record<string, unknown>;
    const target = properties['[Amplitude] Target Test ID'];
    if (event.event_type === '[Amplitude] Dead Click' && typeof target === 'string' && testTargets.has(target)) {
      const result = { time: event.time ?? Date.now(), properties };
      console.log('[Dead Click Test]', result);
      publish([result, ...results].slice(0, 10));
    }
    return event;
  },
};

type Props = { ready: boolean; initializationError?: string };

export default function DeadClickTestScreen({ ready, initializationError }: Props) {
  const [events, setEvents] = useState(results);
  const [updates, setUpdates] = useState(0);
  const [recording, setRecording] = useState(replayRecording);
  const [controlError, setControlError] = useState<string>();
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const supported = Platform.OS !== 'web';
  const enabled = ready && supported;

  useEffect(() => {
    const pendingTimers = timers.current;
    listeners.add(setEvents);
    setEvents(results);
    return () => {
      listeners.delete(setEvents);
      pendingTimers.forEach(clearTimeout);
      pendingTimers.clear();
    };
  }, []);

  const updateAfter = (delay: number) => {
    // Do not render a countdown or status change while awaiting the UI update:
    // those changes would themselves suppress the dead click being tested.
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setUpdates((value) => value + 1);
    }, delay);
    timers.current.add(timer);
  };

  const toggleReplay = async () => {
    try {
      if (recording) {
        await deadClickReplay.stop();
      } else {
        await deadClickReplay.start();
      }
      replayRecording = !recording;
      setRecording(replayRecording);
      setControlError(undefined);
    } catch (error) {
      setControlError(String(error));
    }
  };

  const capture = (testID: string, handler: () => void) =>
    ampCapture(handler, { action: 'Press', component: 'Pressable', testID });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Dead clicks</Text>
      <Text>
        A press with no Session Replay UI change within 3 seconds should produce one dead click. Wait for this screen to
        settle before each test, then leave it untouched for at least 4 seconds.
      </Text>
      <Text testID="dead-click-replay-status">
        {!supported
          ? 'Requires an iOS or Android development build.'
          : initializationError
          ? `Replay setup failed: ${initializationError}`
          : !ready
          ? 'Initializing Session Replay…'
          : recording
          ? 'Replay started (100% sample rate)'
          : 'Replay stopped'}
      </Text>
      <Text testID="dead-click-ui-updates">UI updates: {updates}</Text>

      <Pressable
        testID="dead-click-no-response"
        accessibilityRole="button"
        disabled={!enabled}
        style={styles.button}
        onPress={capture('dead-click-no-response', () => undefined)}
      >
        <Text>No response — expect a dead click</Text>
      </Pressable>
      <Pressable
        testID="dead-click-immediate-update"
        accessibilityRole="button"
        disabled={!enabled}
        style={styles.button}
        onPress={capture('dead-click-immediate-update', () => setUpdates((value) => value + 1))}
      >
        <Text>Update immediately — expect no dead click</Text>
      </Pressable>
      <Pressable
        testID="dead-click-update-1s"
        accessibilityRole="button"
        disabled={!enabled}
        style={styles.button}
        onPress={capture('dead-click-update-1s', () => updateAfter(1000))}
      >
        <Text>Update after 1 second — expect no dead click</Text>
      </Pressable>
      <Pressable
        testID="dead-click-update-4s"
        accessibilityRole="button"
        disabled={!enabled}
        style={styles.button}
        onPress={capture('dead-click-update-4s', () => updateAfter(4000))}
      >
        <Text>Update after 4 seconds — expect a dead click first</Text>
      </Pressable>
      <Pressable
        testID="dead-click-toggle-replay"
        accessibilityRole="button"
        disabled={!enabled}
        style={styles.button}
        onPress={() => void toggleReplay()}
      >
        <Text>{recording ? 'Stop Replay' : 'Start Replay'}</Text>
      </Pressable>
      {controlError ? <Text>{controlError}</Text> : null}
      <Text>With Replay stopped, No response should produce no dead click. Start Replay again before continuing.</Text>

      <Text style={styles.heading}>Captured dead clicks: {events.length} (last 10)</Text>
      <Text>
        Results update only when an event arrives. Full properties also appear in Metro under [Dead Click Test].
      </Text>
      <Pressable
        testID="dead-click-clear-results"
        accessibilityRole="button"
        style={styles.button}
        onPress={() => publish([])}
      >
        <Text>Clear results</Text>
      </Pressable>
      {events.map((event, index) => (
        <View key={`${event.time}-${index}`} style={styles.result}>
          <Text selectable>{JSON.stringify(event.properties, null, 2)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  heading: { fontSize: 18, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  // Static styling intentionally avoids pressed-state visuals and Android ripples.
  button: { backgroundColor: '#e8f0fe', borderRadius: 4, padding: 12, marginVertical: 6 },
  result: { backgroundColor: '#f5f5f5', padding: 12, marginTop: 8 },
});
