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
export { type SessionReplayConfig, type MaskLevel, type PrivacyConfig } from './session-replay-config';

export { SessionReplayPlugin } from './plugin-session-replay';
export type { SessionReplayPluginConfig } from './plugin-session-replay-config';

export { AmpMaskView } from './amp-mask-view';

import type { ComponentType } from 'react';
import type { MaskProps, UnmaskProps } from './Mask.types';

const g = global as unknown as { RN$Bridgeless?: boolean; nativeFabricUIManager?: unknown };
const isNewArch = g.RN$Bridgeless === true || g.nativeFabricUIManager != null;
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
export const { AmpMask, AmpUnmask }: { AmpMask: ComponentType<MaskProps>; AmpUnmask: ComponentType<UnmaskProps> } =
  isNewArch ? require('./fabric/MaskFabric') : require('./paper/MaskPaper');
// AmpMaskLevel, NOT MaskLevel — `MaskLevel` is already exported from './session-replay-config'
export type { MaskProps, UnmaskProps, AmpMaskLevel } from './Mask.types';
