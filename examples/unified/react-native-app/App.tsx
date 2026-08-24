import React from 'react';
import {
  Button,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {
  engagement,
  experiment,
  initAll,
  LogLevel,
  sessionReplay,
  track,
} from '@amplitude/unified-react-native';

const getApiKey = (): string => {
  const apiKey = process.env.VITE_AMPLITUDE_API_KEY;
  if (!apiKey || apiKey.startsWith('<')) {
    throw new Error(
      'Set VITE_AMPLITUDE_API_KEY in the repository-root .env file, then restart Metro.',
    );
  }
  return apiKey;
};

const API_KEY = getApiKey();

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [status, setStatus] = React.useState('Initializing all SDK blades…');

  React.useEffect(() => {
    initAll(API_KEY, {
      logLevel: LogLevel.Warn,
      analytics: {userId: 'unified-example-user'},
      sessionReplay: {sampleRate: 1},
    })
      .then(() => {
        engagement.boot('unified-example-user');
        setStatus(
          'Analytics, Experiment, Session Replay, and Engagement are ready.',
        );
      })
      .catch((error: unknown) =>
        setStatus(`Initialization failed: ${String(error)}`),
      );
  }, []);

  const run = (label: string, action: () => void | Promise<unknown>) => {
    setStatus(`${label}…`);
    Promise.resolve()
      .then(action)
      .then(() => setStatus(`${label} succeeded.`))
      .catch((error: unknown) =>
        setStatus(`${label} failed: ${String(error)}`),
      );
  };

  const trackAnalyticsEvent = async () => {
    const result = await track('Unified Example Event').promise;
    if (result.code !== 200) {
      throw new Error(`Analytics returned ${result.code}: ${result.message}`);
    }
  };

  const startExperiment = async () => {
    const client = experiment();
    if (!client) {
      throw new Error('Experiment is not initialized.');
    }
    await client.start();
  };

  const startSessionReplay = async () => {
    const plugin = sessionReplay();
    if (!plugin) {
      throw new Error('Session Replay is not initialized.');
    }
    await plugin.start();
  };

  const colors = isDarkMode
    ? {
        background: '#111827',
        card: '#1f2937',
        text: '#f9fafb',
        muted: '#d1d5db',
      }
    : {
        background: '#f3f4f6',
        card: '#ffffff',
        text: '#111827',
        muted: '#4b5563',
      };

  return (
    <SafeAreaView
      style={[styles.safeArea, {backgroundColor: colors.background}]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={[styles.eyebrow, {color: colors.muted}]}>AMPLITUDE</Text>
        <Text style={[styles.title, {color: colors.text}]}>
          Unified React Native SDK
        </Text>
        <Text style={[styles.description, {color: colors.muted}]}>
          This app directly installs one Amplitude package and uses its
          autolinking preset for every native blade.
        </Text>

        <View style={[styles.card, {backgroundColor: colors.card}]}>
          <Button
            title="Track event"
            onPress={() => run('Track event', trackAnalyticsEvent)}
          />
          <Button
            title="Start Experiment"
            onPress={() => run('Start Experiment', startExperiment)}
          />
          <Button
            title="Start Session Replay"
            onPress={() => run('Start Session Replay', startSessionReplay)}
          />
          <Button
            title="Boot Guides and Surveys"
            onPress={() =>
              run('Boot Guides and Surveys', () =>
                engagement.boot('unified-example-user'),
              )
            }
          />
        </View>

        <Text
          accessibilityRole="summary"
          style={[styles.status, {color: colors.text}]}>
          {status}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1},
  page: {flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16},
  eyebrow: {fontSize: 12, fontWeight: '700', letterSpacing: 2},
  title: {fontSize: 32, fontWeight: '700'},
  description: {fontSize: 16, lineHeight: 24},
  card: {borderRadius: 16, padding: 16, gap: 12},
  status: {fontSize: 14, lineHeight: 20},
});

export default App;
