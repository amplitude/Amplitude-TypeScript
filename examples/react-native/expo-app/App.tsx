import {Button, StyleSheet, Text, View} from 'react-native';
import {useEffect} from 'react';
import {
  add,
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
});
