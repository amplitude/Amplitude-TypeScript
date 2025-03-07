import { AMPLITUDE_PREFIX } from '../constants';

export const getStorageKey = (apiKey: string, postKey = '', limit = 10) => {
  return [AMPLITUDE_PREFIX, postKey, apiKey.substring(0, limit)].filter(Boolean).join('_');
};
