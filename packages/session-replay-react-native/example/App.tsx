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
  AmpMaskView,
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
  Masking: undefined;
  Recycle: { visit: number };
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
        const sessionId = await getSessionId();
        const props = await getSessionReplayProperties();
        log('init() resolved deviceId=' + verificationDeviceId);
        log('getSessionId() -> ' + String(sessionId));
        log('getSessionReplayProperties() -> ' + JSON.stringify(props));

        // init() swallows native setup failures and resolves without throwing;
        // verify the module is actually live before showing success.
        if (sessionId === null || Object.keys(props).length === 0) {
          log(
            'ERROR: init() resolved but Session Replay is not initialized ' +
              `(sessionId=${String(sessionId)}, props=${JSON.stringify(props)})`,
          );
          setOk(false);
        } else {
          log('init() ok');
          setOk(true);
        }
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
          <Button title="Masking" onPress={() => navigation.navigate('Masking')} />
          <Button
            title="Recycle"
            onPress={() => navigation.navigate('Recycle', { visit: 1 })}
          />
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

// ---------------------------------------------------------------------------
// Masking verification screens
// ---------------------------------------------------------------------------

type LayoutRect = { x: number; y: number; width: number; height: number };

function rectToString(r: LayoutRect | null): string {
  return r
    ? `(${r.x.toFixed(1)}, ${r.y.toFixed(1)}, ${r.width.toFixed(1)}, ${r.height.toFixed(1)})`
    : 'pending';
}

function rectsEqual(a: LayoutRect | null, b: LayoutRect | null): boolean {
  return (
    a !== null &&
    b !== null &&
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

function ParityRowContent(): React.JSX.Element {
  return (
    <View style={styles.parityRowInner}>
      <View style={styles.parityBoxA} />
      <View style={styles.parityFlexBox}>
        <Text style={styles.cardSub}>flex:1 content</Text>
      </View>
      <View style={styles.parityBoxA} />
    </View>
  );
}

/**
 * MaskingScreen verifies, on-screen and via onLayout:
 * 1. Parity — an <AmpMaskView> wrapper must lay out identically to a plain
 *    <View> wrapper around the same content.
 * 2. Nested mask ⊃ unmask (the legacy-interop "Effect B" trigger) — the
 *    unmasked sibling must render BELOW its predecessor, not on top of it.
 * 3. Touch pass-through — a button inside a mask must stay tappable.
 */
function MaskingScreen(): React.JSX.Element {
  const [viewRect, setViewRect] = useState<LayoutRect | null>(null);
  const [maskRect, setMaskRect] = useState<LayoutRect | null>(null);
  const [rectA, setRectA] = useState<LayoutRect | null>(null);
  const [rectB, setRectB] = useState<LayoutRect | null>(null);
  const [taps, setTaps] = useState(0);

  const parityOk = rectsEqual(viewRect, maskRect);
  // B must start where A ends (stacked), not at A's origin (overlapped).
  const nestedOk =
    rectA !== null && rectB !== null && Math.abs(rectB.y - (rectA.y + rectA.height)) < 0.5;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.bodyContent}>
        <Text style={styles.heading}>1 · Layout parity (View vs AmpMaskView)</Text>
        <View
          style={styles.parityWrapper}
          onLayout={(e) => setViewRect(e.nativeEvent.layout)}
        >
          <ParityRowContent />
        </View>
        <AmpMaskView
          mask="amp-mask"
          style={styles.parityWrapper}
          onLayout={(e) => setMaskRect(e.nativeEvent.layout)}
        >
          <ParityRowContent />
        </AmpMaskView>
        <Text style={parityOk ? styles.pass : styles.fail} testID="parity-result">
          {parityOk ? 'PASS' : 'FAIL'} · View {rectToString(viewRect)} · Mask{' '}
          {rectToString(maskRect)}
        </Text>

        <Text style={styles.heading}>2 · Nested mask ⊃ unmask (Effect B)</Text>
        <AmpMaskView mask="amp-mask">
          <View
            style={styles.nestedBoxA}
            onLayout={(e) => setRectA(e.nativeEvent.layout)}
          >
            <Text style={styles.nestedLabel}>A — masked (red)</Text>
          </View>
          <AmpMaskView
            mask="amp-unmask"
            onLayout={(e) => setRectB(e.nativeEvent.layout)}
          >
            <View style={styles.nestedBoxB}>
              <Text style={styles.nestedLabel}>B — unmasked (green), must be BELOW A</Text>
            </View>
          </AmpMaskView>
        </AmpMaskView>
        <Text style={nestedOk ? styles.pass : styles.fail} testID="nested-result">
          {nestedOk ? 'PASS' : 'FAIL'} · A {rectToString(rectA)} · B {rectToString(rectB)}
        </Text>

        <Text style={styles.heading}>3 · Touch pass-through</Text>
        <AmpMaskView mask="amp-mask" style={styles.touchWrapper}>
          <Button title={`Tap me (taps: ${taps})`} onPress={() => setTaps((t) => t + 1)} />
        </AmpMaskView>
        <Text style={taps > 0 ? styles.pass : styles.note} testID="touch-result">
          {taps > 0 ? 'PASS' : 'Tap the button above to verify touches reach it'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

type RecycleProps = NativeStackScreenProps<RootStackParamList, 'Recycle'>;

/**
 * RecycleScreen stresses Fabric view recycling (the customer-reported stale-
 * frame trigger): each visit renders masks whose target frames differ from the
 * previous visit (offsets alternate with the visit count), so a recycled
 * native view must take on a NEW origin every time. Every colored mask fill
 * must sit exactly inside its dashed outline slot — a fill escaping its
 * outline means a recycled view kept a stale frame. Use "Revisit" repeatedly
 * (it replaces this screen, unmounting every mask) to cycle native instances
 * through the recycle pool.
 */
function RecycleScreen({ navigation, route }: RecycleProps): React.JSX.Element {
  const visit = route.params.visit;
  // Alternate the horizontal offset pattern between visits so recycled
  // instances always get fresh origins.
  const offsets =
    visit % 2 === 1 ? [0, 120, 40, 200, 80, 160] : [200, 40, 160, 0, 120, 80];

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.bodyContent}>
        <Text style={styles.heading}>Visit #{visit} — fills must match outlines</Text>
        {offsets.map((offset, i) => (
          <View key={i} style={[styles.recycleSlot, { marginLeft: offset }]}>
            <AmpMaskView mask={i % 2 === 0 ? 'amp-mask' : 'amp-unmask'} style={styles.recycleFill}>
              <Text style={styles.nestedLabel}>
                #{i} {i % 2 === 0 ? 'mask' : 'unmask'} @ {offset}
              </Text>
            </AmpMaskView>
          </View>
        ))}
        <View style={styles.buttons}>
          <Button
            title={`Revisit (→ #${visit + 1})`}
            onPress={() => navigation.replace('Recycle', { visit: visit + 1 })}
          />
          <Button title="Home" onPress={() => navigation.popToTop()} />
        </View>
      </ScrollView>
    </SafeAreaView>
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
        <Stack.Screen name="Masking" component={MaskingScreen} />
        <Stack.Screen name="Recycle" component={RecycleScreen} />
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
  parityWrapper: { marginBottom: 8 },
  parityRowInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  parityBoxA: { width: 40, height: 40, borderRadius: 6, backgroundColor: '#93c5fd' },
  parityFlexBox: {
    flex: 1,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nestedBoxA: {
    height: 60,
    backgroundColor: '#fca5a5',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  nestedBoxB: {
    height: 60,
    backgroundColor: '#86efac',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  nestedLabel: { fontSize: 13, fontWeight: '600', color: '#111827' },
  touchWrapper: { marginBottom: 8 },
  pass: { color: '#16a34a', fontWeight: '700', marginTop: 4, fontSize: 13 },
  fail: { color: '#dc2626', fontWeight: '700', marginTop: 4, fontSize: 13 },
  recycleSlot: {
    width: 180,
    height: 44,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#6b7280',
    borderRadius: 6,
    marginBottom: 10,
  },
  recycleFill: {
    flex: 1,
    backgroundColor: '#fdba74',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logLine: {
    color: '#7CFC9A',
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
});
