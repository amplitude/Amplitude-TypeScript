import * as React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { init, track } from '@amplitude/analytics-react-native';

export default function App() {
  React.useEffect(() => {
    (async () => {
      init('a6dd847b9d2f03c816d4f3f8458cdc1d', 'brian');
      track('test event baby');
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
