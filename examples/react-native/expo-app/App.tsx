import {Button, StyleSheet, Text, View} from 'react-native';
import {useEffect} from 'react';
import {identify, Identify, init, track, add, Types, appLifecyclePlugin} from '@amplitude/analytics-react-native';
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

const Stack = createNativeStackNavigator();

function HomeScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text>Home Screen</Text>
      <Button title="Go to Settings" onPress={() => navigation.navigate('Settings')} />
    </View>
  );
}

function SettingsScreen({ navigation }) {
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
        await init(process.env.AMPLITUDE_API_KEY || 'YOUR_API_KEY', 'React Native Autocapture', {
          logLevel: Types.LogLevel.Error,
        }).promise;
        add(appLifecyclePlugin());
        track('expo-app/react-native/test-event');
        await identify(new Identify().set('react-native-test', 'yes')).promise;
    })();
  }, []);
  return (
    <NavigationContainer
      onStateChange={(state) => {
        console.log('state changed', state);
      }}
    >
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
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
