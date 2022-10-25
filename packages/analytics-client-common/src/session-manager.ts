import { UserSession, Storage, SessionManager as ISessionManager } from '@amplitude/analytics-types';
import { getCookieName as getStorageKey } from './cookie-name';

export class SessionManager implements ISessionManager {
  storageKey: string;
  cache: UserSession;
  isSessionCacheValid = true;

  constructor(private storage: Storage<UserSession>, apiKey: string) {
    this.storageKey = getStorageKey(apiKey);
    this.cache = { optOut: false };
  }

  /**
   * load() must be called immediately after instantation
   *
   * ```ts
   * await new SessionManager(...).load();
   * ```
   */
  async load() {
    this.cache = (await this.storage.get(this.storageKey)) ?? {
      optOut: false,
    };
    console.debug(`SessionManager.cache loaded with: ${JSON.stringify(this.cache)}`);
    return this;
  }

  setSession(session: Partial<UserSession>) {
    this.cache = { ...this.cache, ...session };
    try {
      console.debug(`SessionManager.setSession called with: ${JSON.stringify(this.cache)}.`);
      void this.storage.set(this.storageKey, this.cache);
    } catch (e) {
      console.debug(`SessionManager.setSession failed with: ${String(e)}.`);
    }
  }

  getSessionId() {
    this.isSessionCacheValid = true;
    void this.storage.get(this.storageKey).then((userSession) => {
      // Checks if session id has been set since the last get
      if (this.isSessionCacheValid) {
        this.cache.sessionId = userSession?.sessionId;
      }
    });
    return this.cache.sessionId;
  }

  setSessionId(sessionId: number) {
    // Flags session id has been set
    this.isSessionCacheValid = false;
    this.setSession({ sessionId });
  }

  getDeviceId(): string | undefined {
    return this.cache.deviceId;
  }

  setDeviceId(deviceId: string): void {
    this.setSession({ deviceId });
  }

  getUserId(): string | undefined {
    return this.cache.userId;
  }

  setUserId(userId: string): void {
    this.setSession({ userId });
  }

  getLastEventTime() {
    return this.cache.lastEventTime;
  }

  setLastEventTime(lastEventTime: number) {
    this.setSession({ lastEventTime });
  }

  getOptOut(): boolean {
    return this.cache.optOut;
  }

  setOptOut(optOut: boolean): void {
    this.setSession({ optOut });
  }
}
