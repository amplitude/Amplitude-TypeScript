import { IdentityStorageType, ServerZoneType } from '@amplitude/analytics-types';

export const DEFAULT_EVENT_PREFIX = '[Amplitude]';

export const DEFAULT_PAGE_VIEW_EVENT = `${DEFAULT_EVENT_PREFIX} Page Viewed`;
export const DEFAULT_FORM_START_EVENT = `${DEFAULT_EVENT_PREFIX} Form Started`;
export const DEFAULT_FORM_SUBMIT_EVENT = `${DEFAULT_EVENT_PREFIX} Form Submitted`;
export const DEFAULT_FILE_DOWNLOAD_EVENT = `${DEFAULT_EVENT_PREFIX} File Downloaded`;
export const DEFAULT_SESSION_START_EVENT = 'session_start';
export const DEFAULT_SESSION_END_EVENT = 'session_end';

export const FILE_EXTENSION = `${DEFAULT_EVENT_PREFIX} File Extension`;
export const FILE_NAME = `${DEFAULT_EVENT_PREFIX} File Name`;
export const LINK_ID = `${DEFAULT_EVENT_PREFIX} Link ID`;
export const LINK_TEXT = `${DEFAULT_EVENT_PREFIX} Link Text`;
export const LINK_URL = `${DEFAULT_EVENT_PREFIX} Link URL`;

export const FORM_ID = `${DEFAULT_EVENT_PREFIX} Form ID`;
export const FORM_NAME = `${DEFAULT_EVENT_PREFIX} Form Name`;
export const FORM_DESTINATION = `${DEFAULT_EVENT_PREFIX} Form Destination`;

export const DEFAULT_IDENTITY_STORAGE: IdentityStorageType = 'cookie';
export const DEFAULT_SERVER_ZONE: ServerZoneType = 'US';
