import React from 'react';
import { UIManager } from 'react-native';
import SRMaskViewNative from '../specs/SRMaskViewNativeComponent';
import { AmpMaskView } from '../amp-mask-view';
import type { MaskProps, UnmaskProps } from '../Mask.types';

// Three-tier fail-closed probe. We never fall open (unmasked) unless the
// package's native code is entirely absent, i.e. the recorder itself cannot
// run and there is no PII risk from masking being skipped.
//
// 1. FABRIC_AVAILABLE: the New Architecture masking view is registered ->
//    use it directly (MaskImpl/UnmaskImpl below), layout-transparent.
// 2. PAPER_MASK_AVAILABLE (Fabric view missing, Paper view present): the
//    package's native code is present but the Fabric masking sources were
//    not built/registered (build misconfiguration on New Arch + RN >= 0.77).
//    Fail closed by rendering through the Paper `AmpMaskView` instead of
//    passing content through unmasked. This loses layout-transparency but
//    keeps content masked.
// 3. Neither registered: the package's native code is absent altogether
//    (e.g. Expo Go-like environments). There is no recorder running, so
//    there is nothing to leak — and AmpMaskView would render native error
//    boxes since its own native view is also missing. Fall back to a plain
//    passthrough, matching the existing prod behavior on such environments.
const FABRIC_AVAILABLE = UIManager.hasViewManagerConfig?.('SRMaskView') ?? false;
const PAPER_MASK_AVAILABLE = UIManager.hasViewManagerConfig?.('AMPMaskComponentView') ?? false;

let warned = false;
function warnOnceUnmasked() {
  if (!warned) {
    warned = true;
    console.error(
      '[AmpMask] New Architecture detected but the native SRMaskView component is unavailable — <AmpMask>/<AmpUnmask> render children UNMASKED. Verify the Fabric masking sources were built (new architecture + RN >= 0.77) and codegen ran.',
    );
  }
}
function warnOnceFallback() {
  if (!warned) {
    warned = true;
    console.error(
      '[AmpMask] New Architecture detected but the native SRMaskView component is unavailable — falling back to <AmpMaskView> (content stays MASKED but layout transparency is lost). Verify the Fabric masking sources were built (new architecture + RN >= 0.77) and codegen ran.',
    );
  }
}
const Passthrough = ({ children }: { children?: React.ReactNode }) => {
  warnOnceUnmasked();
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

// Tier 2: the Fabric view is missing but the Paper native view is present.
// Fail closed through AmpMaskView rather than passing content through
// unmasked. `enabled` is intentionally ignored (over-mask), matching the
// documented Old-Arch prod fallback in src/paper/MaskPaper.tsx.
function FallbackMask({ maskLevel = 'mask', children, ...vp }: MaskProps) {
  warnOnceFallback();
  return (
    <AmpMaskView mask={maskLevel === 'block' ? 'amp-block' : 'amp-mask'} {...vp}>
      {children}
    </AmpMaskView>
  );
}
function FallbackUnmask({ children, ...vp }: UnmaskProps) {
  warnOnceFallback();
  return (
    <AmpMaskView mask="amp-unmask" {...vp}>
      {children}
    </AmpMaskView>
  );
}

export const AmpMask = FABRIC_AVAILABLE ? MaskImpl : PAPER_MASK_AVAILABLE ? FallbackMask : Passthrough;
export const AmpUnmask = FABRIC_AVAILABLE ? UnmaskImpl : PAPER_MASK_AVAILABLE ? FallbackUnmask : Passthrough;
