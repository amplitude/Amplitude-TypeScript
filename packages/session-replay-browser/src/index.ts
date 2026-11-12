import sessionReplay from './session-replay-factory';
export const {
  init,
  setSessionId,
  getSessionId,
  getSessionReplayProperties,
  flush,
  start,
  stop,
  shutdown,
  evaluateTargetingAndCapture,
} = sessionReplay;
export { SessionReplayOptions, StoreType } from './typings/session-replay';
export { SafeLoggerProvider } from './logger';
export { AmplitudeSessionReplay } from './typings/session-replay';
export {
  SendEventsRequest,
  FetchConfigRequest,
  SessionReplaySendEventsHandler,
  SessionReplayFetchConfigHandler,
} from './config/types';

export type {
  SemanticCaptureConfig,
  SemanticCaptureOptions,
  SemanticCaptureFactory,
  SemanticCaptureHost,
  SemanticCaptureController,
} from './semantic-types';
