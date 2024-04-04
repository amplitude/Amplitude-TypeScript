import { Logger as ILogger } from '@amplitude/analytics-types';
import { generateSessionReplayId } from './helpers';
import { SessionIdentifiers as ISessionIdentifiers, SessionReplayOptions } from './typings/session-replay';

export class SessionIdentifiers implements ISessionIdentifiers {
  deviceId?: string | undefined;
  sessionId?: number | undefined;
  sessionReplayId?: string | undefined;

  constructor(options: SessionReplayOptions, loggerProvider: ILogger) {
    this.deviceId = options.deviceId;
    this.sessionId = options.sessionId;

    if (options.sessionId && options.deviceId) {
      this.sessionReplayId = generateSessionReplayId(options.sessionId, options.deviceId);
    } else {
      loggerProvider.error('Please provide both sessionId and deviceId.');
    }
  }
}
