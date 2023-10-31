import { getGlobalScope } from '@amplitude/analytics-client-common';
import { UNMASK_TEXT_CLASS } from './constants';

export const maskInputFn = (text: string, element: HTMLElement) => {
  if (element.classList?.contains(UNMASK_TEXT_CLASS)) {
    return text;
  }
  return '*'.repeat(text.length);
};

export const generateHashCode = function (str: string) {
  let hash = 0;
  if (str.length === 0) return hash;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return hash;
};

export const isSessionInSample = function (sessionId: number, sampleRate: number) {
  const hashNumber = generateHashCode(sessionId.toString());
  const absHash = Math.abs(hashNumber);
  const absHashMultiply = absHash * 31;
  const mod = absHashMultiply % 100;
  return mod / 100 < sampleRate;
};

export const getCurrentUrl = () => {
  const globalScope = getGlobalScope();
  return globalScope?.location ? globalScope.location.href : '';
};

export const generateSessionReplayId = (sessionId: number, deviceId: string): string => {
  return `${deviceId}/${sessionId}`;
};

export const parseSessionReplayId = (
  sessionReplayId: string | undefined,
): { deviceId?: string; sessionId?: string } => {
  if (!sessionReplayId) {
    return {};
  }

  const parts = sessionReplayId.split('/');
  if (parts.length === 2) {
    const [deviceId, sessionId] = sessionReplayId.split('/');
    return { deviceId, sessionId };
  }

  return {};
};
