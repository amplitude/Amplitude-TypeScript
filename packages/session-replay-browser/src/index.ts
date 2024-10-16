import sessionReplay from './session-replay-factory';
export const { init, setSessionId, getSessionId, getSessionReplayProperties, flush, shutdown } = sessionReplay;
export { SessionReplayOptions, StoreType, EventsStore } from './typings/session-replay';
export { BaseEventsStore } from './events/base-events-store';
