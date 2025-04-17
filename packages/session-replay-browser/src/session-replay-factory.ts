import { debugWrapper, LogConfig } from '@amplitude/analytics-core';
import { getDefaultConfig } from './config/local-config';
import { SessionReplay } from './session-replay';
import { AmplitudeSessionReplay } from './typings/session-replay';

export const getLogConfig = (sessionReplay: SessionReplay) => (): LogConfig => {
  const { config } = sessionReplay;
  const { loggerProvider: logger, logLevel } = config || getDefaultConfig();
  return {
    logger,
    logLevel,
  };
};

export const createInstance: () => AmplitudeSessionReplay = () => {
  const sessionReplay = new SessionReplay();
  return {
    init: debugWrapper(sessionReplay.init.bind(sessionReplay), 'init', getLogConfig(sessionReplay)),
    setSessionId: debugWrapper(
      sessionReplay.setSessionId.bind(sessionReplay),
      'setSessionId',
      getLogConfig(sessionReplay),
    ),
    getSessionId: debugWrapper(
      sessionReplay.getSessionId.bind(sessionReplay),
      'getSessionId',
      getLogConfig(sessionReplay),
    ),
    getSessionReplayProperties: debugWrapper(
      sessionReplay.getSessionReplayProperties.bind(sessionReplay),
      'getSessionReplayProperties',
      getLogConfig(sessionReplay),
    ),
    flush: debugWrapper(sessionReplay.flush.bind(sessionReplay), 'flush', getLogConfig(sessionReplay)),
    shutdown: debugWrapper(sessionReplay.shutdown.bind(sessionReplay), 'shutdown', getLogConfig(sessionReplay)),
  };
};

export default createInstance();
