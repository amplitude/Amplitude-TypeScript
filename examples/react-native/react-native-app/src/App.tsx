import * as React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { init, track } from '@amplitude/analytics-react-native';

export default function App() {
  React.useEffect(() => {
    (async () => {
      try {
        await init('API_KEY').promise;
        await track('test event').promise;
      } catch (e) {
        console.error('error: ', e);
      }
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
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  box: {
    width: 60,
    height: 60,
    marginVertical: 20,
  },
  text: {
    marginVertical: 20,
  },
});
