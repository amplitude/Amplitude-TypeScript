import type { ViewProps } from 'react-native';
import type { ReactNode } from 'react';

/** Masking level for `<AmpMask>`. See {@link MaskProps.maskLevel}. */
export type AmpMaskLevel = 'mask' | 'block';

/**
 * Props for `<AmpMask>`, which masks its children in Session Replay
 * recordings without affecting their layout.
 *
 * `style` is not supported: the wrapper is layout-transparent and never
 * carries a layout box of its own, so styles would have no effect.
 */
export interface MaskProps extends Omit<ViewProps, 'style'> {
  /**
   * When false, children are rendered without masking.
   * @default true
   */
  enabled?: boolean;

  /**
   * Masking level applied to children. On iOS, 'mask' and 'block' currently
   * behave identically (both fully block).
   * @default 'mask'
   */
  maskLevel?: AmpMaskLevel;

  children?: ReactNode;
}

/**
 * Props for `<AmpUnmask>`, which exempts its children from masking inside a
 * masked region, without affecting their layout.
 *
 * `style` is not supported: the wrapper is layout-transparent and never
 * carries a layout box of its own, so styles would have no effect.
 */
export interface UnmaskProps extends Omit<ViewProps, 'style'> {
  children?: ReactNode;
}

/** Maps the public {@link AmpMaskLevel} to the `<AmpMaskView>` `mask` prop value. */
export function ampMaskViewMaskProp(level?: AmpMaskLevel): 'amp-mask' | 'amp-block' {
  return level === 'block' ? 'amp-block' : 'amp-mask';
}
