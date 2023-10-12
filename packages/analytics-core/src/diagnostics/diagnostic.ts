import { Diagnostic, DiagnosticOptions } from '@amplitude/analytics-types';
import { DIAGNOSTIC_ENDPOINT } from '../diagnostics/constants';
import { DiagnosticOmniMetrics } from './typings';
import { DIAGNOSTIC_METADATA_TYPE } from './constants';

export class BaseDiagnostic implements Diagnostic {
  isDisabled = false;
  serverUrl: string = DIAGNOSTIC_ENDPOINT;
  apiKey?: string = '';
  queue: DiagnosticOmniMetrics[] = [];

  private scheduled: ReturnType<typeof setTimeout> | null = null;
  // deault delay is 1 minute
  // make it private to prevent users from changing it to smaller value
  private delay = 60000;

  constructor(options?: DiagnosticOptions) {
    this.isDisabled = options && options.isDisabled ? options.isDisabled : false;
    this.serverUrl = options && options.serverUrl ? options.serverUrl : DIAGNOSTIC_ENDPOINT;
    this.apiKey = options && options.apiKey ? options.apiKey : '';
  }

  track(eventCount: number, code: number, message: string) {
    if (this.isDisabled) {
      return;
    }

    this.queue.push(this.diagnosticRequestBuilder(eventCount, code, message));

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

  diagnosticRequestBuilder(eventCount: number, code: number, message: string): DiagnosticOmniMetrics {
    return {
      metadata_type: DIAGNOSTIC_METADATA_TYPE,
      library: 'amplitude-ts',
      accounting_time_min: Date.now(),
      response_code: code,
      trigger: message,
      action: 'drop events',
      event_count: eventCount,
    };
  }

  requestPayloadBuilder(events: DiagnosticOmniMetrics[]): object {
    return {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: this.apiKey || '',
        omni_metrics: events,
      }),
    };
  }
}
