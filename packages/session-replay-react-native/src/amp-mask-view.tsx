import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';
import NativeAmpMaskView from './specs/AmpMaskViewNativeComponent';

export interface AmpMaskViewProps extends ViewProps {
  mask: 'amp-mask' | 'amp-unmask' | 'amp-block';
}

// A normal layout node (lays out exactly like a plain <View>) that tags itself
// for the Session Replay recorder. On the New Architecture it is a real Fabric
// component, so it does not go through React Native's legacy-interop layer
// (whose out-of-band re-parenting mis-renders nested mask/unmask subtrees).
// The spec widens `mask` to string for codegen; the public prop stays required
// and union-typed.
export const AmpMaskView = NativeAmpMaskView as ComponentType<AmpMaskViewProps>;
