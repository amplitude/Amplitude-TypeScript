export interface UserSession {
  userId?: string;
  deviceId?: string;
  sessionId?: number;
  lastEventTime?: number;
  optOut: boolean;
  lastEventId?: number;
}

export interface SessionManagerOptions {
  apiKey: string;
  sessionTimeout: number;
}

export interface SessionManager {
  setSession(session: UserSession): void;
  getSessionId(): number | undefined;
  setSessionId(sessionId?: number): void;
  getDeviceId(): string | undefined;
  setDeviceId(deviceId?: string): void;
  getUserId(): string | undefined;
  setUserId(userId?: string): void;
  getLastEventTime(): number | undefined;
  setLastEventTime(lastEventTime?: number): void;
  getOptOut(): boolean;
  setOptOut(optOut: boolean): void;
  getLastEventId(): number | undefined;
  setLastEventId(lastEventId: number): void;
}
