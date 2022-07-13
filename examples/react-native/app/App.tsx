import {StyleSheet, Text, View} from 'react-native';
import React, {useEffect} from 'react';
import {init, track} from '@amplitude/analytics-react-native';

export default function App() {
  useEffect(() => {
    (async () => {
      await init('a6dd847b9d2f03c816d4f3f8458cdc1d', 'briang777').promise;
      await track('test').promise;
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
