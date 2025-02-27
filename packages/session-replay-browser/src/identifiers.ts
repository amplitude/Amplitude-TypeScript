import { generateSessionReplayId } from './helpers';
import { SessionIdentifiers as ISessionIdentifiers } from './typings/session-replay';

export class SessionIdentifiers implements ISessionIdentifiers {
  deviceId?: string;
  sessionId?: string | number;
  sessionReplayId?: string;

  constructor({ sessionId, deviceId }: { sessionId?: string | number; deviceId?: string }) {
    this.deviceId = deviceId;
    this.sessionId = sessionId;

    if (sessionId && deviceId) {
      this.sessionReplayId = generateSessionReplayId(sessionId, deviceId);
    }
  }
}
