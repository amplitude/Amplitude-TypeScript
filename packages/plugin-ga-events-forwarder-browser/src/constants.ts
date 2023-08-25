import { VERSION } from './version';

export const GA_SERVICE_ROOT_DOMAIN_VALUES = ['analytics.google.com', 'google-analytics.com'];
export const GA_PAYLOAD_PATHNAME_VALUE = '/g/collect';
export const GA_PAYLOAD_VERSION_VALUE = '2';

// https://www.thyngster.com/ga4-measurement-protocol-cheatsheet/

export const GA_PAYLOAD_TAG_ID_KEY = 'tid';
export const GA_PAYLOAD_VERSION_KEY = 'v';
export const GA_PAYLOAD_USER_ID_KEY = 'uid';
export const GA_PAYLOAD_EVENT_NAME_KEY = 'en';
export const GA_PAYLOAD_TRACKING_ID_KEY = 'tid';

export const GA_PAYLOAD_EVENT_PROPERTY_STRING_PREFIX = 'ep.';
export const GA_PAYLOAD_EVENT_PROPERTY_NUMBER_PREFIX = 'epn.';
export const GA_PAYLOAD_USER_PROPERTY_STRING_PREFIX = 'up.';
export const GA_PAYLOAD_USER_PROPERTY_NUMBER_PREFIX = 'upn.';

export const GA_AUTOMATIC_EVENT_FILE_DOWNLOAD = 'file_download';
export const GA_AUTOMATIC_EVENT_FORM_START = 'form_start';
export const GA_AUTOMATIC_EVENT_FORM_SUBMIT = 'form_submit';
export const GA_AUTOMATIC_EVENT_PAGE_VIEW = 'page_view';
export const GA_AUTOMATIC_EVENT_SESSION_START = 'session_start';

export const AMPLITUDE_EVENT_LIBRARY = `plugin-ga-events-forwarder-browser/${VERSION}`;
export const AMPLITUDE_EVENT_PROPERTY_MEASUREMENT_ID = 'Measurement ID';
