import React from 'react';
import { AmpMaskView } from '../amp-mask-view';
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
export function AmpMask({ maskLevel = 'mask', children, ...vp }: MaskProps) {
  if (__DEV__) throw new Error(MSG);
  warnOnce();
  return (
    <AmpMaskView mask={maskLevel === 'block' ? 'amp-block' : 'amp-mask'} {...vp}>
      {children}
    </AmpMaskView>
  );
}
export function AmpUnmask({ children, ...vp }: UnmaskProps) {
  if (__DEV__) throw new Error(MSG);
  warnOnce();
  return (
    <AmpMaskView mask="amp-unmask" {...vp}>
      {children}
    </AmpMaskView>
  );
}
