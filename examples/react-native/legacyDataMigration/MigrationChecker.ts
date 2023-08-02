import {Event, UserSession} from '@amplitude/analytics-types';

type LegacyEvent = {
  event_id: number;
  event_type: string;
  time: number;
  insert_id: string;
};

const legacyDeviceId = '22833898-c487-4536-b213-40f207abdce0R';
const legacyUserId = 'android-kotlin-sample-user-legacy';
const legacyEvents: LegacyEvent[] = [
  {
    event_id: 1,
    event_type: '$identify',
    time: 1684219150343,
    insert_id: 'be09ecba-83f7-444a-aba0-fe1f529a3716',
  },
  {
    event_id: 2,
    event_type: '$identify',
    time: 1684219150344,
    insert_id: '0894387e-e923-423b-9feb-086ba8cb2cfa',
  },
  {
    event_id: 1,
    event_type: '$identify',
    time: 1684219150358,
    insert_id: '1a14d057-8a12-40bb-8217-2d62dd08a525',
  },
  {
    event_id: 2,
    event_type: '$identify',
    time: 1684219150359,
    insert_id: 'b115a299-4cc6-495b-8e4e-c2ce6f244be9',
  },
  {
    event_id: 1,
    event_type: 'legacy event 1',
    time: 1684219150354,
    insert_id: 'd6eff10b-9cd4-45d7-85cb-c81cb6cb8b2e',
  },
  {
    event_id: 2,
    event_type: 'legacy event 2',
    time: 1684219150355,
    insert_id: '7b4c5c13-6fdc-4931-9ba1-e4efdf346ee0',
  },
];

export default class MigrationChecker {
  errors: string[] = [];

  constructor(private readonly version: 'v4' | 'v3' | 'vMissing') {}

  checkUserSession(userSession: UserSession | undefined) {
    if (userSession === undefined) {
      this.check(false, 'userSession');
      return;
    }

    if (this.version === 'v4' || this.version === 'v3') {
      this.check(userSession.deviceId === legacyDeviceId, 'deviceId');
      this.check(userSession.userId === legacyUserId, 'userId');
      this.check(userSession.lastEventId === 2, 'lastEventId');
    } else {
      this.check(userSession.deviceId !== legacyDeviceId, 'deviceId');
      this.check(userSession.userId === undefined, 'userId');
      this.check(userSession.lastEventId === undefined, 'lastEventId');
    }
  }

  checkEvents(events: Event[] | undefined) {
    if (events === undefined) {
      this.check(false, 'events');
      return;
    }

    if (this.version === 'v4') {
      this.compareEvents(events, legacyEvents);
    } else if (this.version === 'v3') {
      this.compareEvents(events, [
        ...legacyEvents.slice(0, 2),
        ...legacyEvents.slice(4),
      ]);
    } else {
      this.compareEvents(events, []);
    }
  }

  private compareEvents(events: Event[], expectedEvents: LegacyEvent[]) {
    if (events.length !== expectedEvents.length) {
      this.check(false, 'events.length');
      return;
    }

    events.forEach((event, i) => {
      this.check(
        event.event_id === expectedEvents[i].event_id,
        `event${i + 1}.event_id`,
      );
      this.check(
        event.event_type === expectedEvents[i].event_type,
        `event${i + 1}.event_type`,
      );
      this.check(event.time === expectedEvents[i].time, `event${i + 1}.time`);
      this.check(
        event.insert_id === expectedEvents[i].insert_id,
        `event${i + 1}.insert_id`,
      );
      this.check(
        event.library === 'amplitude-android/2.39.3-SNAPSHOT',
        `event${i + 1}.library`,
      );
      this.check(event.device_id === legacyDeviceId, `event${i + 1}.device_id`);
      this.check(event.user_id === legacyUserId, `event${i + 1}.user_id`);
    });
  }

  check(assert: boolean, error: string) {
    if (!assert) {
      this.errors.push(error);
    }
  }
}
