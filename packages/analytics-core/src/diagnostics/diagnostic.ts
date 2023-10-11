import { Diagnostic as IDiagnostic, DiagnosticOptions } from '@amplitude/analytics-types';
import { DIAGNOSTIC_ENDPOINT } from '../constants';
import { DiagnosticEvent } from './typings';
import { DIAGNOSTIC_METADATA_TYPE } from './constants';

export class Diagnostic implements IDiagnostic {
  isDisabled = false;
  serverUrl: string = DIAGNOSTIC_ENDPOINT;
  apiKey?: string = '';
  queue: DiagnosticEvent[] = [];

  private scheduled: ReturnType<typeof setTimeout> | null = null;
  // deault delay is 1 minute
  // make it private to prevent users from changing it to smaller value
  private delay = 60000;

  constructor(options?: DiagnosticOptions) {
    this.isDisabled = options && options.isDisabled ? options.isDisabled : false;
    this.serverUrl = options && options.serverUrl ? options.serverUrl : DIAGNOSTIC_ENDPOINT;
    if (options && options.apiKey) {
      this.apiKey = options.apiKey;
    }
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
      api_key: this.apiKey || '',
      omni_metrics: {
        metadata_type: DIAGNOSTIC_METADATA_TYPE,
        library: 'amplitude-ts',
        accounting_time_min: Date.now(),
        response_code: code,
        trigger: message,
        action: 'drop events',
        event_count: eventCount,
      },
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
