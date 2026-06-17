/* eslint-disable import/namespace, import/default, import/no-named-as-default, import/no-named-as-default-member */
import type { ViewProps } from 'react-native';
import type { WithDefault } from 'react-native/Libraries/Types/CodegenTypes';
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';

export interface NativeProps extends ViewProps {
  enabled?: WithDefault<boolean, true>;
  unmask?: WithDefault<boolean, false>;
  maskLevel?: WithDefault<string, 'medium'>;
}

export default codegenNativeComponent<NativeProps>('SRMaskView');
