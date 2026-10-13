import {Button, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useEffect, useState} from 'react';
import {
  add,
  ampCapture,
  flush,
  identify,
  Identify,
  init,
  track,
  Types,
  trackScreenViewOnNavigationStateChange,
} from '@amplitude/analytics-react-native';
import {experimentPlugin} from '@amplitude/plugin-experiment-react-native';
import { NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import FetchNetworkTestScreen from './FetchNetworkTestScreen';
import AutocaptureConfigScreen, {autocaptureConfigDebugPlugin} from './AutocaptureConfigScreen';

const experiment = experimentPlugin({
  // deploymentKey: 'DEPLOYMENT_KEY', // Optional when Experiment and Analytics use the same project key.
  debug: true,
});
const EXPERIMENT_FLAG_KEY = 'experiment-key'; // Replace with a deployed flag key to generate an exposure event.

const Stack = createNativeStackNavigator();

const startExperiment = async () => {
  const experimentClient = experiment.experiment;
  if (!experimentClient) {
    console.warn('Experiment is not ready. Wait for Analytics initialization and try again.');
    return;
  }

  try {
    // Restart so every button press produces fresh flags and variant requests.
    experimentClient.stop();
    await experimentClient.start();
    const variant = experimentClient.variant(EXPERIMENT_FLAG_KEY);
    console.log('Experiment variant:', variant);
    await flush().promise;
  } catch (error) {
    console.error('Experiment request failed:', error);
  }
};

function FrustrationInteractionsTestView() {
  const [errorDelayMs, setErrorDelayMs] = useState('100');
  const errorDelay = Math.max(0, Number(errorDelayMs) || 0);

  const throwException = () => {
    setTimeout(() => {
      throw new Error('Error click test exception');
    }, errorDelay);
  };
  const rejectPromise = () => {
    setTimeout(() => {
      void Promise.reject(new Error('Error click test rejection'));
    }, errorDelay);
  };
  const writeConsoleError = () => {
    setTimeout(() => {
      console.error('Error click test console error');
    }, errorDelay);
  };

  return (
    <View style={styles.container}>
      <Text>Frustration interactions</Text>
      <View style={styles.delayControl}>
        <Text>Error delay</Text>
        <TextInput
          accessibilityLabel="Error delay milliseconds"
          keyboardType="number-pad"
          onChangeText={setErrorDelayMs}
          style={styles.delayInput}
          testID="error-delay-ms"
          value={errorDelayMs}
        />
        <Text>ms</Text>
      </View>
      <View style={styles.delayPresets}>
        <View style={styles.delayPresetButton}>
          <Button accessibilityLabel="Use short error delay" title="100 ms" onPress={() => setErrorDelayMs('100')} />
        </View>
        <View style={styles.delayPresetButton}>
          <Button accessibilityLabel="Use long error delay" title="2500 ms" onPress={() => setErrorDelayMs('2500')} />
        </View>
      </View>
      <Pressable
        accessibilityLabel="Error click exception"
        testID="error-click-exception"
        style={styles.testButton}
        onPress={ampCapture(throwException, {
          action: 'Press',
          accessibilityLabel: 'Error click exception',
          component: 'Pressable',
          element: 'Exception after press',
          testID: 'error-click-exception',
        })}
      >
        <Text>Exception after press</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Error click rejection"
        testID="error-click-rejection"
        style={styles.testButton}
        onPress={ampCapture(rejectPromise, {
          action: 'Press',
          accessibilityLabel: 'Error click rejection',
          component: 'Pressable',
          element: 'Rejection after press',
          testID: 'error-click-rejection',
        })}
      >
        <Text>Rejection after press</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Error click long press"
        testID="error-click-long-press"
        style={styles.testButton}
        onLongPress={ampCapture(throwException, {
          action: 'LongPress',
          accessibilityLabel: 'Error click long press',
          component: 'Pressable',
          element: 'Exception after long press',
          testID: 'error-click-long-press',
        })}
      >
        <Text>Exception after long press</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Console error only"
        testID="error-click-console"
        style={styles.testButton}
        onPress={ampCapture(writeConsoleError, {
          action: 'Press',
          accessibilityLabel: 'Console error only',
          component: 'Pressable',
          element: 'Console error after press',
          testID: 'error-click-console',
        })}
      >
        <Text>Console error only</Text>
      </Pressable>
    </View>
  );
}

function HomeScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text>Home Screen</Text>
      <Button
        accessibilityLabel="Start Experiment"
        title="Start Experiment"
        onPress={() => void startExperiment()}
      />
      <Button accessibilityLabel="Press me to test Autocapture" title="Press me" onPress={() => console.log('Pressed')} />
      <Button accessibilityLabel="Online test label" title="Online test" onPress={() => console.log('Online test')} />
      <Button accessibilityLabel="Offline test" title="Offline test" onPress={() => console.log('Offline test')} />
      <Button accessibilityLabel="Go to Settings" title="Go to Settings" onPress={() => navigation.navigate('Settings')} />
      <Button
        accessibilityLabel="Fetch Network Test"
        title="Fetch Network Test"
        onPress={() => navigation.navigate('FetchNetworkTest')}
      />
      <Button
        accessibilityLabel="Autocapture Config"
        title="Autocapture Config"
        onPress={() => navigation.navigate('AutocaptureConfig')}
      />
      <Button
        accessibilityLabel="Frustration Interactions"
        title="Frustration Interactions"
        onPress={() => navigation.navigate('FrustrationInteractions')}
      />
      <Button accessibilityLabel="Make Network Request" title="Make Network Request" onPress={() => {
        track('Making Network Request');
        fetch('https://api.amplitude.com/2/asdf', {
          method: 'POST',
          body: JSON.stringify({
            api_key: process.env.AMPLITUDE_API_KEY,
            event: {
              event_type: 'test',
            },
          }),
        });
      }} />
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
  // onStateChange does not fire for the initial route; onReady covers cold-start screen views.
  const navigationRef = useNavigationContainerRef();

  useEffect(() => {
    (async () => {
        await add(experiment).promise;
        await add(autocaptureConfigDebugPlugin).promise;
        // AMPLITUDE_API_KEY is inlined at bundle time (see babel.config.js).
        await init(process.env.AMPLITUDE_API_KEY || 'YOUR_API_KEY', 'React Native Test User', {
          logLevel: Types.LogLevel.Debug,
          autocapture: {
            screenViews: true,
            elementInteractions: true,
            networkTracking: {
              ignoreHosts: ['http://localhost:8081'],
            },
            appLifecycles: true,
            sessions: true,
            frustrationInteractions: true,
          },
          remoteConfig: {
            fetchRemoteConfig: false,
          },
        }).promise;
        track('expo-app/react-native/test-event');
        await identify(new Identify().set('react-native-test', 'yes')).promise;
    })();
  }, []);
  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        trackScreenViewOnNavigationStateChange(navigationRef.getRootState());
      }}
      onStateChange={trackScreenViewOnNavigationStateChange}
    >
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="FetchNetworkTest" component={FetchNetworkTestScreen} options={{title: 'Fetch Network Test'}} />
        <Stack.Screen name="AutocaptureConfig" component={AutocaptureConfigScreen} options={{title: 'Autocapture Config'}} />
        <Stack.Screen
          name="FrustrationInteractions"
          component={FrustrationInteractionsTestView}
          options={{title: 'Frustration Interactions'}}
        />
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
  testButton: {
    backgroundColor: '#e8f0fe',
    borderRadius: 4,
    marginVertical: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  delayControl: {
    alignItems: 'center',
    flexDirection: 'row',
    marginVertical: 12,
  },
  delayInput: {
    borderColor: '#c7d2fe',
    borderRadius: 4,
    borderWidth: 1,
    marginHorizontal: 8,
    minWidth: 88,
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: 'right',
  },
  delayPresetButton: {
    marginHorizontal: 4,
  },
  delayPresets: {
    flexDirection: 'row',
    marginBottom: 8,
  },
});
