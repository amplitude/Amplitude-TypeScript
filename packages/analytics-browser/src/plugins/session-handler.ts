import { BeforePlugin, BrowserClient, BrowserConfig, Event } from '@amplitude/analytics-types';
import { DEFAULT_SESSION_END_EVENT, DEFAULT_SESSION_START_EVENT } from '../constants';

export const sessionHandlerPlugin = (): BeforePlugin => {
  // browserConfig is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let browserConfig: BrowserConfig;
  // amplitude is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let amplitude: BrowserClient;

  const name = '@amplitude/plugin-session-handler';

  const type = 'before';

  const setup = async (config: BrowserConfig, client: BrowserClient) => {
    browserConfig = config;
    amplitude = client;
  };

  const execute = async (event: Event) => {
    const now = Date.now();

    if (event.event_type === DEFAULT_SESSION_START_EVENT || event.event_type === DEFAULT_SESSION_END_EVENT) {
      browserConfig.lastEventTime = now;
      return event;
    }

    const lastEventTime = browserConfig.lastEventTime || now;
    const timeSinceLastEvent = now - lastEventTime;

    if (timeSinceLastEvent > browserConfig.sessionTimeout) {
      // assigns new session
      amplitude.setSessionId(now);
      event.session_id = amplitude.getSessionId();
      event.time = now;
    } // else use existing session

    // updates last event time to extend time-based session
    browserConfig.lastEventTime = now;

    return event;
  };

  return {
    name,
    type,
    setup,
    execute,
  };
};
