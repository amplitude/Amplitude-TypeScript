import { createAmpMaskViewFallback } from '../mask-fallback';
import type { MaskProps, UnmaskProps } from '../Mask.types';

const MSG = '<AmpMask> requires the New Architecture. Use <AmpMaskView> on the Old Architecture.';
const WARNING =
  '[AmpMask] Old Architecture detected — falling back to AmpMaskView (layout-unsafe). Use <AmpMaskView> on Old Arch.';

/**
 * Old-Architecture guard: dev builds throw (the developer is using an
 * unsupported component); production falls back to `<AmpMaskView>` —
 * privacy-safe but layout-unsafe. `enabled` is ignored: the fallback fails
 * toward privacy.
 */
export const AmpMask = createAmpMaskViewFallback<MaskProps>({
  mask: 'from-maskLevel',
  warning: WARNING,
  devThrowMessage: MSG,
});

export const AmpUnmask = createAmpMaskViewFallback<UnmaskProps>({
  mask: 'amp-unmask',
  warning: WARNING,
  devThrowMessage: MSG,
});
