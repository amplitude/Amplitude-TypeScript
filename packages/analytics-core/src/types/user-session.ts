export interface UserSession {
  userId?: string;
  deviceId?: string;
  sessionId?: number;
  deferredSessionId?: number;
  lastEventTime?: number;
  lastWriteTime?: number;
  optOut: boolean;
  lastEventId?: number;
  pageCounter?: number;
  debugLogsEnabled?: boolean;
  cookieDomain?: string;
}
