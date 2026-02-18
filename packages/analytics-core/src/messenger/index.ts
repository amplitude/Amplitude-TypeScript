export type { BaseWindowMessenger, ActionHandler } from './base-window-messenger';
export { getOrCreateWindowMessenger } from './base-window-messenger';
export { enableBackgroundCapture } from './background-capture';
export {
  AMPLITUDE_ORIGIN,
  AMPLITUDE_ORIGIN_EU,
  AMPLITUDE_ORIGIN_STAGING,
  AMPLITUDE_ORIGINS_MAP,
  AMPLITUDE_BACKGROUND_CAPTURE_SCRIPT_URL,
} from './constants';
export { asyncLoadScript, generateUniqueId } from './utils';
