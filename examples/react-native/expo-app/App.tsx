import {Button, StyleSheet, Text, View} from 'react-native';
import {useEffect, useState} from 'react';
import {identify, Identify, init, track, add, Types} from '@amplitude/analytics-react-native';
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

const Stack = createNativeStackNavigator();

// ---------------------------------------------------------------------------
// TC1 (offline queue -> reconnect flush) instrumentation — EXAMPLE-APP ONLY.
//
// Offline mode is normally only observable in Debug logs ("Skipping flush while
// offline.", upload/serverUploadTime). Maestro asserts on visible UI, not logs,
// so we surface the three pieces of state TC1 cares about as on-screen labels:
//
//   * Offline  — the live value of `config.offline` (flipped by the native
//                connectivity checker plugin). There is no JS event to subscribe
//                to, so we capture the shared `config` via a tiny enrichment
//                plugin and poll it.
//   * Queued   — events that have been track()'d but whose promise has not yet
//                resolved. The Destination plugin only resolves a track promise
//                once a send is *attempted* (fulfillRequest). While offline,
//                flush() is short-circuited, so the promise stays pending — i.e.
//                this counter is the in-memory queue depth.
//   * Uploaded — events whose promise resolved with HTTP 200 (a real upload).
//   * Last     — the last flush outcome: "queued (offline)" when an event is
//                tracked while offline (the UI-observable equivalent of the
//                "Skipping flush while offline." log line) vs the resolved
//                "<code> <message>" (e.g. "200 Event tracked successfully")
//                once it actually flushes after reconnect.
//
// Keep this small and example-appropriate; it is test scaffolding, not SDK code.
// ---------------------------------------------------------------------------

type TcState = {
  offline: boolean | null;
  queued: number;
  uploaded: number;
  last: string;
};

const tc: TcState = {offline: null, queued: 0, uploaded: 0, last: '—'};
const tcListeners = new Set<() => void>();
const notifyTc = () => tcListeners.forEach((listener) => listener());

// The connectivity plugin mutates `config.offline` on the shared config instance.
// All plugins receive that same instance in setup(), so capturing it here lets the
// UI read the live offline flag.
let capturedConfig: {offline?: boolean | null} | null = null;
const offlineProbePlugin: Types.EnrichmentPlugin = {
  name: 'expo-offline-probe',
  type: 'enrichment',
  setup: async (config) => {
    capturedConfig = config as unknown as {offline?: boolean | null};
  },
  execute: async (event) => event,
};

// track() wrapper that feeds the on-screen counters.
function trackObserved(eventType: string) {
  tc.queued += 1;
  tc.last = capturedConfig?.offline ? `${eventType} → queued (offline)` : `${eventType} → sending…`;
  notifyTc();
  track(eventType)
    .promise.then((result) => {
      tc.queued -= 1;
      if (result.code === 200) {
        tc.uploaded += 1;
      }
      tc.last = `${result.event.event_type} → ${result.code} ${result.message}`;
      notifyTc();
    })
    .catch((e: unknown) => {
      tc.queued -= 1;
      tc.last = `error: ${String(e)}`;
      notifyTc();
    });
}

function useTcState(): TcState {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force((n) => n + 1);
    tcListeners.add(listener);
    // config.offline is flipped imperatively by the plugin; poll it so the label
    // tracks live connectivity changes.
    const pollId = setInterval(() => {
      const next = capturedConfig?.offline ?? null;
      const normalized = next === null ? null : !!next;
      if (normalized !== tc.offline) {
        tc.offline = normalized;
        notifyTc();
      }
    }, 500);
    return () => {
      tcListeners.delete(listener);
      clearInterval(pollId);
    };
  }, []);
  return tc;
}

function HomeScreen({ navigation }: {navigation: any}) {
  const state = useTcState();
  return (
    <View style={styles.container}>
      <Text>Home Screen</Text>
      <Button title="Online test" onPress={() => trackObserved('RN Expo Online Test')} />
      <Button title="Offline test" onPress={() => trackObserved('RN Expo Offline Test')} />
      <Button title="Go to Settings" onPress={() => navigation.navigate('Settings')} />
      {/* TC1 status panel — asserted on by examples/.../.maestro/tc1-* flows. */}
      <View style={styles.status}>
        <Text testID="tc-offline">Offline: {state.offline === null ? 'unknown' : String(state.offline)}</Text>
        <Text testID="tc-queued">Queued: {state.queued}</Text>
        <Text testID="tc-uploaded">Uploaded: {state.uploaded}</Text>
        <Text testID="tc-last">Last: {state.last}</Text>
      </View>
    </View>
  );
}

function SettingsScreen({navigation}: {navigation: any}) {
  return (
    <View style={styles.container}>
      <Text>Settings Screen</Text>
      <Button title="Go to Home" onPress={() => navigation.navigate('Home')} />
    </View>
  );
}

export default function App() {
  useEffect(() => {
    (async () => {
        // Capture the shared config before init so config.offline is observable.
        add(offlineProbePlugin);
        // AMPLITUDE_API_KEY is inlined at bundle time (see babel.config.js).
        await init(process.env.AMPLITUDE_API_KEY || 'YOUR_API_KEY', 'react-native-user-id', {
          // Debug so offline-mode log lines ("Skipping flush while offline.",
          // flush/upload) are visible when manually testing connectivity.
          logLevel: Types.LogLevel.Debug,
          // autocapture: { } // <-- todo
        }).promise;
        trackObserved('expo-app/react-native/test-event');
        await identify(new Identify().set('react-native-test', 'yes')).promise;
    })();
  }, []);
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    marginTop: 24,
    alignItems: 'center',
  },
});
