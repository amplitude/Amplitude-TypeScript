import { BrowserClient, BrowserConfig, EnrichmentPlugin, Event, PluginType } from '@amplitude/analytics-types';
import { record } from 'rrweb';
import { CreateSessionReplayPlugin, Options } from './typings/session-replay';

export const SESSION_REPLAY_SERVER_URL = 'https://api2.amplitude.com/sessions/track';

export const sessionReplayPlugin: CreateSessionReplayPlugin = function (options: Options = {}) {
  let amplitudeConfig: BrowserConfig | undefined;
  // let amplitude: BrowserClient | undefined;

  options = {
    ...options,
  };

  let events: string[] = [];

  const plugin: EnrichmentPlugin = {
    name: '@amplitude/plugin-session-replay',
    type: PluginType.ENRICHMENT,

    setup: async function (config: BrowserConfig, client: BrowserClient) {
      console.log('in setup', 'config', config, 'client', client);
      amplitudeConfig = config;

      config.loggerProvider.log('Installing @amplitude/plugin-session-replay.');
    },

    execute: async (event: Event) => {
      console.log('event', event);
      // todo: this should be a constant/type
      if (event.event_type === 'session_start') {
        record({
          emit(event) {
            events.push(JSON.stringify(event));
          },
          maskAllInputs: true,
        });
      }

      if (event.event_type === 'session_end' && events.length) {
        const payload = {
          api_key: amplitudeConfig?.apiKey,
          device_id: amplitudeConfig?.deviceId,
          session_id: amplitudeConfig?.sessionId,
          start_timestamp: amplitudeConfig?.sessionId,
          events_batch: {
            version: 1,
            events,
            seq_number: 1,
          },
        };

        const options: RequestInit = {
          headers: {
            'Content-Type': 'application/json',
            Accept: '*/*',
          },
          body: JSON.stringify(payload),
          method: 'POST',
        };
        events = [];
        const res = await fetch(SESSION_REPLAY_SERVER_URL, options);
        console.log('res', res);
      }

      return event;
    },
  };

  return plugin;
};
