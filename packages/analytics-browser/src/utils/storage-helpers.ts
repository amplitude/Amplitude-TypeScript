import { CookieStorage, getCookieName, UserSession } from '@amplitude/analytics-core';

export const getMostRecentUserSession = (userSessions: UserSession[]): UserSession | undefined => {
  let mostRecent: UserSession | undefined = undefined;
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

export const getMostRecentUserSessionFromCookieStorage = async (
  apiKey: string,
  cookieStorage: CookieStorage<UserSession>,
): Promise<UserSession | undefined> => {
  const userSessions = await cookieStorage.getAll(getCookieName(apiKey));
  return getMostRecentUserSession(userSessions);
};
