import { generateSessionReplayId } from './helpers';
import { SessionIdentifiers as ISessionIdentifiers } from './typings/session-replay';

export class SessionIdentifiers implements ISessionIdentifiers {
  deviceId?: string | undefined;
  sessionId?: number | undefined;
  sessionReplayId?: string | undefined;

  constructor({ sessionId, deviceId }: { sessionId?: number; deviceId?: string }) {
    this.deviceId = deviceId;
    this.sessionId = sessionId;

    if (sessionId && deviceId) {
      this.sessionReplayId = generateSessionReplayId(sessionId, deviceId);
    }
  }
}
