import React from 'react';
import { AmpMaskView } from '../amp-mask-view';
import { ampMaskViewMaskProp } from '../Mask.types';
import type { MaskProps, UnmaskProps } from '../Mask.types';

const MSG = '<AmpMask> requires the New Architecture. Use <AmpMaskView> on the Old Architecture.';
let warned = false;
function warnOnce() {
  if (!warned) {
    warned = true;
    console.error(
      '[AmpMask] Old Architecture detected — falling back to AmpMaskView (layout-unsafe). Use <AmpMaskView> on Old Arch.',
    );
  }
}
export function AmpMask({ maskLevel = 'mask', children, enabled: _enabled, ...vp }: MaskProps) {
  if (__DEV__) throw new Error(MSG);
  warnOnce();
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
export function AmpUnmask({ children, ...vp }: UnmaskProps) {
  if (__DEV__) throw new Error(MSG);
  warnOnce();
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
