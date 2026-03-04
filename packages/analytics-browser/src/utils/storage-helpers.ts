import { UserSession } from '@amplitude/analytics-core';

export const getMostRecentUserSession = (userSessions: UserSession[]): UserSession | null => {
  let mostRecent: UserSession | null = null;
  let mostRecentWriteTime = 0;
  for (const userSession of userSessions || []) {
    const lastWriteTime = userSession.lastWriteTime ?? userSession.lastEventTime ?? 0;
    if (!mostRecent || lastWriteTime > mostRecentWriteTime) {
      mostRecent = userSession;
      mostRecentWriteTime = lastWriteTime;
    }
  }
  return mostRecent;
};
