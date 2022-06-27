import {
  UserSession,
  Storage,
  SessionManager as ISessionManager,
  SessionManagerOptions,
} from '@amplitude/analytics-types';
import { getCookieName as getStorageKey } from './utils/cookie-name';

export class SessionManager implements ISessionManager {
  storageKey: string;
  sessionTimeout: number;
  cache: UserSession;
  // Used for testing
  ready: Promise<void>;

  constructor(private storage: Storage<UserSession>, options: SessionManagerOptions) {
    this.storageKey = getStorageKey(options.apiKey);
    this.sessionTimeout = options.sessionTimeout;
    this.cache = {} as UserSession;
    // Load the cache asynchronously. Values set before the cache loads are
    // preferred over storage.
    this.ready = this.storage.get(this.storageKey).then((userSession) => {
      // Strip existing but undefined fields from cache, otherwise spreading
      // will overwrite a value with undefined.
      Object.keys(this.cache).forEach((key) => {
        if (typeof this.cache[key as keyof UserSession] === 'undefined') {
          delete this.cache[key as keyof UserSession];
        }
      });
      this.cache = { ...userSession, ...this.cache } ?? { optOut: false };
    });
  }

  setSession(session: Partial<UserSession>) {
    this.cache = { ...this.cache, ...session };
    void this.storage.set(this.storageKey, this.cache);
  }

  getSessionId() {
    void this.storage.get(this.storageKey).then((userSession) => {
      if (this.cache) {
        this.cache.sessionId = userSession?.sessionId;
      }
    });
    return this.cache.sessionId;
  }

  setSessionId(sessionId: number) {
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
