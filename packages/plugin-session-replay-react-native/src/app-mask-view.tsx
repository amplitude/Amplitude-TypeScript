import { requireNativeComponent, type ViewProps } from 'react-native';

interface AmpMaskViewProps extends ViewProps {
  mask: 'amp-mask' | 'amp-unmask' | 'amp-block';
}

export const AmpMaskView =
  requireNativeComponent<AmpMaskViewProps>('RCTAmpMaskView');
