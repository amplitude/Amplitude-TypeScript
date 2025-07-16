export {
  init,
  setSessionId,
  getSessionId,
  getSessionReplayProperties,
  flush,
  start,
  stop,
  setDeviceId,
} from './session-replay';
export { type SessionReplayConfig, MaskLevel } from './session-replay-config';

export { SessionReplayPlugin } from './plugin-session-replay';
export type { SessionReplayPluginConfig } from './plugin-session-replay-config';

export { AmpMaskView } from './amp-mask-view';
