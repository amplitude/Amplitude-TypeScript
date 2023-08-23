export const isNewSession = (sessionTimeout: number, lastEventTime?: number): boolean => {
  const _currentTime = Date.now();
  const _lastEventTime = lastEventTime || Date.now();
  const timeSinceLastEvent = _currentTime - _lastEventTime;

  return timeSinceLastEvent > sessionTimeout;
};
