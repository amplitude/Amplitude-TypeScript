/* eslint-disable import/namespace, import/default, import/no-named-as-default, import/no-named-as-default-member */
import type { ViewProps } from 'react-native';
import type { WithDefault } from 'react-native/Libraries/Types/CodegenTypes';
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';

export interface NativeProps extends ViewProps {
  // 'amp-mask' | 'amp-unmask' | 'amp-block' as a codegen-compatible string;
  // unknown values fail safe to masking.
  mask?: WithDefault<string, 'amp-mask'>;
}

// Same native name on both architectures: on the New Architecture this resolves
// to the Fabric AMPMaskComponentView (ios/fabric, android/src/newarch); on the
// old architecture codegenNativeComponent falls back to
// requireNativeComponent('AMPMaskComponentView'), which resolves to the
// unchanged legacy Paper view managers.
export default codegenNativeComponent<NativeProps>('AMPMaskComponentView');
