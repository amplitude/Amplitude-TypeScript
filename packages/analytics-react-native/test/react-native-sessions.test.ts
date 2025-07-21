import { AmplitudeReactNative } from '../src/react-native-client';
import * as core from '@amplitude/analytics-core';
import { Status, UserSession, Event } from '@amplitude/analytics-core';
import { isWeb } from '../src/utils/platform';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('react-native-session', () => {
  const API_KEY = 'API_KEY';
  const attributionConfig = {
    attribution: {
      disabled: true,
    },
  };

  afterEach(async () => {
    // clean up cookies
    // due to jest env, cookies are always preset and needs to be cleaned up
    document.cookie = 'AMP_API_KEY=null; expires=-1';
    if (!isWeb()) {
      await AsyncStorage.clear();
    }
  });

  class AmplitudeReactNativeTest extends AmplitudeReactNative {
    currentTime: number;

    constructor(currentTime: number) {
      super();
      this.currentTime = currentTime;
    }

    currentTimeMillis(): number {
      return this.currentTime;
    }

    setForeground(timestamp: number) {
      this.currentTime = timestamp;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.handleAppStateChange('active');
    }

    setBackground(timestamp: number) {
      this.currentTime = timestamp;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.handleAppStateChange('background');
    }
  }

  const sendResponse = {
    status: Status.Success,
    statusCode: 200,
    body: {
      eventsIngested: 1,
      payloadSizeBytes: 1,
      serverUploadTime: 1,
    },
  };

  const clientOptions = (
    send: any,
    cookieStorage: core.MemoryStorage<UserSession>,
    trackingSessionEvents: boolean,
    sessionId?: number,
  ) => ({
    transportProvider: {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      send,
    },
    cookieStorage,
    sessionTimeout: 100,
    sessionId,
    trackingSessionEvents,
    ...attributionConfig,
  });

  const createEvent = (time: number, eventType: string, sessionId?: number): Event => {
    return {
      event_type: eventType,
      time: time,
      session_id: sessionId,
      user_id: 'user',
    };
  };

  test('close background events should not start new session', async () => {
    const send = jest.fn().mockReturnValue(sendResponse);
    const cookieStorage = new core.MemoryStorage<UserSession>();

    const client = new AmplitudeReactNativeTest(950);
    await client.init(API_KEY, undefined, clientOptions(send, cookieStorage, true)).promise;

    client.track(createEvent(1000, 'event-1'));
    client.track(createEvent(1050, 'event-2'));
    await client.flush().promise;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const events = send.mock.calls.flatMap((call) => call[1].events as Event[]);
    expect(events.length).toEqual(3);

    expect(events[0].event_type).toEqual('session_start');
    expect(events[0].session_id).toEqual(950);
    expect(events[0].time).toEqual(950);

    expect(events[1].event_type).toEqual('event-1');
    expect(events[1].session_id).toEqual(950);
    expect(events[1].time).toEqual(1000);

    expect(events[2].event_type).toEqual('event-2');
    expect(events[2].session_id).toEqual(950);
    expect(events[2].time).toEqual(1050);
  });

  test('distant background events should start new session', async () => {
    const send = jest.fn().mockReturnValue(sendResponse);
    const cookieStorage = new core.MemoryStorage<UserSession>();

    const client = new AmplitudeReactNativeTest(950);
    await client.init(API_KEY, undefined, clientOptions(send, cookieStorage, true)).promise;

    client.track(createEvent(1000, 'event-1'));
    client.track(createEvent(2000, 'event-2'));
    await client.flush().promise;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const events = send.mock.calls.flatMap((call) => call[1].events as Event[]);
    expect(events.length).toEqual(5);

    expect(events[0].event_type).toEqual('session_start');
    expect(events[0].session_id).toEqual(950);
    expect(events[0].time).toEqual(950);

    expect(events[1].event_type).toEqual('event-1');
    expect(events[1].session_id).toEqual(950);
    expect(events[1].time).toEqual(1000);

    expect(events[2].event_type).toEqual('session_end');
    expect(events[2].session_id).toEqual(950);
    expect(events[2].time).toEqual(1001);

    expect(events[3].event_type).toEqual('session_start');
    expect(events[3].session_id).toEqual(2000);
    expect(events[3].time).toEqual(2000);

    expect(events[4].event_type).toEqual('event-2');
    expect(events[4].session_id).toEqual(2000);
    expect(events[4].time).toEqual(2000);
  });

  test('foreground events should not start new session', async () => {
    const send = jest.fn().mockReturnValue(sendResponse);
    const cookieStorage = new core.MemoryStorage<UserSession>();

    const client = new AmplitudeReactNativeTest(950);
    await client.init(API_KEY, undefined, clientOptions(send, cookieStorage, true)).promise;

    client.setForeground(1000);
    client.track(createEvent(1050, 'event-1'));
    client.track(createEvent(2000, 'event-2'));
    await client.flush().promise;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const events = send.mock.calls.flatMap((call) => call[1].events as Event[]);
    expect(events.length).toEqual(3);

    expect(events[0].event_type).toEqual('session_start');
    expect(events[0].session_id).toEqual(950);
    expect(events[0].time).toEqual(950);

    expect(events[1].event_type).toEqual('event-1');
    expect(events[1].session_id).toEqual(950);
    expect(events[1].time).toEqual(1050);

    expect(events[2].event_type).toEqual('event-2');
    expect(events[2].session_id).toEqual(950);
    expect(events[2].time).toEqual(2000);
  });

  test('close background and foreground events should not start new session', async () => {
    const send = jest.fn().mockReturnValue(sendResponse);
    const cookieStorage = new core.MemoryStorage<UserSession>();

    const client = new AmplitudeReactNativeTest(950);
    await client.init(API_KEY, undefined, clientOptions(send, cookieStorage, true)).promise;

    client.track(createEvent(1000, 'event-1'));
    client.setForeground(1050);
    client.track(createEvent(2000, 'event-2'));
    await client.flush().promise;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const events = send.mock.calls.flatMap((call) => call[1].events as Event[]);
    expect(events.length).toEqual(3);

    expect(events[0].event_type).toEqual('session_start');
    expect(events[0].session_id).toEqual(950);
    expect(events[0].time).toEqual(950);

    expect(events[1].event_type).toEqual('event-1');
    expect(events[1].session_id).toEqual(950);
    expect(events[1].time).toEqual(1000);

    expect(events[2].event_type).toEqual('event-2');
    expect(events[2].session_id).toEqual(950);
    expect(events[2].time).toEqual(2000);
  });

  test('distant background and foreground events should start new session', async () => {
    const send = jest.fn().mockReturnValue(sendResponse);
    const cookieStorage = new core.MemoryStorage<UserSession>();

    const client = new AmplitudeReactNativeTest(950);
    await client.init(API_KEY, undefined, clientOptions(send, cookieStorage, true)).promise;

    client.track(createEvent(1000, 'event-1'));
    client.setForeground(2000);
    client.track(createEvent(3000, 'event-2'));
    await client.flush().promise;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const events = send.mock.calls.flatMap((call) => call[1].events as Event[]);
    expect(events.length).toEqual(5);

    expect(events[0].event_type).toEqual('session_start');
    expect(events[0].session_id).toEqual(950);
    expect(events[0].time).toEqual(950);

    expect(events[1].event_type).toEqual('event-1');
    expect(events[1].session_id).toEqual(950);
    expect(events[1].time).toEqual(1000);

    expect(events[2].event_type).toEqual('session_end');
    expect(events[2].session_id).toEqual(950);
    expect(events[2].time).toEqual(1001);

    expect(events[3].event_type).toEqual('session_start');
    expect(events[3].session_id).toEqual(2000);
    expect(events[3].time).toEqual(2000);

    expect(events[4].event_type).toEqual('event-2');
    expect(events[4].session_id).toEqual(2000);
    expect(events[4].time).toEqual(3000);
  });

  test('close foreground and background events should not start new session', async () => {
    const send = jest.fn().mockReturnValue(sendResponse);
    const cookieStorage = new core.MemoryStorage<UserSession>();

    const client = new AmplitudeReactNativeTest(950);
    await client.init(API_KEY, undefined, clientOptions(send, cookieStorage, true)).promise;

    client.setForeground(1000);
    client.track(createEvent(1500, 'event-1'));
    client.setBackground(2000);
    client.track(createEvent(2050, 'event-2'));
    await client.flush().promise;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const events = send.mock.calls.flatMap((call) => call[1].events as Event[]);
    expect(events.length).toEqual(3);

    expect(events[0].event_type).toEqual('session_start');
    expect(events[0].session_id).toEqual(950);
    expect(events[0].time).toEqual(950);

    expect(events[1].event_type).toEqual('event-1');
    expect(events[1].session_id).toEqual(950);
    expect(events[1].time).toEqual(1500);

    expect(events[2].event_type).toEqual('event-2');
    expect(events[2].session_id).toEqual(950);
    expect(events[2].time).toEqual(2050);
  });

  test('distant foreground and background events should start new session', async () => {
    const send = jest.fn().mockReturnValue(sendResponse);
    const cookieStorage = new core.MemoryStorage<UserSession>();

    const client = new AmplitudeReactNativeTest(950);
    await client.init(API_KEY, undefined, clientOptions(send, cookieStorage, true)).promise;

    client.setForeground(1000);
    client.track(createEvent(1500, 'event-1'));
    client.setBackground(2000);
    client.track(createEvent(3000, 'event-2'));
    await client.flush().promise;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const events = send.mock.calls.flatMap((call) => call[1].events as Event[]);
    expect(events.length).toEqual(5);

    expect(events[0].event_type).toEqual('session_start');
    expect(events[0].session_id).toEqual(950);
    expect(events[0].time).toEqual(950);

    expect(events[1].event_type).toEqual('event-1');
    expect(events[1].session_id).toEqual(950);
    expect(events[1].time).toEqual(1500);

    expect(events[2].event_type).toEqual('session_end');
    expect(events[2].session_id).toEqual(950);
    expect(events[2].time).toEqual(2001);

    expect(events[3].event_type).toEqual('session_start');
    expect(events[3].session_id).toEqual(3000);
    expect(events[3].time).toEqual(3000);

    expect(events[4].event_type).toEqual('event-2');
    expect(events[4].session_id).toEqual(3000);
    expect(events[4].time).toEqual(3000);
  });

  test('session data should be persisted', async () => {
    const send = jest.fn().mockReturnValue(sendResponse);
    const cookieStorage = new core.MemoryStorage<UserSession>();

    const client1 = new AmplitudeReactNativeTest(950);
    await client1.init(API_KEY, undefined, clientOptions(send, cookieStorage, true)).promise;

    client1.setForeground(1000);

    expect(client1.getSessionId()).toEqual(950);
    expect(client1.config.sessionId).toEqual(950);
    expect(client1.config.lastEventTime).toEqual(1000);
    expect(client1.config.lastEventId).toEqual(1);

    client1.track(createEvent(1200, 'event-1'));

    expect(client1.getSessionId()).toEqual(950);
    expect(client1.config.sessionId).toEqual(950);
    expect(client1.config.lastEventTime).toEqual(1200);
    expect(client1.config.lastEventId).toEqual(2);

    const client2 = new AmplitudeReactNativeTest(1250);
    await client2.init(API_KEY, undefined, clientOptions(send, cookieStorage, true)).promise;

    expect(client2.getSessionId()).toEqual(950);
    expect(client2.config.sessionId).toEqual(950);
    expect(client2.config.lastEventTime).toEqual(1250);
    expect(client1.config.lastEventId).toEqual(2);
  });

  test('explicit session for event should be preserved and do not update config.lastEventTime', async () => {
    const send = jest.fn().mockReturnValue(sendResponse);
    const cookieStorage = new core.MemoryStorage<UserSession>();

    const client = new AmplitudeReactNativeTest(950);
    await client.init(API_KEY, undefined, clientOptions(send, cookieStorage, true)).promise;

    expect(client.config.lastEventTime).toEqual(950);
    client.track(createEvent(1000, 'event-1'));
    expect(client.config.lastEventTime).toEqual(1000);
    client.track(createEvent(1050, 'event-2', 3000));
    expect(client.config.lastEventTime).toEqual(1000);
    client.track(createEvent(1100, 'event-3'));
    expect(client.config.lastEventTime).toEqual(1100);
    await client.flush().promise;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const events = send.mock.calls.flatMap((call) => call[1].events as Event[]);
    expect(events.length).toEqual(6);

    expect(events[0].event_type).toEqual('session_start');
    expect(events[0].session_id).toEqual(950);
    expect(events[0].time).toEqual(950);

    expect(events[1].event_type).toEqual('event-1');
    expect(events[1].session_id).toEqual(950);
    expect(events[1].time).toEqual(1000);

    expect(events[2].event_type).toEqual('event-2');
    expect(events[2].session_id).toEqual(3000);
    expect(events[2].time).toEqual(1050);

    expect(events[3].event_type).toEqual('session_end');
    expect(events[3].session_id).toEqual(950);
    expect(events[3].time).toEqual(1001);

    expect(events[4].event_type).toEqual('session_start');
    expect(events[4].session_id).toEqual(1100);
    expect(events[4].time).toEqual(1100);

    expect(events[5].event_type).toEqual('event-3');
    expect(events[5].session_id).toEqual(1100);
    expect(events[5].time).toEqual(1100);
  });

  test('explicit no session for event should be preserved and do not update config.lastEventTime', async () => {
    const send = jest.fn().mockReturnValue(sendResponse);
    const cookieStorage = new core.MemoryStorage<UserSession>();

    const client = new AmplitudeReactNativeTest(950);
    await client.init(API_KEY, undefined, clientOptions(send, cookieStorage, true)).promise;

    expect(client.config.lastEventTime).toEqual(950);
    client.track(createEvent(1000, 'event-1'));
    expect(client.config.lastEventTime).toEqual(1000);
    client.track(createEvent(1050, 'event-2', -1));
    expect(client.config.lastEventTime).toEqual(1000);
    client.track(createEvent(1100, 'event-3'));
    expect(client.config.lastEventTime).toEqual(1100);
    await client.flush().promise;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const events = send.mock.calls.flatMap((call) => call[1].events as Event[]);
    expect(events.length).toEqual(6);

    expect(events[0].event_type).toEqual('session_start');
    expect(events[0].session_id).toEqual(950);
    expect(events[0].time).toEqual(950);

    expect(events[1].event_type).toEqual('event-1');
    expect(events[1].session_id).toEqual(950);
    expect(events[1].time).toEqual(1000);

    expect(events[2].event_type).toEqual('event-2');
    expect(events[2].session_id).toEqual(-1);
    expect(events[2].time).toEqual(1050);

    expect(events[3].event_type).toEqual('session_end');
    expect(events[3].session_id).toEqual(950);
    expect(events[3].time).toEqual(1001);

    expect(events[4].event_type).toEqual('session_start');
    expect(events[4].session_id).toEqual(1100);
    expect(events[4].time).toEqual(1100);

    expect(events[5].event_type).toEqual('event-3');
    expect(events[5].session_id).toEqual(1100);
    expect(events[5].time).toEqual(1100);
  });

  test('explicit session for event (equal to current session) should be preserved and update config.lastEventTime', async () => {
    const send = jest.fn().mockReturnValue(sendResponse);
    const cookieStorage = new core.MemoryStorage<UserSession>();

    const client = new AmplitudeReactNativeTest(950);
    await client.init(API_KEY, undefined, clientOptions(send, cookieStorage, true)).promise;

    expect(client.config.lastEventTime).toEqual(950);
    client.track(createEvent(1000, 'event-1'));
    expect(client.config.lastEventTime).toEqual(1000);
    client.track(createEvent(1050, 'event-2', 950));
    expect(client.config.lastEventTime).toEqual(1050);
    client.track(createEvent(1100, 'event-3'));
    expect(client.config.lastEventTime).toEqual(1100);
    await client.flush().promise;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const events = send.mock.calls.flatMap((call) => call[1].events as Event[]);
    expect(events.length).toEqual(4);

    expect(events[0].event_type).toEqual('session_start');
    expect(events[0].session_id).toEqual(950);
    expect(events[0].time).toEqual(950);

    expect(events[1].event_type).toEqual('event-1');
    expect(events[1].session_id).toEqual(950);
    expect(events[1].time).toEqual(1000);

    expect(events[2].event_type).toEqual('event-2');
    expect(events[2].session_id).toEqual(950);
    expect(events[2].time).toEqual(1050);

    expect(events[3].event_type).toEqual('event-3');
    expect(events[3].session_id).toEqual(950);
    expect(events[3].time).toEqual(1100);
  });

  describe('explicit global session', () => {
    test('explicit session should be used', async () => {
      const send = jest.fn().mockReturnValue(sendResponse);
      const cookieStorage = new core.MemoryStorage<UserSession>();

      const client = new AmplitudeReactNativeTest(5000);
      await client.init(API_KEY, undefined, clientOptions(send, cookieStorage, true)).promise;

      client.setSessionId(5000);
      client.track(createEvent(1000, 'event-1'));
      client.track(createEvent(1050, 'event-2'));
      client.currentTime = 1070;
      client.setSessionId(6000);
      client.track(createEvent(1100, 'event-3'));
      await client.flush().promise;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const events = send.mock.calls.flatMap((call) => call[1].events as Event[]);
      expect(events.length).toEqual(6);

      expect(events[0].event_type).toEqual('session_start');
      expect(events[0].session_id).toEqual(5000);
      expect(events[0].time).toEqual(5000);

      expect(events[1].event_type).toEqual('event-1');
      expect(events[1].session_id).toEqual(5000);
      expect(events[1].time).toEqual(1000);

      expect(events[2].event_type).toEqual('event-2');
      expect(events[2].session_id).toEqual(5000);
      expect(events[2].time).toEqual(1050);

      expect(events[3].event_type).toEqual('session_end');
      expect(events[3].session_id).toEqual(5000);
      expect(events[3].time).toEqual(1051);

      expect(events[4].event_type).toEqual('session_start');
      expect(events[4].session_id).toEqual(6000);
      expect(events[4].time).toEqual(1070);

      expect(events[5].event_type).toEqual('event-3');
      expect(events[5].session_id).toEqual(6000);
      expect(events[5].time).toEqual(1100);
    });

    test('explicit session for event should be preserved', async () => {
      const send = jest.fn().mockReturnValue(sendResponse);
      const cookieStorage = new core.MemoryStorage<UserSession>();

      const client = new AmplitudeReactNativeTest(950);
      await client.init(API_KEY, undefined, clientOptions(send, cookieStorage, true)).promise;

      client.setSessionId(5000);
      expect(client.config.lastEventTime).toEqual(950);
      client.track(createEvent(1000, 'event-1'));
      expect(client.config.lastEventTime).toEqual(1000);
      client.track(createEvent(1050, 'event-2', 3000));
      expect(client.config.lastEventTime).toEqual(1000);
      client.track(createEvent(1100, 'event-3'));
      expect(client.config.lastEventTime).toEqual(1100);
      await client.flush().promise;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const events = send.mock.calls.flatMap((call) => call[1].events as Event[]);
      expect(events.length).toEqual(6);

      expect(events[0].event_type).toEqual('session_start');
      expect(events[0].session_id).toEqual(950);
      expect(events[0].time).toEqual(950);

      expect(events[1].event_type).toEqual('session_end');
      expect(events[1].session_id).toEqual(950);
      expect(events[1].time).toEqual(951);

      expect(events[2].event_type).toEqual('session_start');
      expect(events[2].session_id).toEqual(5000);
      expect(events[2].time).toEqual(950);

      expect(events[3].event_type).toEqual('event-1');
      expect(events[3].session_id).toEqual(5000);
      expect(events[3].time).toEqual(1000);

      expect(events[4].event_type).toEqual('event-2');
      expect(events[4].session_id).toEqual(3000);
      expect(events[4].time).toEqual(1050);

      expect(events[5].event_type).toEqual('event-3');
      expect(events[5].session_id).toEqual(5000);
      expect(events[5].time).toEqual(1100);
    });

    test('explicit no session for event should be preserved', async () => {
      const send = jest.fn().mockReturnValue(sendResponse);
      const cookieStorage = new core.MemoryStorage<UserSession>();

      const client = new AmplitudeReactNativeTest(950);
      await client.init(API_KEY, undefined, clientOptions(send, cookieStorage, true)).promise;

      client.setSessionId(5000);
      expect(client.config.lastEventTime).toEqual(950);
      client.track(createEvent(1000, 'event-1'));
      expect(client.config.lastEventTime).toEqual(1000);
      client.track(createEvent(1050, 'event-2', -1));
      expect(client.config.lastEventTime).toEqual(1000);
      client.track(createEvent(1100, 'event-3'));
      expect(client.config.lastEventTime).toEqual(1100);
      await client.flush().promise;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const events = send.mock.calls.flatMap((call) => call[1].events as Event[]);
      expect(events.length).toEqual(6);

      expect(events[0].event_type).toEqual('session_start');
      expect(events[0].session_id).toEqual(950);
      expect(events[0].time).toEqual(950);

      expect(events[1].event_type).toEqual('session_end');
      expect(events[1].session_id).toEqual(950);
      expect(events[1].time).toEqual(951);

      expect(events[2].event_type).toEqual('session_start');
      expect(events[2].session_id).toEqual(5000);
      expect(events[2].time).toEqual(950);

      expect(events[3].event_type).toEqual('event-1');
      expect(events[3].session_id).toEqual(5000);
      expect(events[3].time).toEqual(1000);

      expect(events[4].event_type).toEqual('event-2');
      expect(events[4].session_id).toEqual(-1);
      expect(events[4].time).toEqual(1050);

      expect(events[5].event_type).toEqual('event-3');
      expect(events[5].session_id).toEqual(5000);
      expect(events[5].time).toEqual(1100);
    });
  });
});
