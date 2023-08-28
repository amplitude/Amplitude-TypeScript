import { DiagnosticEvent, DiagnosticPlugin, Event, Result } from '@amplitude/analytics-types';

export class Diagnostic implements DiagnosticPlugin {
  name = '@amplitude/plugin-diagnostic';
  type = 'destination' as const;
  public serverUrl = new URL('http://localhost:8000');

  queue: DiagnosticEvent[] = [];
  scheduled: ReturnType<typeof setTimeout> | null = null;
  delay = 60000; // deault delay is 1 minute

  async track(eventCount: number, code: number, message: string) {
    this.queue.push(this.diagnosticEventBuilder(eventCount, code, message));

    if (!this.scheduled) {
      this.scheduled = setTimeout(() => {
        void this.flush();
      }, this.delay);
    }
  }

  async flush(): Promise<void> {
    // send http request based on environment
    // implemented in its child class

    if (this.scheduled) {
      clearTimeout(this.scheduled);
      this.scheduled = null;
    }
  }

  diagnosticEventBuilder(eventCount: number, code: number, message: string): DiagnosticEvent {
    return {
      time: Date.now(),
      event_properties: {
        response_error_code: code,
        trigger: message,
        action: 'drop events',
        event_count: eventCount,
      },
      library: 'diagnostic-test-library',
    };
  }

  requestPayloadBuilder(events: DiagnosticEvent[]): object {
    return {
      headers: {
        'Content-Type': 'application/json',
        Accept: '*/*',
      },
      events: events,
      method: 'POST',
    };
  }

  execute(_context: Event): Promise<Result> {
    return Promise.resolve({
      event: { event_type: 'diagnostic event' },
      code: -1,
      message: 'this method should not be called, use track() instead',
    });
    // this method is not implemented
    // it's kept here to satisfy the interface
    // track() should be used instead
  }
}
