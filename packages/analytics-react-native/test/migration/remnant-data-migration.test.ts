import { NativeModules } from 'react-native';
import { AmplitudeReactNative } from '../../src/react-native-client';
import { MemoryStorage } from '@amplitude/analytics-core';
import { STORAGE_PREFIX } from '@amplitude/analytics-core/src/constants';
import { Event, UserSession } from '@amplitude/analytics-types';
import { getCookieName as getStorageKey } from '@amplitude/analytics-client-common/src';

describe('migration', () => {
  const deviceId = '22833898-c487-4536-b213-40f207abdce0R';
  const userId = 'android-kotlin-sample-user-legacy';
  let sessionId: number | undefined;
  let lastEventTime: number | undefined;

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    NativeModules.AmplitudeReactNative = {
      getApplicationContext: () => {
        return {
          version: '1.0.0',
          platform: 'iOS',
          os: 'react-native-tests',
          language: 'react-native-tests',
          device_brand: 'react-native-tests',
          device_manufacturer: 'react-native-tests',
          device_model: 'react-native-tests',
          carrier: 'react-native-tests',
        };
      },
      ...NativeModules.AmplitudeReactNative,
      getLegacySessionData: () => ({
        deviceId: deviceId,
        userId: userId,
        sessionId,
        lastEventTime: lastEventTime,
        lastEventId: 12345,
      }),
      getLegacyEvents: () => [
        '{"event_id":1,"event_type":"legacy event 1","timestamp":1684219150354,"user_id":"android-kotlin-sample-user-legacy","device_id":"22833898-c487-4536-b213-40f207abdce0R","session_id":1684219150343,"uuid":"d6eff10b-9cd4-45d7-85cb-c81cb6cb8b2e","sequence_number":3,"version_name":"1.0","os_name":"android","os_version":"13","api_level":33,"device_brand":"google","device_manufacturer":"Google","device_model":"sdk_gphone64_x86_64","carrier":"T-Mobile","country":"US","language":"en","platform":"Android","library":{"name":"amplitude-android","version":"2.39.3-SNAPSHOT"},"api_properties":{"androidADID":"63e67f64-ba80-4683-90e2-6d5d78801df9","android_app_set_id":"31ac0887-8b0d-e858-3d66-2e36f043a3ce","limit_ad_tracking":false,"gps_enabled":true,"ios_idfa":"idfa-1"},"event_properties":{"test1":"value1","test2":"value2"},"user_properties":{},"groups":{},"group_properties":{}}',
        '{"event_id":2,"event_type":"legacy event 2","timestamp":1684219150355,"user_id":"android-kotlin-sample-user-legacy","device_id":"22833898-c487-4536-b213-40f207abdce0R","session_id":1684219150343,"uuid":"7b4c5c13-6fdc-4931-9ba1-e4efdf346ee0","sequence_number":4,"version_name":"1.0","os_name":"android","os_version":"13","api_level":33,"device_brand":"google","device_manufacturer":"Google","device_model":"sdk_gphone64_x86_64","carrier":"T-Mobile","country":"US","language":"en","platform":"Android","library":{"name":"amplitude-android","version":"2.39.3-SNAPSHOT"},"api_properties":{"androidADID":"63e67f64-ba80-4683-90e2-6d5d78801df9","android_app_set_id":"31ac0887-8b0d-e858-3d66-2e36f043a3ce","limit_ad_tracking":false,"gps_enabled":true,"ios_idfv":"idfv-1"},"event_properties":{"data1":"value1","data2":"value2"},"user_properties":{},"groups":{},"group_properties":{}}',
      ],
      getLegacyIdentifies: () => [
        '{"event_id":2,"event_type":"$identify","timestamp":1684219150343,"user_id":"android-kotlin-sample-user-legacy","device_id":"22833898-c487-4536-b213-40f207abdce0R","session_id":1684219150343,"uuid":"be09ecba-83f7-444a-aba0-fe1f529a3716","sequence_number":1,"version_name":"1.0","os_name":"android","os_version":"13","api_level":33,"device_brand":"google","device_manufacturer":"Google","device_model":"sdk_gphone64_x86_64","carrier":"T-Mobile","country":"US","language":"en","platform":"Android","library":{"name":"amplitude-android","version":"2.39.3-SNAPSHOT"},"api_properties":{"androidADID":"63e67f64-ba80-4683-90e2-6d5d78801df9","android_app_set_id":"31ac0887-8b0d-e858-3d66-2e36f043a3ce","limit_ad_tracking":false,"gps_enabled":true},"event_properties":{},"user_properties":{"$add":{"ident1":"value1","ident2":"value2"}},"groups":{},"group_properties":{}}',
        '{"event_id":3,"event_type":"$identify","timestamp":1684219150344,"user_id":"android-kotlin-sample-user-legacy","device_id":"22833898-c487-4536-b213-40f207abdce0R","session_id":1684219150343,"uuid":"0894387e-e923-423b-9feb-086ba8cb2cfa","sequence_number":2,"version_name":"1.0","os_name":"android","os_version":"13","api_level":33,"device_brand":"google","device_manufacturer":"Google","device_model":"sdk_gphone64_x86_64","carrier":"T-Mobile","country":"US","language":"en","platform":"Android","library":{"name":"amplitude-android","version":"2.39.3-SNAPSHOT"},"api_properties":{"androidADID":"63e67f64-ba80-4683-90e2-6d5d78801df9","android_app_set_id":"31ac0887-8b0d-e858-3d66-2e36f043a3ce","limit_ad_tracking":false,"gps_enabled":true},"event_properties":{},"user_properties":{"$setOnce":{"once1":"value1"}},"groups":{},"group_properties":{}}',
      ],
      getLegacyInterceptedIdentifies: () => [
        '{"event_id":1,"event_type":"$identify","timestamp":1684219150358,"user_id":"android-kotlin-sample-user-legacy","device_id":"22833898-c487-4536-b213-40f207abdce0R","session_id":1684219150343,"uuid":"1a14d057-8a12-40bb-8217-2d62dd08a525","sequence_number":5,"version_name":"1.0","os_name":"android","os_version":"13","api_level":33,"device_brand":"google","device_manufacturer":"Google","device_model":"sdk_gphone64_x86_64","carrier":"T-Mobile","country":"US","language":"en","platform":"Android","library":{"name":"amplitude-android","version":"2.39.3-SNAPSHOT"},"api_properties":{"androidADID":"63e67f64-ba80-4683-90e2-6d5d78801df9","android_app_set_id":"31ac0887-8b0d-e858-3d66-2e36f043a3ce","limit_ad_tracking":false,"gps_enabled":true},"event_properties":{},"user_properties":{"$set":{"user1":"value1","user2":"value2"}},"groups":{},"group_properties":{}}',
        '{"event_id":2,"event_type":"$identify","timestamp":1684219150359,"user_id":"android-kotlin-sample-user-legacy","device_id":"22833898-c487-4536-b213-40f207abdce0R","session_id":1684219150343,"uuid":"b115a299-4cc6-495b-8e4e-c2ce6f244be9","sequence_number":6,"version_name":"1.0","os_name":"android","os_version":"13","api_level":33,"device_brand":"google","device_manufacturer":"Google","device_model":"sdk_gphone64_x86_64","carrier":"T-Mobile","country":"US","language":"en","platform":"Android","library":{"name":"amplitude-android","version":"2.39.3-SNAPSHOT"},"api_properties":{"androidADID":"63e67f64-ba80-4683-90e2-6d5d78801df9","android_app_set_id":"31ac0887-8b0d-e858-3d66-2e36f043a3ce","limit_ad_tracking":false,"gps_enabled":true},"event_properties":{},"user_properties":{"$set":{"user1":"value1","user4":"value2"}},"groups":{},"group_properties":{}}',
      ],
    };
  });

  beforeEach(() => {
    sessionId = Date.now() - 3000;
    lastEventTime = Date.now() - 1000;
  });

  test('should migrate legacy data', async () => {
    const client = new AmplitudeReactNative();
    const storageProvider = new MemoryStorage<Event[]>();
    await client.init('TEST_API_KEY', undefined, {
      disableCookies: true,
      cookieStorage: new MemoryStorage(),
      storageProvider,
    }).promise;
    expect(client.getDeviceId()).toEqual(deviceId);
    expect(client.getUserId()).toEqual(userId);
    expect(client.getSessionId()).toEqual(sessionId);
    expect(client.config.lastEventTime).toBeGreaterThanOrEqual(lastEventTime ?? 0);
    expect(client.config.lastEventId).toEqual(12345);

    const eventsKey = `${STORAGE_PREFIX}_${client.config.apiKey.substring(0, 10)}`;
    const events = await storageProvider.get(eventsKey);
    expect(events?.length).toEqual(6);
    const event1 = events?.[0];
    expect(event1?.event_type).toEqual('$identify');
    expect(event1?.time).toEqual(1684219150358);
    expect(event1?.insert_id).toEqual('1a14d057-8a12-40bb-8217-2d62dd08a525');
    expect(event1?.library).toEqual('amplitude-android/2.39.3-SNAPSHOT');
    expect(event1?.device_id).toEqual(deviceId);
    expect(event1?.user_id).toEqual(userId);
    const event2 = events?.[1];
    expect(event2?.event_type).toEqual('$identify');
    expect(event2?.time).toEqual(1684219150359);
    expect(event2?.insert_id).toEqual('b115a299-4cc6-495b-8e4e-c2ce6f244be9');
    expect(event2?.library).toEqual('amplitude-android/2.39.3-SNAPSHOT');
    expect(event2?.device_id).toEqual(deviceId);
    expect(event2?.user_id).toEqual(userId);
    const event3 = events?.[2];
    expect(event3?.event_type).toEqual('$identify');
    expect(event3?.time).toEqual(1684219150343);
    expect(event3?.insert_id).toEqual('be09ecba-83f7-444a-aba0-fe1f529a3716');
    expect(event3?.library).toEqual('amplitude-android/2.39.3-SNAPSHOT');
    expect(event3?.device_id).toEqual(deviceId);
    expect(event3?.user_id).toEqual(userId);
    const event4 = events?.[3];
    expect(event4?.event_type).toEqual('$identify');
    expect(event4?.time).toEqual(1684219150344);
    expect(event4?.insert_id).toEqual('0894387e-e923-423b-9feb-086ba8cb2cfa');
    expect(event4?.library).toEqual('amplitude-android/2.39.3-SNAPSHOT');
    expect(event4?.device_id).toEqual(deviceId);
    expect(event4?.user_id).toEqual(userId);
    const event5 = events?.[4];
    expect(event5?.event_type).toEqual('legacy event 1');
    expect(event5?.time).toEqual(1684219150354);
    expect(event5?.insert_id).toEqual('d6eff10b-9cd4-45d7-85cb-c81cb6cb8b2e');
    expect(event5?.library).toEqual('amplitude-android/2.39.3-SNAPSHOT');
    expect(event5?.device_id).toEqual(deviceId);
    expect(event5?.user_id).toEqual(userId);
    const event6 = events?.[5];
    expect(event6?.event_type).toEqual('legacy event 2');
    expect(event6?.time).toEqual(1684219150355);
    expect(event6?.insert_id).toEqual('7b4c5c13-6fdc-4931-9ba1-e4efdf346ee0');
    expect(event6?.library).toEqual('amplitude-android/2.39.3-SNAPSHOT');
    expect(event6?.device_id).toEqual(deviceId);
    expect(event6?.user_id).toEqual(userId);
  });

  test('should not migrate legacy identifies if not first run since upgrade', async () => {
    const apiKey = 'TEST_API_KEY';
    const client = new AmplitudeReactNative();
    const storageProvider = new MemoryStorage<Event[]>();
    const cookieStorage = new MemoryStorage<UserSession>();
    await cookieStorage.set(getStorageKey(apiKey), {
      deviceId: 'custom-device-id',
      lastEventId: 1000,
      lastEventTime: Date.now(),
      optOut: false,
    });

    await client.init(apiKey, undefined, {
      disableCookies: true,
      cookieStorage,
      storageProvider,
    }).promise;
    expect(client.getDeviceId()).toEqual('custom-device-id');
    expect(client.getUserId()).toEqual(userId);
    expect(client.getSessionId()).toEqual(sessionId);
    expect(client.config.lastEventTime).toBeGreaterThanOrEqual(lastEventTime ?? 0);
    expect(client.config.lastEventId).toEqual(1000);

    const eventsKey = `${STORAGE_PREFIX}_${client.config.apiKey.substring(0, 10)}`;
    const events = await storageProvider.get(eventsKey);
    expect(events?.length).toEqual(2);
    const event1 = events?.[0];
    expect(event1?.event_type).toEqual('legacy event 1');
    expect(event1?.time).toEqual(1684219150354);
    expect(event1?.insert_id).toEqual('d6eff10b-9cd4-45d7-85cb-c81cb6cb8b2e');
    expect(event1?.library).toEqual('amplitude-android/2.39.3-SNAPSHOT');
    expect(event1?.device_id).toEqual(deviceId);
    expect(event1?.user_id).toEqual(userId);
    const event2 = events?.[1];
    expect(event2?.event_type).toEqual('legacy event 2');
    expect(event2?.time).toEqual(1684219150355);
    expect(event2?.insert_id).toEqual('7b4c5c13-6fdc-4931-9ba1-e4efdf346ee0');
    expect(event2?.library).toEqual('amplitude-android/2.39.3-SNAPSHOT');
    expect(event2?.device_id).toEqual(deviceId);
    expect(event2?.user_id).toEqual(userId);
  });

  test('should not migrate legacy data if migrateLegacyData is false', async () => {
    const client = new AmplitudeReactNative();
    const storageProvider = new MemoryStorage<Event[]>();
    await client.init('TEST_API_KEY', undefined, {
      disableCookies: true,
      cookieStorage: new MemoryStorage(),
      storageProvider: storageProvider,
      migrateLegacyData: false,
    }).promise;
    expect(client.getDeviceId()).not.toEqual(deviceId);
    expect(client.getUserId()).not.toEqual(userId);
    expect(client.getSessionId()).not.toEqual(sessionId);
    expect(client.config.lastEventId).not.toEqual(12345);

    const eventsKey = `${STORAGE_PREFIX}_${client.config.apiKey.substring(0, 10)}`;
    const events = await storageProvider.get(eventsKey);
    expect(events?.length).toEqual(0);
  });
});
