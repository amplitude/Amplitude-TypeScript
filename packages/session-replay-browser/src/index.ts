import sessionReplay from './session-replay-factory';
export const { init, setSessionId, getSessionId, getSessionReplayProperties, flush, shutdown } = sessionReplay;
export { SessionReplayOptions, StoreType } from './typings/session-replay';
export { SafeLoggerProvider } from './logger';
export { AmplitudeSessionReplay } from './typings/session-replay';
