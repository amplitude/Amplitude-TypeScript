import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { useEffect } from 'react';
import { init, track } from '@amplitude/analytics-react-native';
import { Platform, NativeModules } from 'react-native';

export default function App() {
  useEffect(() => {
    (async () => {
        console.info(Platform);
        console.info(NativeModules.AmplitudeReactNative);
        await init('a6dd847b9d2f03c816d4f3f8458cdc1d', 'briang666').promise;
        await track('test').promise;
    })();
  }, []);
  return (
    <View style={styles.container}>
      <Text>Open up App.tsx to start working on your app!</Text>
      <StatusBar style="auto" />
    </View>
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
