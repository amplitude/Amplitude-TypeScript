export interface UserSession {
  userId?: string;
  deviceId?: string;
  sessionId?: number;
  deferredSessionId?: number;
  lastEventTime?: number;
  optOut: boolean;
  lastEventId?: number;
  pageCounter?: number;
  debugLogsEnabled?: boolean;
  cookieDomain?: string;
}
