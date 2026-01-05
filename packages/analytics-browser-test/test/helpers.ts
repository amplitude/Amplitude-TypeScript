/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BaseEvent, Campaign, BASE_CAMPAIGN } from '@amplitude/analytics-core';
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

const getReferrerObject = (referrerString?: string) => {
  if (!referrerString) return {};
  const referrerURL = new URL(referrerString);
  const referrer = referrerURL.href.split('?')[0];
  const referring_domain = referrerURL.hostname;
  return { referrer, referring_domain };
};

const generateAttributionUserProps = (campaignURL: string, referrerString?: string) => {
  const referrer = getReferrerObject(referrerString);
  const campaign = parseQueryString(campaignURL);
  const campaignObject: Campaign = {
    ...BASE_CAMPAIGN,
    ...campaign,
    ...referrer,
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

export const generateEvent = (
  event_id: number,
  event_type: string,
  options?: {
    withPageURLEnrichmentProperties?: {
      url?: string;
      previousPageUrl?: string;
    };
  },
): BaseEvent => {
  const event = {
    device_id: uuid,
    event_id: event_id,
    event_type: event_type,
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

  if (options?.withPageURLEnrichmentProperties) {
    return addPageUrlEnrichmentProperties(
      event,
      options.withPageURLEnrichmentProperties.url || '',
      options.withPageURLEnrichmentProperties.previousPageUrl || '',
    );
  }
  return event;
};

export const generateAttributionEvent = (event_id: number, campaignURL: string, referrer?: string) => {
  const attributionEvent = generateEvent(event_id, '$identify');
  attributionEvent.user_properties = generateAttributionUserProps(campaignURL, referrer);
  return attributionEvent;
};

export const generateSessionStartEvent = (
  event_id: number,
  options: {
    withPageURLEnrichmentProperties: {
      url?: string;
      previousPageUrl?: string;
    };
  },
) => {
  const sessionStartEvent = generateEvent(event_id, 'session_start');

  if (options.withPageURLEnrichmentProperties) {
    return addPageUrlEnrichmentProperties(
      sessionStartEvent,
      options.withPageURLEnrichmentProperties.url || '',
      options.withPageURLEnrichmentProperties.previousPageUrl || '',
    );
  }
  return sessionStartEvent;
};

export const generateSessionEndEvent = (
  event_id: number,
  options?: {
    withPageURLEnrichmentProperties: {
      url?: string;
      previousPageUrl?: string;
    };
  },
) => {
  const sessionEndEvent = generateEvent(event_id, 'session_end');

  if (options?.withPageURLEnrichmentProperties) {
    return addPageUrlEnrichmentProperties(
      sessionEndEvent,
      options?.withPageURLEnrichmentProperties.url || '',
      options?.withPageURLEnrichmentProperties.previousPageUrl || '',
    );
  }
  return sessionEndEvent;
};

const generatePageViewEventProps = (
  pageCounter: number,
  urlString: string,
  referrerString?: string,
  options?: {
    withPageURLEnrichmentProperties?: {
      previousPageUrl?: string;
    };
  },
) => {
  const referrer = getReferrerObject(referrerString);
  const previousUrl = options?.withPageURLEnrichmentProperties?.previousPageUrl
    ? new URL(options?.withPageURLEnrichmentProperties.previousPageUrl)
    : { href: '' };

  const url = new URL(urlString);
  const campaign = parseQueryString(urlString);

  return {
    '[Amplitude] Page Counter': pageCounter,
    '[Amplitude] Page Domain': url.hostname,
    '[Amplitude] Page Location': url.href,
    '[Amplitude] Page Path': url.pathname,
    '[Amplitude] Page Title': '',
    '[Amplitude] Page URL': url.href.split('?')[0],
    ...(options?.withPageURLEnrichmentProperties
      ? addPageUrlEnrichmentPreviousPageProperties(url.href, previousUrl.href || '')
      : {}),
    ...campaign,
    ...referrer,
  };
};

export const generatePageViewEvent = (
  event_id: number,
  pageCounter: number,
  url: string,
  referrer?: string,
  options?: {
    withPageURLEnrichmentProperties?: {
      previousPageUrl?: string;
    };
  },
) => {
  const generatePageViewEvent = generateEvent(event_id, '[Amplitude] Page Viewed');
  generatePageViewEvent.event_properties = generatePageViewEventProps(pageCounter, url, referrer, {
    withPageURLEnrichmentProperties: options?.withPageURLEnrichmentProperties,
  });
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

export const addPageUrlEnrichmentProperties = (event: BaseEvent, urlString: string, previousPageUrl?: string) => {
  const url = new URL(urlString);
  const previousUrl = previousPageUrl ? new URL(previousPageUrl) : { href: '' };

  event.event_properties = {
    ...event.event_properties,
    '[Amplitude] Page Domain': url.hostname,
    '[Amplitude] Page Location': url.href,
    '[Amplitude] Page Path': url.pathname,
    '[Amplitude] Page Title': '',
    '[Amplitude] Page URL': url.href.split('?')[0],
    ...addPageUrlEnrichmentPreviousPageProperties(url.href, previousUrl.href),
  };
  return event;
};

export const addPageUrlEnrichmentPreviousPageProperties = (current: string, previous: string) => {
  // note that the five duplicate properties with the page viewed are skipped here
  return {
    '[Amplitude] Previous Page Location': previous,
    '[Amplitude] Previous Page Type': getPreviousPageType(current, previous),
  };
};

export const getPreviousPageType = (current: string, previous: string) => {
  if (!previous) {
    return 'direct';
  }

  const currentUrl = new URL(current);
  const previousUrl = new URL(previous);

  return previousUrl.hostname === currentUrl.hostname ? 'internal' : 'external';
};
