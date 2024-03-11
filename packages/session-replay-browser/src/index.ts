import sessionReplay from './session-replay-factory';
export const { init, setSessionId, getSessionId, getSessionReplayProperties, flush, shutdown } = sessionReplay;
