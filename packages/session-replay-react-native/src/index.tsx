export {
  init,
  setSessionId,
  getSessionId,
  flush,
  start,
  stop,
  setDeviceId,
  setOptOut,
  teardown,
} from './session-replay';
export { type SessionReplayConfig, type MaskLevel, type PrivacyConfig } from './session-replay-config';
export { LogLevel } from './session-replay-config';

export { AmpMaskView, type AmpMaskViewProps } from './amp-mask-view';
