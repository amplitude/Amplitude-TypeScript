import { Config, CoreClient, DiagnosticPlugin, Event, Result } from '@amplitude/analytics-types';
import fetch from 'node-fetch';

export class Diagnostic implements DiagnosticPlugin {
  name = '@amplitude/plugin-diagnostic';
  type = 'destination' as const;

  constructor() {
    // do something
  }

  execute(_context: Event): Promise<Result> {
    throw new Error('Method not implemented.');
    // it is called by timeline when client.track()
    // do nothing when execute is called
  }
  flush?(): Promise<void> {
    throw new Error('Method not implemented.');
    // should flush all unsent events
  }
  setup?(_config: Config, _client: CoreClient): Promise<void> {
    throw new Error('Method not implemented.');
  }
  teardown?(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  async track(eventCount: number, code: number, message: string) {
    // add event to queue
    // https://github.com/amplitude/Amplitude-TypeScript/blob/502a080b6eca2bc390b5d8076f24b9137d213f89/packages/analytics-core/src/plugins/destination.ts#L70-L80

    const payload = {
      time: Date.now(),
      event_properties: {
        response_error_code: code,
        trigger: message,
        action: 'drop events',
        event_count: eventCount,
      },
      library: 'diagnostic-test-library',
    };

    const serverUrl = 'http://localhost:8000';

    const body = {
      headers: {
        'Content-Type': 'application/json',
        Accept: '*/*',
      },
      body: JSON.stringify(payload),
      method: 'POST',
    };

    await fetch(serverUrl, body);
  }
}
