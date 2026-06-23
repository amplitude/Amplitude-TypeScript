/**
 * Example app for @amplitude/session-replay-react-native. Calls each native
 * module method and renders the result, plus the live React Native architecture.
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import {
  Button,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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

export default function App(): React.JSX.Element {
  const [lines, setLines] = useState<string[]>([]);
  const [ok, setOk] = useState<boolean | null>(null);
  const log = (m: string) => setLines((l) => [...l, m]);

  useEffect(() => {
    (async () => {
      try {
        log('init() ...');
        await init({
          apiKey: 'YOUR_AMPLITUDE_API_KEY',
          deviceId: 'smoke-device',
          sessionId: Date.now(),
          sampleRate: 1,
          enableRemoteConfig: false,
        });
        log('init() ok');
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

  const run = (name: string, fn: () => Promise<unknown>) => async () => {
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
      </View>
      <View style={styles.buttons}>
        <Button title="start" onPress={run('start', start)} />
        <Button title="stop" onPress={run('stop', stop)} />
        <Button title="flush" onPress={run('flush', flush)} />
        <Button
          title="setSessionId"
          onPress={run('setSessionId', () => setSessionId(Date.now()))}
        />
        <Button
          title="setDeviceId"
          onPress={run('setDeviceId', () => setDeviceId('smoke-2'))}
        />
        <Button title="getSessionId" onPress={run('getSessionId', getSessionId)} />
      </View>
      <ScrollView style={styles.logBox} contentContainerStyle={styles.logContent}>
        {lines.map((l, i) => (
          <Text key={i} style={styles.logLine}>
            {l}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  banner: { paddingVertical: 16, alignItems: 'center' },
  bannerText: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  meta: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  metaText: {
    fontSize: 14,
    color: '#111827',
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 4 },
  logBox: { flex: 1, margin: 8, backgroundColor: '#0b1021', borderRadius: 8 },
  logContent: { padding: 12 },
  logLine: {
    color: '#7CFC9A',
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
});
