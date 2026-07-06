import type { ViewProps } from 'react-native';
import type { ReactNode } from 'react';

export type AmpMaskLevel = 'mask' | 'block';

/**
 * `style` is intentionally unsupported: the mask wrapper never carries a
 * layout box (it is layout-transparent), and the Fabric implementation
 * force-overrides `style` at runtime regardless of what is passed.
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
 * `style` is intentionally unsupported: the mask wrapper never carries a
 * layout box (it is layout-transparent), and the Fabric implementation
 * force-overrides `style` at runtime regardless of what is passed.
 */
export interface UnmaskProps extends Omit<ViewProps, 'style'> {
  children?: ReactNode;
}

// The one runtime export in this otherwise type-only module: shared by
// MaskPaper and MaskFabric's fallback components so the mask-level mapping
// isn't duplicated.
export function ampMaskViewMaskProp(level?: AmpMaskLevel): 'amp-mask' | 'amp-block' {
  return level === 'block' ? 'amp-block' : 'amp-mask';
}
