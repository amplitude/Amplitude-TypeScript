import { Diagnostic as IDiagnostic, Event, Result } from '@amplitude/analytics-types';

interface DiagnosticEvent {
  time: number;
  event_properties: {
    response_error_code: number;
    trigger: string;
    action: string;
    event_count: number;
  };
  library: string;
}

export class Diagnostic implements IDiagnostic {
  public serverUrl = 'http://localhost:8000';

  queue: DiagnosticEvent[] = [];
  private scheduled: ReturnType<typeof setTimeout> | null = null;
  delay = 60000; // deault delay is 1 minute

  track(eventCount: number, code: number, message: string) {
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
