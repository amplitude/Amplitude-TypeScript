/**
 * @deprecated Function name is misleading. Use `isSessionExpired`.
 */
export const isNewSession = (sessionTimeout: number, lastEventTime: number = Date.now()): boolean =>
  isSessionExpired(sessionTimeout, lastEventTime);

export const isSessionExpired = (sessionTimeout: number, lastEventTime: number = Date.now()): boolean => {
  const currentTime = Date.now();
  const timeSinceLastEvent = currentTime - lastEventTime;

  return timeSinceLastEvent > sessionTimeout;
};
