export interface UserSession {
  userId?: string;
  deviceId?: string;
  sessionId?: number;
  lastEventTime?: number;
}

export interface Storage<T> {
  isEnabled(): boolean;
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  remove(key: string): void;
  reset(): void;
}

export interface CookieStorageOptions {
  domain?: string;
  expirationDays?: number;
  sameSite?: string;
  secure?: boolean;
}
