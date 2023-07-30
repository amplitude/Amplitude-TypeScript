import { AMPLITUDE_PREFIX } from '@amplitude/analytics-core';
import { IDBStoreSession } from './typings/session-replay';

export const DEFAULT_EVENT_PROPERTY_PREFIX = '[Amplitude]';

export const DEFAULT_SESSION_REPLAY_PROPERTY = `${DEFAULT_EVENT_PROPERTY_PREFIX} Session Recorded`;
export const DEFAULT_SESSION_START_EVENT = 'session_start';
export const DEFAULT_SESSION_END_EVENT = 'session_end';

export const BLOCK_CLASS = 'amp-block';
export const MASK_TEXT_CLASS = 'amp-mask';
export const UNMASK_TEXT_CLASS = 'amp-unmask';
export const SESSION_REPLAY_SERVER_URL = 'https://api-secure.amplitude.com/sessions/track';
export const STORAGE_PREFIX = `${AMPLITUDE_PREFIX}_replay_unsent`;
const PAYLOAD_ESTIMATED_SIZE_IN_BYTES_WITHOUT_EVENTS = 500; // derived by JSON stringifying an example payload without events
export const MAX_EVENT_LIST_SIZE_IN_BYTES = 10 * 1000000 - PAYLOAD_ESTIMATED_SIZE_IN_BYTES_WITHOUT_EVENTS;
export const MIN_INTERVAL = 500; // 500 ms
export const MAX_INTERVAL = 10 * 1000; // 10 seconds
export const defaultSessionStore: IDBStoreSession = {
  shouldRecord: true,
  currentSequenceId: 0,
  sessionSequences: {},
};
