/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

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
import Toast from 'react-native-toast-message';
import {
  Identify,
  identify,
  init,
  track,
} from '@amplitude/analytics-react-native';

import {Colors, Header} from 'react-native/Libraries/NewAppScreen';

// Module-scope init mirrors the reproduce pattern from issue #181 — the SDK's
// full module graph loads before any component renders, so any top-level
// crash in the SDK (e.g. CJS circular-dep regression) surfaces on app launch.
init('YOUR_API_KEY');

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
  };

  const showToast = (message: string) => {
    Toast.show({
      type: 'success',
      text1: 'Amplitude Response',
      text2: message,
    });
  };

  const trackEventAndShowToast = (eventName: string) => {
    track(eventName).promise.then(e => {
      showToast(e.message);
    });
  };

  const trackIdentifyAndShowToast = () => {
    identify(new Identify().set('react-native-test', 'yes')).promise.then(e => {
      showToast(e.message);
    });
  };

  return (
    <SafeAreaView style={backgroundStyle}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={backgroundStyle.backgroundColor}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={backgroundStyle}>
        <Header />
        <View style={styles.container}>
          <Text style={styles.title}>Test Amplitude App</Text>
          <Button
            title="Track Event"
            onPress={() => trackEventAndShowToast('test_event')}
          />
          <Button title="Track Identify" onPress={trackIdentifyAndShowToast} />
        </View>
      </ScrollView>
      <Toast />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  title: {
    textAlign: 'center',
    color: 'black',
  },
});

export default App;
