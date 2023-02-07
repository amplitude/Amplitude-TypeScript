export interface UserSession {
  userId?: string;
  deviceId?: string;
  sessionId?: number;
  lastEventTime?: number;
  optOut: boolean;
  lastEventId?: number;
}
