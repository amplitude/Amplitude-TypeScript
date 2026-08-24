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

const API_KEY = process.env.VITE_AMPLITUDE_API_KEY || 'YOUR_API_KEY';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [status, setStatus] = React.useState('Initializing all SDK blades…');

  React.useEffect(() => {
    initAll(API_KEY, {
      logLevel: LogLevel.Debug,
      analytics: {userId: 'unified-example-user'},
      sessionReplay: {sampleRate: 1},
    })
      .then(() =>
        setStatus(
          'Analytics, Experiment, Session Replay, and Engagement are ready.',
        ),
      )
      .catch((error: unknown) =>
        setStatus(`Initialization failed: ${String(error)}`),
      );
  }, []);

  const run = (label: string, action: () => void | Promise<unknown>) => {
    setStatus(`${label}…`);
    Promise.resolve(action())
      .then(() => setStatus(`${label} succeeded.`))
      .catch((error: unknown) =>
        setStatus(`${label} failed: ${String(error)}`),
      );
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
            onPress={() =>
              run('Track event', () => track('Unified Example Event').promise)
            }
          />
          <Button
            title="Start Experiment"
            onPress={() => run('Start Experiment', () => experiment()?.start())}
          />
          <Button
            title="Start Session Replay"
            onPress={() =>
              run('Start Session Replay', () => sessionReplay()?.start())
            }
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
