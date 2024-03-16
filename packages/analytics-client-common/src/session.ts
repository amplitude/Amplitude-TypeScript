export const isNewSession = (sessionTimeout: number, lastEventTime: number = Date.now()): boolean => {
  const currentTime = Date.now();
  const timeSinceLastEvent = currentTime - lastEventTime;
  return timeSinceLastEvent > sessionTimeout;
};
