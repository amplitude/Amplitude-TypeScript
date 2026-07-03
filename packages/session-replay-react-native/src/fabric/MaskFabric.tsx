import React from 'react';
import { UIManager } from 'react-native';
import SRMaskViewNative from '../specs/SRMaskViewNativeComponent';
import type { MaskProps, UnmaskProps } from '../Mask.types';

const NATIVE_AVAILABLE = UIManager.hasViewManagerConfig?.('SRMaskView') ?? false;
let warned = false;
function warnOnce() {
  if (!warned) {
    warned = true;
    console.error(
      '[AmpMask] New Architecture detected but the native SRMaskView component is unavailable — <AmpMask>/<AmpUnmask> render children UNMASKED. Verify the Fabric masking sources were built (new architecture + RN >= 0.77) and codegen ran.',
    );
  }
}
const Passthrough = ({ children }: { children?: React.ReactNode }) => {
  warnOnce();
  return <>{children}</>;
};
const contents = { display: 'contents' as unknown as 'flex' }; // zero-box hint; C++ adopt() is authoritative

function MaskImpl({ enabled = true, maskLevel = 'mask', children, ...vp }: MaskProps) {
  return (
    <SRMaskViewNative {...vp} enabled={enabled} unmask={false} maskLevel={maskLevel} style={contents}>
      {children}
    </SRMaskViewNative>
  );
}
function UnmaskImpl({ children, ...vp }: UnmaskProps) {
  return (
    <SRMaskViewNative {...vp} enabled unmask maskLevel="mask" style={contents}>
      {children}
    </SRMaskViewNative>
  );
}
export const AmpMask = NATIVE_AVAILABLE ? MaskImpl : Passthrough;
export const AmpUnmask = NATIVE_AVAILABLE ? UnmaskImpl : Passthrough;
