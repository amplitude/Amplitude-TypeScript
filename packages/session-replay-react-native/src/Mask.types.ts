import type { ViewProps } from 'react-native';
import type { ReactNode } from 'react';

export type AmpMaskLevel = 'mask' | 'block';

export interface MaskProps extends ViewProps {
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

export interface UnmaskProps extends ViewProps {
  children?: ReactNode;
}
