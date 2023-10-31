import { AMPLITUDE_PREFIX } from '@amplitude/analytics-core';
import { IDBStoreSession } from './typings/session-replay';

export const DEFAULT_EVENT_PROPERTY_PREFIX = '[Amplitude]';

export const NEW_SESSION_REPLAY_PROPERTY = `${DEFAULT_EVENT_PROPERTY_PREFIX} Session Replay ID`;
export const DEFAULT_SESSION_REPLAY_PROPERTY = `${DEFAULT_EVENT_PROPERTY_PREFIX} Session Recorded`;
export const DEFAULT_SESSION_START_EVENT = 'session_start';
export const DEFAULT_SESSION_END_EVENT = 'session_end';
export const DEFAULT_SAMPLE_RATE = 0;

export const BLOCK_CLASS = 'amp-block';
export const MASK_TEXT_CLASS = 'amp-mask';
export const UNMASK_TEXT_CLASS = 'amp-unmask';
export const SESSION_REPLAY_SERVER_URL = 'https://api-sr.amplitude.com/sessions/v2/track';
export const SESSION_REPLAY_EU_URL = 'https://api-sr.eu.amplitude.com/sessions/v2/track';
export const STORAGE_PREFIX = `${AMPLITUDE_PREFIX}_replay_unsent`;
export const MAX_EVENT_LIST_SIZE_IN_BYTES = 1 * 1000000; // 1 MB
export const MIN_INTERVAL = 500; // 500 ms
export const MAX_INTERVAL = 10 * 1000; // 10 seconds
export const defaultSessionStore: IDBStoreSession = {
  currentSequenceId: 0,
  sessionSequences: {},
};
export const MAX_IDB_STORAGE_LENGTH = 1000 * 60 * 60 * 24 * 3; // 3 days
