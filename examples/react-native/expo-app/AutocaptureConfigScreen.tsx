import {useEffect, useState} from 'react';
import {Platform, ScrollView, StyleSheet, Text, View} from 'react-native';
import {Types} from '@amplitude/analytics-react-native';

type AutocaptureSnapshot = {
  ready: boolean;
  autocapture: Types.ReactNativeConfig['autocapture'];
};

let snapshot: AutocaptureSnapshot = {
  ready: false,
  autocapture: undefined,
};
const subscribers = new Set<(next: AutocaptureSnapshot) => void>();

function publish(next: AutocaptureSnapshot) {
  snapshot = next;
  subscribers.forEach((listener) => listener(next));
}

/**
 * Enrichment plugin whose setup() runs during init, after remote config has been
 * merged into the local React Native config.
 */
export const autocaptureConfigDebugPlugin: Types.EnrichmentPlugin<Types.ReactNativeClient, Types.ReactNativeConfig> = {
  name: 'expo-app-autocapture-config-debug',
  type: 'enrichment',
  setup: async (config) => {
    publish({
      ready: true,
      autocapture: config.autocapture,
    });
  },
  execute: async (event) => event,
};

export default function AutocaptureConfigScreen() {
  const [current, setCurrent] = useState<AutocaptureSnapshot>(snapshot);

  useEffect(() => {
    subscribers.add(setCurrent);
    setCurrent(snapshot);
    return () => {
      subscribers.delete(setCurrent);
    };
  }, []);

  const body = current.ready
    ? JSON.stringify(current.autocapture ?? null, null, 2)
    : 'Waiting for Amplitude init (remote config merge)...';

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Autocapture Config</Text>
      <Text style={styles.description}>
        This is the autocapture config after local options were merged with Remote Config.
      </Text>
      <View style={styles.jsonBox}>
        <Text selectable style={styles.jsonText}>
          {body}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    backgroundColor: '#fff',
    flexGrow: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
  },
  description: {
    marginBottom: 12,
    lineHeight: 20,
  },
  jsonBox: {
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 4,
  },
  jsonText: {
    fontFamily: Platform.select({ios: 'Menlo', android: 'monospace', default: 'monospace'}),
    fontSize: 12,
  },
});
