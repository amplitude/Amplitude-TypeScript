import sessionReplay from './session-replay-factory';
export const { init, setSessionId, getSessionId, getSessionReplayProperties, captureEnabled, flush, shutdown } =
  sessionReplay;
export { SessionReplayOptions } from './typings/session-replay';
