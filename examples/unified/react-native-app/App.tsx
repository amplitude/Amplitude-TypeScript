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
import {init, Types} from '@amplitude/unified-react-native';

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
  const [status, setStatus] = React.useState(
    'Attach Android Studio Network Inspector, then initialize all SDK blades.',
  );
  const [isInitializing, setIsInitializing] = React.useState(false);
  const [isInitialized, setIsInitialized] = React.useState(false);

  const initializeAll = async () => {
    setIsInitializing(true);
    setStatus('Initializing all SDK blades…');
    await init(API_KEY, {
      logLevel: Types.LogLevel.Warn,
      analytics: {userId: 'unified-example-user'},
      sessionReplay: {
        enableRemoteConfig: false,
        logLevel: Types.LogLevel.Debug,
        sampleRate: 1,
      },
    });
    setIsInitialized(true);
    setIsInitializing(false);
    setStatus(
      'Initialization completed. Check Metro or Logcat for any blade errors.',
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
            title={
              isInitialized
                ? 'SDK initialization completed'
                : 'Initialize all SDKs'
            }
            disabled={isInitializing || isInitialized}
            onPress={initializeAll}
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
