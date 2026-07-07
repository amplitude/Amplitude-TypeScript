import React from 'react';
import { NativeModules, TurboModuleRegistry, UIManager } from 'react-native';
import SRMaskViewNative from '../specs/SRMaskViewNativeComponent';
import { createAmpMaskViewFallback, warnOnce } from '../mask-fallback';
import type { MaskProps, UnmaskProps } from '../Mask.types';

// Three-tier fail-closed probe. We never fall open (unmasked) unless the
// package's native code is entirely absent — i.e. the recorder itself cannot
// run and nothing can be captured:
//   1. SRMaskView registered -> use it directly, layout-transparent.
//   2. Only the Paper AMPMaskComponentView registered (Fabric sources not
//      built) -> render through <AmpMaskView>: masked, layout-unsafe.
//   3. Neither registered -> behavior depends on RECORDER_PRESENT below.
const FABRIC_AVAILABLE = UIManager.hasViewManagerConfig?.('SRMaskView') ?? false;
const PAPER_MASK_AVAILABLE = UIManager.hasViewManagerConfig?.('AMPMaskComponentView') ?? false;
// Whether the Session Replay native module is linked. Must be resolved the
// same way src/native-module.ts resolves it (TurboModuleRegistry.get, then the
// legacy NativeModules interop proxy) so this gate can never disagree with the
// recorder's actual availability.
const RECORDER_PRESENT =
  (TurboModuleRegistry?.get?.('AMPNativeSessionReplay') ?? NativeModules?.AMPNativeSessionReplay) != null;

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

// Tier 2: masked but not layout-transparent. `enabled` is intentionally
// ignored (over-mask), matching the Old-Arch prod fallback in MaskPaper.
const FALLBACK_WARNING =
  '[AmpMask] New Architecture detected but the native SRMaskView component is unavailable — falling back to <AmpMaskView> (content stays MASKED but layout transparency is lost). Verify the Fabric masking sources were built (new architecture + RN >= 0.77) and codegen ran. Note: Fabric without bridgeless (bridge mode) cannot detect SRMaskView on iOS and always uses this fallback.';
const FallbackMask = createAmpMaskViewFallback<MaskProps>({ mask: 'from-maskLevel', warning: FALLBACK_WARNING });
const FallbackUnmask = createAmpMaskViewFallback<UnmaskProps>({ mask: 'amp-unmask', warning: FALLBACK_WARNING });

// Tier 3: no masking-capable native view exists, so children render directly.
// Safe only when the recorder is absent too (nothing can be captured); when
// the recorder IS present this is a build error we must not infer our way
// past — throw in dev, warn loudly in prod.
const UNMASKED_WARNING =
  '[AmpMask] New Architecture detected but the native SRMaskView component is unavailable — <AmpMask>/<AmpUnmask> render children UNMASKED. Verify the Fabric masking sources were built (new architecture + RN >= 0.77) and codegen ran.';
const UNMASKABLE_MSG =
  '<AmpMask> cannot mask: the Session Replay native module is present but neither SRMaskView nor AMPMaskComponentView is registered. Fix the build before shipping.';
const UNMASKABLE_WARNING =
  '[AmpMask] The Session Replay native module is present but neither SRMaskView nor AMPMaskComponentView is registered — <AmpMask>/<AmpUnmask> render children UNMASKED. This is a build error (not an expected environment) — fix the build before shipping.';

function createPassthrough(warning: string, devThrowMessage?: string) {
  return function PassthroughChildren({ children }: { children?: React.ReactNode }) {
    if (devThrowMessage !== undefined && __DEV__) {
      throw new Error(devThrowMessage);
    }
    warnOnce(warning);
    return <>{children}</>;
  };
}
const Passthrough = createPassthrough(UNMASKED_WARNING);
const UnmaskableGuard = createPassthrough(UNMASKABLE_WARNING, UNMASKABLE_MSG);

const NeitherAvailable = RECORDER_PRESENT ? UnmaskableGuard : Passthrough;

export const AmpMask = FABRIC_AVAILABLE ? MaskImpl : PAPER_MASK_AVAILABLE ? FallbackMask : NeitherAvailable;
export const AmpUnmask = FABRIC_AVAILABLE ? UnmaskImpl : PAPER_MASK_AVAILABLE ? FallbackUnmask : NeitherAvailable;
