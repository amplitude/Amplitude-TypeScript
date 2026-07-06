import React from 'react';
import { NativeModules, TurboModuleRegistry, UIManager } from 'react-native';
import SRMaskViewNative from '../specs/SRMaskViewNativeComponent';
import { AmpMaskView } from '../amp-mask-view';
import { ampMaskViewMaskProp } from '../Mask.types';
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
// 3. Neither registered: verify via RECORDER_PRESENT below whether the
//    package's native code is absent altogether (e.g. Expo Go-like
//    environments — no recorder running, nothing to leak) or, in the
//    should-be-unreachable case, present without a masking-capable
//    component (an unforeseen build misconfiguration we must not infer our
//    way past).
const FABRIC_AVAILABLE = UIManager.hasViewManagerConfig?.('SRMaskView') ?? false;
const PAPER_MASK_AVAILABLE = UIManager.hasViewManagerConfig?.('AMPMaskComponentView') ?? false;
// Whether the Session Replay native module itself is linked. Used to decide
// tier-3 behavior below — we verify the recorder's absence rather than
// inferring it from the missing view managers alone. The probe must resolve
// the module the same way src/native-module.ts does (TurboModuleRegistry.get,
// which is what the codegen spec in src/specs/NativeAmpSessionReplay.ts uses
// on both architectures), falling back to the legacy NativeModules interop
// proxy, so the passthrough gate can never disagree with the recorder's
// actual availability.
const RECORDER_PRESENT =
  (TurboModuleRegistry?.get?.('AMPNativeSessionReplay') ?? NativeModules?.AMPNativeSessionReplay) != null;

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
      '[AmpMask] New Architecture detected but the native SRMaskView component is unavailable — falling back to <AmpMaskView> (content stays MASKED but layout transparency is lost). Verify the Fabric masking sources were built (new architecture + RN >= 0.77) and codegen ran. Note: Fabric without bridgeless (bridge mode) cannot detect SRMaskView on iOS and always uses this fallback.',
    );
  }
}
function warnOnceUnreachable() {
  if (!warned) {
    warned = true;
    console.error(
      '[AmpMask] The Session Replay native module is present but neither SRMaskView nor AMPMaskComponentView is registered — <AmpMask>/<AmpUnmask> render children UNMASKED. This is a build error (not an expected environment) — fix the build before shipping.',
    );
  }
}
const Passthrough = ({ children }: { children?: React.ReactNode }) => {
  warnOnceUnmasked();
  return <>{children}</>;
};
// Tier 3, should-be-unreachable sub-case: the recorder is linked but no
// masking-capable component is registered. Don't infer — throw in dev so the
// build misconfiguration is caught immediately; in prod, fail closed by
// warning once and rendering children (there is no masked native view to
// fall back to on this tier).
const UnmaskableGuard = ({ children }: { children?: React.ReactNode }) => {
  if (__DEV__) {
    throw new Error(
      '<AmpMask> cannot mask: the Session Replay native module is present but neither SRMaskView nor AMPMaskComponentView is registered. Fix the build before shipping.',
    );
  }
  warnOnceUnreachable();
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
function FallbackMask({ maskLevel = 'mask', children, enabled: _enabled, ...vp }: MaskProps) {
  warnOnceFallback();
  // `style` isn't on MaskProps (Omit'd) but strip it at runtime too in case an
  // untyped caller passes one through a spread props bag.
  const { style: _style, ...safeProps } = vp as typeof vp & { style?: unknown };
  return (
    // Spread caller props FIRST, then force `mask` — this is a runtime
    // privacy defense so an untyped caller's stray `mask` prop can never
    // override the fail-closed value.
    <AmpMaskView {...safeProps} mask={ampMaskViewMaskProp(maskLevel)}>
      {children}
    </AmpMaskView>
  );
}
function FallbackUnmask({ children, ...vp }: UnmaskProps) {
  warnOnceFallback();
  // `enabled`/`style` aren't on UnmaskProps but strip them at runtime too in
  // case an untyped caller passes them through a spread props bag.
  const { style: _style, enabled: _enabled, ...safeProps } = vp as typeof vp & { style?: unknown; enabled?: boolean };
  return (
    // Spread caller props FIRST, then force `mask` — this is a runtime
    // privacy defense so an untyped caller's stray `mask` prop can never
    // override the fail-closed value.
    <AmpMaskView {...safeProps} mask="amp-unmask">
      {children}
    </AmpMaskView>
  );
}

const NeitherAvailable = RECORDER_PRESENT ? UnmaskableGuard : Passthrough;

export const AmpMask = FABRIC_AVAILABLE ? MaskImpl : PAPER_MASK_AVAILABLE ? FallbackMask : NeitherAvailable;
export const AmpUnmask = FABRIC_AVAILABLE ? UnmaskImpl : PAPER_MASK_AVAILABLE ? FallbackUnmask : NeitherAvailable;
