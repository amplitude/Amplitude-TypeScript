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

export { SessionReplayPlugin } from './plugin-session-replay';
export type { SessionReplayPluginConfig } from './plugin-session-replay-config';

export { AmpMaskView, type AmpMaskViewProps } from './amp-mask-view';
