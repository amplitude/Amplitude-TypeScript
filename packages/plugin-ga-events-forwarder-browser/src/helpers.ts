import { BaseEvent } from '@amplitude/analytics-types';
import {
  GA_PAYLOAD_CLIENT_ID_KEY,
  GA_PAYLOAD_EVENT_NAME_KEY,
  GA_PAYLOAD_EVENT_PROPERTY_NUMBER_PREFIX,
  GA_PAYLOAD_EVENT_PROPERTY_STRING_PREFIX,
  GA_PAYLOAD_SESSION_ID_KEY,
  GA_PAYLOAD_TAG_ID_KEY,
  GA_PAYLOAD_USER_ID_KEY,
  GA_PAYLOAD_USER_PROPERTY_NUMBER_PREFIX,
  GA_PAYLOAD_USER_PROPERTY_STRING_PREFIX,
  GA_PAYLOAD_VERSION_KEY,
  GA_PAYLOAD_VERSION_VALUE,
} from './constants';

type GA4Event = Record<string, string | number>;

/**
 * @param url The request URL containing event payload in query parameters.
 * @param data The request payload. This exists when multiple events are sent in a single request.
 * @returns A list of deserialized Google Analytics events.
 */
export const parseGA4Events = (url: URL, data?: BodyInit): GA4Event[] => {
  const sharedProperties: GA4Event = {};

  for (const entry of url.searchParams.entries()) {
    const [key, value] = entry;
    sharedProperties[key] = value;
  }

  if (!data) {
    return [sharedProperties];
  }

  return data
    .toString()
    .split('\\r\\')
    .map<GA4Event>((event) => {
      return {
        ...sharedProperties,
        ...event.split('&').reduce<GA4Event>((acc, props) => {
          const [key, value] = props.split('=');
          acc[key] = value;
          return acc;
        }, {}),
      };
    });
};

/**
 * @param ga4Events A list of deserialized Google Analytics events.
 * @returns A list of Amplitude events, transformed from Google Analytics events.
 */
export const transformToAmplitudeEvents = (ga4Events: GA4Event[]): BaseEvent[] =>
  ga4Events.map<BaseEvent>((ga4Event) => ({
    event_type: String(ga4Event[GA_PAYLOAD_EVENT_NAME_KEY]),
    device_id: String(ga4Event[GA_PAYLOAD_CLIENT_ID_KEY]),
    user_id: String(ga4Event[GA_PAYLOAD_USER_ID_KEY]),
    session_id: Number(ga4Event[GA_PAYLOAD_SESSION_ID_KEY]),
    event_properties: getProperties(
      ga4Event,
      GA_PAYLOAD_EVENT_PROPERTY_STRING_PREFIX,
      GA_PAYLOAD_EVENT_PROPERTY_NUMBER_PREFIX,
    ),
    user_properties: getProperties(
      ga4Event,
      GA_PAYLOAD_USER_PROPERTY_STRING_PREFIX,
      GA_PAYLOAD_USER_PROPERTY_NUMBER_PREFIX,
    ),
  }));

/**
 * @param ga4Event  A list of deserialized Google Analytics events.
 * @param stringPayload The prefix of an event or user property with type string, ie `ep.` or `up.`.
 * @param numberPayloadPrefix The prefix of an event or user property with type number, ie `epn.` or `upn.`.
 * @returns An object containing events or user properties.
 */
export const getProperties = (ga4Event: GA4Event, stringPayload: string, numberPayloadPrefix: string) => {
  const properties: Record<string, string | number> = {};

  for (const entry of Object.entries(ga4Event)) {
    const [key, value] = entry;

    if (key.startsWith(stringPayload)) {
      const propertyName = key.slice(stringPayload.length);
      properties[propertyName] = String(value);
    }

    if (key.startsWith(numberPayloadPrefix)) {
      const propertyName = key.slice(numberPayloadPrefix.length);
      properties[propertyName] = Number(value);
    }
  }

  return properties;
};

/**
 * @param url The request URL containing event payload in query parameters.
 * @param trackingIds A list of Google Analytics tracking IDs.
 * @returns True if no Google Tracking ID is passed or if request URL contains an allowed Google Tracking ID, otherwise, false.
 */
export const isTrackingIdAllowed = (url: URL, trackingIds: string[]) => {
  const tagId = url.searchParams.get(GA_PAYLOAD_TAG_ID_KEY);
  if (!tagId) {
    return false;
  }
  return trackingIds.length === 0 || trackingIds.includes(tagId);
};

/**
 * @param url The request URL containing event payload in query parameters.
 * @returns True if url contains supported version, otherwise, false.
 */
export const isVersionSupported = (url: URL) =>
  url.searchParams.get(GA_PAYLOAD_VERSION_KEY) === GA_PAYLOAD_VERSION_VALUE;
