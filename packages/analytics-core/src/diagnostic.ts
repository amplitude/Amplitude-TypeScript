import { Diagnostic as IDiagnostic, DiagnosticOptions } from '@amplitude/analytics-types';
import { DIAGNOSTIC_ENDPOINT } from './constants';

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
  isDisabled = false;
  serverUrl: string = DIAGNOSTIC_ENDPOINT;
  queue: DiagnosticEvent[] = [];

  private scheduled: ReturnType<typeof setTimeout> | null = null;
  // deault delay is 1 minute
  // make it private to prevent users from changing it to smaller value
  private delay = 60000;

  constructor(options?: DiagnosticOptions) {
    this.isDisabled = options && options.isDisabled ? options.isDisabled : false;
    this.serverUrl = options && options.serverUrl ? options.serverUrl : DIAGNOSTIC_ENDPOINT;
  }

  track(eventCount: number, code: number, message: string) {
    if (this.isDisabled) {
      return;
    }

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
}
