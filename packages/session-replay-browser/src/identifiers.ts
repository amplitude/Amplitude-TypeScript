import { generateSessionReplayId } from './helpers';
import { SessionIdentifiers as ISessionIdentifiers } from './typings/session-replay';

export class SessionIdentifiers implements ISessionIdentifiers {
  deviceId: string;
  sessionId: number;
  sessionReplayId: string;

  constructor({ sessionId, deviceId }: { sessionId: number; deviceId: string }) {
    this.deviceId = deviceId;
    this.sessionId = sessionId;
    this.sessionReplayId = generateSessionReplayId(sessionId, deviceId);
  }
}
