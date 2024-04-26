/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BaseEvent, Campaign } from '@amplitude/analytics-types';
import { BASE_CAMPAIGN } from '@amplitude/analytics-client-common';
import { uuidPattern } from './constants';

const uuid: string = expect.stringMatching(uuidPattern) as string;
const userAgent = expect.any(String) as string;
const library = expect.stringMatching(/^amplitude-ts\/.+/) as string;
const number = expect.any(Number) as number;

const parseQueryString = (url: string) => {
  const params: { [key: string]: string } = {};
  // Extract the query string part from the URL
  const queryString = url.split('?')[1];
  if (queryString) {
    // Split the query string into key-value pairs
    queryString.split('&').forEach((part) => {
      const [key, value] = part.split('=');
      // Decode URI components and add to the params object
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    });
  }
  return params;
};

const generateAttributionUserProps = (campaignURL: string) => {
  const campaign = parseQueryString(campaignURL);
  const campaignObject: Campaign = {
    ...BASE_CAMPAIGN,
    ...campaign,
  };
  const hasNoCampaign = Object.entries(campaign).length === 0;
  const hasAllCampaign = Object.entries(campaign).length === Object.entries(BASE_CAMPAIGN).length;
  const operationObject: { [key: string]: { [key: string]: string } } = {
    $setOnce: {},
    ...(!hasAllCampaign ? { $unset: {} } : {}),
    ...(!hasNoCampaign ? { $set: {} } : {}),
  };

  const user_properties = Object.keys(campaignObject).reduce((operationObject, key) => {
    if (campaignObject[key] !== undefined) {
      operationObject.$setOnce['initial_' + key] = campaignObject[key] as string;
      operationObject.$set[key] = campaignObject[key] as string; // Assert that the value is a string
    } else {
      operationObject.$setOnce['initial_' + key] = 'EMPTY';
      operationObject.$unset[key] = '-';
    }

    return operationObject;
  }, operationObject);

  return user_properties;
};

export const generateEvent = (event_id: number, event_type: string): BaseEvent => {
  return {
    device_id: uuid,
    event_id,
    event_type,
    insert_id: uuid,
    ip: '$remote',
    language: 'en-US',
    library,
    partner_id: undefined,
    plan: undefined,
    platform: 'Web',
    session_id: number,
    time: number,
    user_agent: userAgent,
    user_id: 'user1@amplitude.com',
  };
};

export const generateAttributionEvent = (event_id: number, campaignURL: string) => {
  const attributionEvent = generateEvent(event_id, '$identify');
  attributionEvent.user_properties = generateAttributionUserProps(campaignURL);
  return attributionEvent;
};

export const generateSessionStartEvent = (event_id: number) => {
  return generateEvent(event_id, 'session_start');
};

export const generateSessionEndEvent = (event_id: number) => {
  return generateEvent(event_id, 'session_end');
};

const generatePageViewEventProps = (pageCounter: number, urlString: string, referrerString?: string) => {
  let referrerObj = {};
  if (referrerString) {
    const referrerURL = new URL(referrerString);
    const referrer = referrerURL.href.split('?')[0];
    const referring_domain = referrerURL.hostname;
    referrerObj = {
      referrer,
      referring_domain,
    };
  }

  const url = new URL(urlString);
  const campaign = parseQueryString(urlString);

  return {
    '[Amplitude] Page Counter': pageCounter,
    '[Amplitude] Page Domain': url.hostname,
    '[Amplitude] Page Location': url.href,
    '[Amplitude] Page Path': url.pathname,
    '[Amplitude] Page Title': '',
    '[Amplitude] Page URL': url.href.split('?')[0],
    ...campaign,
    ...referrerObj,
  };
};

export const generatePageViewEvent = (event_id: number, pageCounter: number, url: string, referrer?: string) => {
  const generatePageViewEvent = generateEvent(event_id, '[Amplitude] Page Viewed');
  generatePageViewEvent.event_properties = generatePageViewEventProps(pageCounter, url, referrer);
  return generatePageViewEvent;
};

export const navigateTo = (urlString: string, referrer?: string) => {
  if (referrer) {
    Object.defineProperty(document, 'referrer', { value: referrer, configurable: true });
  }

  const url = new URL(urlString);
  // eslint-disable-next-line no-restricted-globals
  Object.defineProperty(window, 'location', {
    value: {
      hostname: url.hostname,
      href: url.href,
      pathname: url.pathname,
      search: url.search,
    },
    writable: true,
  });
};
