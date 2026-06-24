/**
 * Example app for @amplitude/session-replay-react-native.
 *
 * A small multi-screen app used to manually verify the Session Replay native
 * module across both React Native architectures (Old + New / TurboModule +
 * Fabric). It initializes the SDK, exercises every native method, and renders
 * enough varied UI (navigation, text inputs, switches, images, a web view, and
 * scrollable content) to generate non-trivial replay frames.
 *
 * The deviceId is derived from platform + architecture (e.g. "ios-newarch") so
 * replay output can be attributed to the exact combination under test.
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import {
  Button,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';

import {
  init,
  start,
  stop,
  flush,
  getSessionId,
  getSessionReplayProperties,
  setSessionId,
  setDeviceId,
} from '@amplitude/session-replay-react-native';

const g = global as unknown as {
  __turboModuleProxy?: unknown;
  RN$Bridgeless?: boolean;
  nativeFabricUIManager?: unknown;
};
const isTurboModule = g.__turboModuleProxy != null || g.RN$Bridgeless === true;
const isFabric = g.nativeFabricUIManager != null;
const rnv = Platform.constants?.reactNativeVersion;
const rnVersion = rnv ? `${rnv.major}.${rnv.minor}.${rnv.patch}` : 'unknown';

// Human-readable deviceId that attributes replay output to the exact
// platform + architecture combination under test (e.g. "ios-newarch").
const archMode = isTurboModule ? 'newarch' : 'oldarch';
const verificationDeviceId = `${Platform.OS}-${archMode}`;

// 1x1-ish red PNG used to put bitmap content into replay frames offline.
const SAMPLE_IMG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADMAAAAzCAYAAAA6oTAqAAAAEXRFWHRTb2Z0d2FyZQBwbmdjcnVzaEB1SfMAAABQSURBVGje7dSxCQBACARB+2/ab8BEeQNhFi6WSYzYLYudDQYGBgYGBgYGBgYGBgYGBgZmcvDqYGBgmhivGQYGBgYGBgYGBgYGBgYGBgbmQw+P/eMrC5UTVAAAAABJRU5ErkJggg==';

type RootStackParamList = {
  Home: undefined;
  Form: undefined;
  Gallery: undefined;
  Web: undefined;
};

type HomeProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

function HomeScreen({ navigation }: HomeProps): React.JSX.Element {
  const [lines, setLines] = useState<string[]>([]);
  const [ok, setOk] = useState<boolean | null>(null);
  const log = (m: string) => setLines((l) => [...l, m]);

  useEffect(() => {
    (async () => {
      try {
        log('init() ...');
        await init({
          apiKey: 'YOUR_AMPLITUDE_API_KEY',
          deviceId: verificationDeviceId,
          sessionId: Date.now(),
          sampleRate: 1,
          enableRemoteConfig: false,
          logLevel: 4,
        });
        log('init() ok deviceId=' + verificationDeviceId);
        log('getSessionId() -> ' + String(await getSessionId()));
        log(
          'getSessionReplayProperties() -> ' +
            JSON.stringify(await getSessionReplayProperties()),
        );
        setOk(true);
      } catch (e) {
        log('ERROR: ' + String(e));
        setOk(false);
      }
    })();
  }, []);

  const runFn = (name: string, fn: () => Promise<unknown>) => async () => {
    try {
      const r = await fn();
      log(`${name}() ok` + (r === undefined ? '' : ' -> ' + JSON.stringify(r)));
    } catch (e) {
      log(`${name}() ERROR: ` + String(e));
    }
  };

  const bannerColor = ok === null ? '#9ca3af' : ok ? '#16a34a' : '#dc2626';
  const bannerText =
    ok === null ? 'RUNNING…' : ok ? 'TURBOMODULE OK' : 'FAILED';

  return (
    <SafeAreaView style={styles.root}>
      <View style={[styles.banner, { backgroundColor: bannerColor }]}>
        <Text style={styles.bannerText}>{bannerText}</Text>
      </View>
      <View style={styles.meta}>
        <Text style={styles.metaText} testID="rn-version">
          RN {rnVersion} · {Platform.OS}
        </Text>
        <Text style={styles.metaText} testID="arch">
          TurboModule: {String(isTurboModule)} · Fabric: {String(isFabric)}
        </Text>
        <Text style={styles.metaText} testID="device-id">
          deviceId: {verificationDeviceId}
        </Text>
      </View>
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Text style={styles.heading}>Session Replay controls</Text>
        <View style={styles.buttons}>
          <Button title="start" onPress={runFn('start', start)} />
          <Button title="stop" onPress={runFn('stop', stop)} />
          <Button title="flush" onPress={runFn('flush', flush)} />
          <Button
            title="setSessionId"
            onPress={runFn('setSessionId', () => setSessionId(Date.now()))}
          />
          <Button
            title="setDeviceId"
            onPress={runFn('setDeviceId', () => setDeviceId(verificationDeviceId))}
          />
          <Button
            title="getSessionId"
            onPress={runFn('getSessionId', getSessionId)}
          />
          <Button
            title="getProps"
            onPress={runFn('getSessionReplayProperties', getSessionReplayProperties)}
          />
        </View>

        <Text style={styles.heading}>Navigate</Text>
        <View style={styles.buttons}>
          <Button title="Form" onPress={() => navigation.navigate('Form')} />
          <Button title="Gallery" onPress={() => navigation.navigate('Gallery')} />
          <Button title="Web" onPress={() => navigation.navigate('Web')} />
        </View>

        <Text style={styles.heading}>Log</Text>
        <View style={styles.logBox}>
          {lines.map((l, i) => (
            <Text key={i} style={styles.logLine}>
              {l}
            </Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FormScreen(): React.JSX.Element {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [subscribe, setSubscribe] = useState(false);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.bodyContent}>
        <Text style={styles.heading}>Sign-up form</Text>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Jane Doe"
        />
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="jane@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Text style={styles.label}>Password (secureTextEntry)</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
        />
        <View style={styles.switchRow}>
          <Text style={styles.label}>Subscribe to newsletter</Text>
          <Switch value={subscribe} onValueChange={setSubscribe} />
        </View>
        <Text style={styles.note}>
          Note: this PR (TurboModule migration) does not add replay masking.
          Native field masking is a later PR; secureTextEntry here only hides
          characters on screen.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function GalleryScreen(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.bodyContent}>
        <Text style={styles.heading}>Gallery (scroll me)</Text>
        {Array.from({ length: 12 }).map((_, i) => (
          <View key={i} style={styles.card}>
            <Image source={{ uri: SAMPLE_IMG }} style={styles.thumb} />
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>Item #{i + 1}</Text>
              <Text style={styles.cardSub}>
                A scrollable row to generate incremental replay frames.
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function WebScreen(): React.JSX.Element {
  return (
    <View style={styles.root}>
      <WebView source={{ uri: 'https://reactnative.dev/' }} style={styles.flex} />
    </View>
  );
}

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App(): React.JSX.Element {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: `SR · ${verificationDeviceId}` }}
        />
        <Stack.Screen name="Form" component={FormScreen} />
        <Stack.Screen name="Gallery" component={GalleryScreen} />
        <Stack.Screen name="Web" component={WebScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  flex: { flex: 1 },
  banner: { paddingVertical: 16, alignItems: 'center' },
  bannerText: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  meta: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  metaText: {
    fontSize: 14,
    color: '#111827',
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  body: { flex: 1 },
  bodyContent: { padding: 12 },
  heading: { fontSize: 16, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  label: { fontSize: 14, color: '#374151', marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  note: { marginTop: 20, fontSize: 12, color: '#6b7280', lineHeight: 18 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  thumb: { width: 48, height: 48, borderRadius: 6, backgroundColor: '#fecaca' },
  cardBody: { flex: 1, marginLeft: 12 },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  cardSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  logBox: { backgroundColor: '#0b1021', borderRadius: 8, padding: 12 },
  logLine: {
    color: '#7CFC9A',
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
});
