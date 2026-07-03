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
  UIManager,
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
  AmpMask,
  AmpUnmask,
  AmpMaskView,
} from '@amplitude/session-replay-react-native';

const g = global as unknown as {
  __turboModuleProxy?: unknown;
  RN$Bridgeless?: boolean;
  nativeFabricUIManager?: unknown;
};
const isTurboModule = g.__turboModuleProxy != null || g.RN$Bridgeless === true;
const isFabric = g.nativeFabricUIManager != null;
// Same New Architecture check the library uses to select the AmpMask
// implementation (src/index.tsx) — keep the two in sync.
const isNewArch = g.RN$Bridgeless === true || g.nativeFabricUIManager != null;
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
  Mask: undefined;
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
          <Button title="Mask" onPress={() => navigation.navigate('Mask')} />
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

type MaskDemoWrapper = 'none' | 'ampmask' | 'ampmaskview';

/**
 * One layout-neutrality row: the same flex:1 child inside a fixed-height slot,
 * under one wrapper. The child's measured onLayout frame is printed next to
 * the label so zero layout shift can be verified by eye: the <AmpMask> row
 * must measure identical to the bare row, while the legacy <AmpMaskView> row
 * collapses the child to height 0 on the New Architecture.
 */
function MaskDemoRow({
  label,
  wrapper,
}: {
  label: string;
  wrapper: MaskDemoWrapper;
}): React.JSX.Element {
  const [frame, setFrame] = useState('measuring…');
  const child = (
    <View
      style={styles.maskFill}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setFrame(
          `${Math.round(width * 10) / 10}×${Math.round(height * 10) / 10}`,
        );
      }}
    >
      <Text style={styles.maskFillText}>flex:1 child</Text>
    </View>
  );
  return (
    <View style={styles.maskRow}>
      <Text style={styles.maskRowLabel}>
        {label} · <Text style={styles.maskRowFrame}>{frame}</Text>
      </Text>
      <View style={styles.maskSlot}>
        {wrapper === 'none' && child}
        {wrapper === 'ampmask' && <AmpMask>{child}</AmpMask>}
        {wrapper === 'ampmaskview' && (
          <AmpMaskView mask="amp-mask">{child}</AmpMaskView>
        )}
      </View>
    </View>
  );
}

function MaskScreen(): React.JSX.Element {
  const [secret, setSecret] = useState('4242-4242-4242-4242');

  if (!isNewArch) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.bodyContent}>
          <Text style={styles.heading}>
            {'<AmpMask> requires the New Architecture'}
          </Text>
          <Text style={styles.note}>
            This app is running on the Old Architecture (Paper). Rebuild with
            newArchEnabled=true (Android) / RCT_NEW_ARCH_ENABLED=1 (iOS) to try
            {' <AmpMask>/<AmpUnmask>, or use <AmpMaskView>, which supports '}
            both architectures (but is not layout-transparent).
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.bodyContent}>
        <Text style={styles.metaText}>
          RN$Bridgeless: {String(g.RN$Bridgeless)} · Native SRMaskView:{' '}
          {UIManager.hasViewManagerConfig?.('SRMaskView')
            ? 'available'
            : 'missing'}
        </Text>

        <Text style={styles.heading}>
          Layout neutrality (flex:1 child in a fixed-height slot)
        </Text>
        <Text style={styles.note}>
          All three rows render the same flex:1 child in a 96px slot.
          {' <AmpMask> is layout-transparent, so row 2 must measure identical '}
          to row 1. The legacy wrapper in row 3 introduces a layout boundary:
          on the New Architecture the child collapses to height 0.
        </Text>
        <MaskDemoRow label="1. bare <View>" wrapper="none" />
        <MaskDemoRow label="2. <AmpMask> wrapped" wrapper="ampmask" />
        <MaskDemoRow label="3. <AmpMaskView> wrapped (legacy)" wrapper="ampmaskview" />

        <Text style={styles.heading}>Replay masking</Text>
        <AmpMask>
          <Text style={styles.label}>Masked text: SECRET-1234</Text>
          <TextInput
            style={styles.input}
            value={secret}
            onChangeText={setSecret}
          />
        </AmpMask>
        <AmpMask maskLevel="block">
          <Text style={styles.label}>
            {'Blocked text (maskLevel="block")'}
          </Text>
        </AmpMask>
        <AmpUnmask>
          <Text style={styles.label}>Unmasked text: visible in replay</Text>
        </AmpUnmask>
        <Text style={styles.note}>
          Start recording on the Home screen, interact here, then check the
          replay: the masked/blocked content above must be obscured while the
          unmasked text stays visible.
        </Text>
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
        <Stack.Screen name="Mask" component={MaskScreen} />
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
  maskRow: { marginBottom: 12 },
  maskRowLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  maskRowFrame: { color: '#2563eb', fontWeight: '400' },
  maskSlot: {
    height: 96,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 4,
    backgroundColor: '#f3f4f6',
  },
  maskFill: {
    flex: 1,
    backgroundColor: '#dbeafe',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  maskFillText: { fontSize: 13, color: '#1e40af', fontWeight: '600' },
});
