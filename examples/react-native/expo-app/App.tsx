import {Button, StyleSheet, Text, View, Pressable} from 'react-native';
import {useEffect} from 'react';
import {identify, Identify, init, track, add, Types} from '@amplitude/analytics-react-native';
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import FetchNetworkTestScreen from './FetchNetworkTestScreen';


const Stack = createNativeStackNavigator();

function AmplitudeWrapper({ children, ...props }: { children: React.ReactNode, props: any }) {
  return (
    <View onTouchEnd={(e) => {
      const target = e._targetInst;
      const title = target.memoizedProps?.title || target.memoizedProps?.children;
      const event = {
        event_type: '[Amplitude] Touch',
        event_properties: {
          type: target.elementType,
          title,
        },
      }
      console.log('!!!Event', event);
      track(event);

    }} {...props}>
      {children}
    </View>
  );
}

function HomeScreen({ navigation }) {
  return (
    <AmplitudeWrapper style={styles.container}>
      <Text>Home Screen</Text>
      <Button accessibilityLabel="Online test label" title="Online test" onPress={() => track('RN Expo Online Test')} />
      <Button accessibilityLabel="Offline test" title="Offline test" onPress={() => track('RN Expo Offline Test')} />
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
      <Pressable>
        <Text>Pressable</Text>
      </Pressable>
    </AmplitudeWrapper>
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
  useEffect(() => {
    (async () => {
        // AMPLITUDE_API_KEY is inlined at bundle time (see babel.config.js).
        await init(process.env.AMPLITUDE_API_KEY || 'YOUR_API_KEY', 'react-native-user-id', {
          logLevel: Types.LogLevel.Error,
          // autocapture: { } // <-- todo
        }).promise;
        track('expo-app/react-native/test-event');
        await identify(new Identify().set('react-native-test', 'yes')).promise;
    })();
  }, []);
  return (
    <NavigationContainer>
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
