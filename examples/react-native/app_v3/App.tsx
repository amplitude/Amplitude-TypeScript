/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React from 'react';
import type {PropsWithChildren} from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  Button
} from 'react-native';
import Toast from 'react-native-toast-message';
import {
  Identify,
  identify,
  init,
  track,
} from '@amplitude/analytics-react-native';
import {LogLevel} from '@amplitude/analytics-types';

import {
  Colors,
  DebugInstructions,
  Header,
  LearnMoreLinks,
  ReloadInstructions,
} from 'react-native/Libraries/NewAppScreen';

type SectionProps = PropsWithChildren<{
  title: string;
}>;

init('API_KEY', 'example_user_id', {
    logLevel: LogLevel.Verbose,
});

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter
  };

  const showToast = (message: string) => {
    Toast.show({
      type: 'success',
      text1: 'Amplitude Response',
      text2: message
    });
  }

  const trackEventAndShowToast = (eventName: string) => {
    track(eventName).promise.then((e) => {
      showToast(e.message);
    })
  }


  const trackIdentifyAndShowToast = (eventName: string) => {
    identify(new Identify().set('react-native-test', 'yes')).promise.then((e) => {
      showToast(e.message);
    })
  }
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
        <View style={{gap: 10}}>
          <Text style={{textAlign: 'center', color: 'black'}}>Test Amplitude App</Text>
          <Button title="Track Event" onPress={() => trackEventAndShowToast('test_event')}></Button>
          <Button title="Track Identify" onPress={() => trackIdentifyAndShowToast('test_event')}></Button>
        </View>
      </ScrollView>
      <Toast></Toast>
      
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
    gap: 10
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
  },
  highlight: {
    fontWeight: '700',
  },
});

export default App;
