import {
  GA_PAYLOAD_EVENT_PROPERTY_NUMBER_PREFIX,
  GA_PAYLOAD_EVENT_PROPERTY_STRING_PREFIX,
  GA_PAYLOAD_USER_PROPERTY_NUMBER_PREFIX,
  GA_PAYLOAD_USER_PROPERTY_STRING_PREFIX,
} from '../src/constants';
import {
  getProperties,
  isTrackingIdAllowed,
  isVersionSupported,
  parseGA4Events,
  transformToAmplitudeEvents,
} from '../src/helpers';
import { MOCK_GA_EVENT, MOCK_URL } from './constants';

describe('parseGA4Events', () => {
  test('should parse ga4 events w/o request body', () => {
    const url = new URL(MOCK_URL + '&en=page_view&_ee=1');
    const result = parseGA4Events(url);

    expect(result).toEqual([
      {
        ...MOCK_GA_EVENT,
        en: 'page_view',
        _ee: '1',
      },
    ]);
  });

  test('should parse ga4 events w/ request body', () => {
    const url = new URL(MOCK_URL);
    const data = 'en=page_view&_ee=1\\r\\en=custom_event&_ee=1&epn.1=1&ep.a=a&upn.2=2&up.b=b';
    const result = parseGA4Events(url, data);

    expect(result).toEqual([
      {
        ...MOCK_GA_EVENT,
        en: 'page_view',
        _ee: '1',
      },
      {
        ...MOCK_GA_EVENT,
        en: 'custom_event',
        _ee: '1',
        'ep.a': 'a',
        'epn.1': '1',
        'up.b': 'b',
        'upn.2': '2',
      },
    ]);
  });

  describe('transformToAmplitudeEvents', () => {
    test('transformToAmplitudeEvents', () => {
      const amplitudeEvent = transformToAmplitudeEvents([
        {
          ...MOCK_GA_EVENT,
          en: 'custom_event',
          _ee: '1',
          'ep.a': 'a',
          'epn.1': '1',
          'up.b': 'b',
          'upn.2': '2',
        },
      ]);
      expect(amplitudeEvent).toEqual([
        {
          event_type: 'custom_event',
          device_id: MOCK_GA_EVENT.cid,
          user_id: MOCK_GA_EVENT.uid,
          event_properties: {
            a: 'a',
            1: 1,
            'Tracking ID': 'G-DELYSDZ9Q3',
          },
          user_properties: {
            b: 'b',
            2: 2,
          },
        },
      ]);
    });
  });

  describe('getProperties', () => {
    test('should return event properties', () => {
      const eventProperties = getProperties(
        {
          ...MOCK_GA_EVENT,
          en: 'custom_event',
          _ee: '1',
          'ep.a': 'a',
          'epn.1': '1',
          'up.b': 'b',
          'upn.2': '2',
        },
        GA_PAYLOAD_EVENT_PROPERTY_STRING_PREFIX,
        GA_PAYLOAD_EVENT_PROPERTY_NUMBER_PREFIX,
      );
      expect(eventProperties).toEqual({
        a: 'a',
        1: 1,
      });
    });

    test('should return user properties', () => {
      const userProperties = getProperties(
        {
          ...MOCK_GA_EVENT,
          en: 'custom_event',
          _ee: '1',
          'ep.a': 'a',
          'epn.1': '1',
          'up.b': 'b',
          'upn.2': '2',
        },
        GA_PAYLOAD_USER_PROPERTY_STRING_PREFIX,
        GA_PAYLOAD_USER_PROPERTY_NUMBER_PREFIX,
      );
      expect(userProperties).toEqual({
        b: 'b',
        2: 2,
      });
    });
  });

  describe('isTrackingIdAllowed', () => {
    test('should return true if trackingIds input is omitted', () => {
      expect(isTrackingIdAllowed(new URL(MOCK_URL), [])).toBe(true);
    });

    test('should return true if URL includes one of the Tracking IDs', () => {
      expect(isTrackingIdAllowed(new URL(MOCK_URL), ['G-DELYSDZ9Q3'])).toBe(true);
    });

    test('should return false if URL does not include any of the Tracking IDs', () => {
      expect(isTrackingIdAllowed(new URL(MOCK_URL), ['G-XXXXXXXXXX'])).toBe(false);
    });

    test('should return false if URL does not include have a Tracking ID', () => {
      expect(isTrackingIdAllowed(new URL('https://amplitude.com'), [])).toBe(false);
    });
  });

  describe('isVersionSupported', () => {
    test('should return true', () => {
      expect(isVersionSupported(new URL(MOCK_URL))).toBe(true);
    });

    test('should return false', () => {
      expect(isVersionSupported(new URL('https://amplitude.com'))).toBe(false);
    });
  });
});
