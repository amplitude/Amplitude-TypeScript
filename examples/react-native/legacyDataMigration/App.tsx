import React from 'react';
import {Alert, NativeModules} from 'react-native';
import {Button, SafeAreaView, StyleSheet} from 'react-native';
import {createInstance} from '@amplitude/analytics-react-native';
import {getCookieName} from '@amplitude/analytics-client-common';
import {UUID, MemoryStorage, STORAGE_PREFIX} from '@amplitude/analytics-core';
import {Event, UserSession} from '@amplitude/analytics-types';
import MigrationChecker from './MigrationChecker';

interface MigrationModule {
  prepareLegacyDatabase(
    instanceName: string | undefined,
    version: string,
  ): void;
}

const migrationModule = NativeModules.MigrationModule as MigrationModule;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
});

function App(): JSX.Element {
  return (
    <SafeAreaView style={styles.container}>
      <Button
        title="Migrate Legacy V4"
        onPress={() => migrateLegacyData('v4')}
      />
      <Button
        title="Migrate Legacy V3"
        onPress={() => migrateLegacyData('v3')}
      />
      <Button
        title="Migrate Legacy Missing"
        onPress={() => migrateLegacyData('vMissing')}
      />
    </SafeAreaView>
  );
}

async function migrateLegacyData(version: 'v4' | 'v3' | 'vMissing') {
  let instanceName = UUID();
  let apiKey = UUID();
  let cookieName = getCookieName(apiKey);
  let eventsKey = `${STORAGE_PREFIX}_${apiKey.substring(0, 10)}`;
  migrationModule.prepareLegacyDatabase(instanceName, version);

  const cookieStorage1 = new MemoryStorage<UserSession>();
  const storageProvider1 = new MemoryStorage<Event[]>();
  const amplitude1 = createInstance();
  await amplitude1.init(apiKey, undefined, {
    instanceName,
    cookieStorage: cookieStorage1,
    storageProvider: storageProvider1,
    optOut: true,
    trackingSessionEvents: false,
  }).promise;

  let checker1 = new MigrationChecker(version);
  let userSession1 = await cookieStorage1.get(cookieName);
  const events1 = await storageProvider1.get(eventsKey);
  checker1.checkUserSession(userSession1);
  checker1.checkEvents(events1);

  const cookieStorage2 = new MemoryStorage<UserSession>();
  const storageProvider2 = new MemoryStorage<Event[]>();
  const amplitude2 = createInstance();
  await amplitude2.init(apiKey, undefined, {
    instanceName,
    cookieStorage: cookieStorage2,
    storageProvider: storageProvider2,
    optOut: true,
    trackingSessionEvents: false,
  }).promise;

  let checker2 = new MigrationChecker(version);
  let userSession2 = await cookieStorage2.get(cookieName);
  const events2 = await storageProvider2.get(eventsKey);
  checker2.checkUserSession(userSession2);
  checker2.check(events2?.length === 0, 'events');

  Alert.alert(`\
First migration: ${
    checker1.errors.length === 0 ? 'Success' : checker1.errors.join(', ')
  }
Second migration: ${
    checker2.errors.length === 0 ? 'Success' : checker2.errors.join(', ')
  }
`);
}

export default App;
