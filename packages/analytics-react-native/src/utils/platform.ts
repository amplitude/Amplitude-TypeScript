import { Platform } from 'react-native';

export const isWeb = (): boolean => {
  return Platform.OS === 'web';
};

export const isNative = (): boolean => {
  return !isWeb();
};
