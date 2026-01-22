import sessionReplay from './session-replay-factory';
export const {
  init,
  setSessionId,
  getSessionId,
  getSessionReplayProperties,
  flush,
  shutdown,
  evaluateTargetingAndCapture,
} = sessionReplay;
export { SessionReplayOptions, StoreType } from './typings/session-replay';
export { BackgroundCaptureOptions } from './config/types';
export { SafeLoggerProvider } from './logger';
export { AmplitudeSessionReplay } from './typings/session-replay';
