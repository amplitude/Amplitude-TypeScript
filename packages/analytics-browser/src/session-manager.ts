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

  constructor(private storage: Storage<UserSession>, options: SessionManagerOptions) {
    this.storageKey = getStorageKey(options.apiKey);
    this.sessionTimeout = options.sessionTimeout;
    this.cache = this.storage.get(this.storageKey) ?? {
      optOut: false,
    };
  }

  setSession(session: Partial<UserSession>) {
    this.cache = { ...this.cache, ...session };
    this.storage.set(this.storageKey, this.cache);
  }

  getSessionId() {
    // Note: always read directly from storage
    return this.storage.get(this.storageKey)?.sessionId;
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
