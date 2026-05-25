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
  Types,
} from '@amplitude/analytics-react-native';

import {Colors, Header} from 'react-native/Libraries/NewAppScreen';

// Regression guard for SDKRN-8: this example app deliberately exercises the
// SDK's "opt out of AsyncStorage" path. AsyncStorage is excluded from native
// autolinking (see react-native.config.js) and the SDK's two storage slots
// are overridden with the in-memory implementation below. The SDK's lazy
// require of @react-native-async-storage/async-storage must not crash at
// module-load, and track/identify must keep working with persistence in
// memory only.
class InMemoryStorage<T> implements Types.Storage<T> {
  private store = new Map<string, T>();

  async isEnabled(): Promise<boolean> {
    return true;
  }

  async get(key: string): Promise<T | undefined> {
    return this.store.get(key);
  }

  async getRaw(key: string): Promise<string | undefined> {
    const value = this.store.get(key);
    return value === undefined ? undefined : JSON.stringify(value);
  }

  async set(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }

  async reset(): Promise<void> {
    this.store.clear();
  }
}

// Module-scope init mirrors the reproduce pattern from issue #181 — the SDK's
// full module graph loads before any component renders, so any top-level
// crash in the SDK (e.g. CJS circular-dep regression, or the static
// AsyncStorage import from before SDKRN-8) surfaces on app launch.
//
// Note: init's signature is (apiKey, userId, options). Pass `undefined` for
// userId so the storage overrides land in the options slot — otherwise they
// silently get bound to userId and the SDK falls back to the default storage
// chain (which then tries to use AsyncStorage and throws at runtime).
init('YOUR_API_KEY', undefined, {
  storageProvider: new InMemoryStorage(),
  cookieStorage: new InMemoryStorage(),
});

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
