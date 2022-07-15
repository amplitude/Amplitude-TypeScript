import {StyleSheet, Text, View} from 'react-native';
import React, {useEffect} from 'react';
import {
  Identify,
  identify,
  init,
  track,
} from '@amplitude/analytics-react-native';
import {Experiment} from '@amplitude/experiment-react-native-client';
import {LogLevel} from '@amplitude/analytics-types';

export default function App() {
  useEffect(() => {
    (async () => {
      await init('a6dd847b9d2f03c816d4f3f8458cdc1d', 'briang1000', {
        logLevel: LogLevel.Verbose,
      }).promise;
      const experiment = Experiment.initializeWithAmplitudeAnalytics(
        'client-IAxMYws9vVQESrrK88aTcToyqMxiiJoR',
        {
          debug: true,
        },
      );
      await experiment.fetch();
      experiment.variant('react-native');
      track('test');
      await identify(new Identify().set('react-native-test', 'yes')).promise;
      await experiment.fetch();
    })();
  }, []);
  return (
    <View style={styles.container}>
      <Text>Hello World!</Text>
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
