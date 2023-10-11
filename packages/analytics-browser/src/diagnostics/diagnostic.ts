import { BaseDiagnostic } from '@amplitude/analytics-core';

export class BrowserDiagnostic extends BaseDiagnostic {
  async flush(): Promise<void> {
    await fetch(this.serverUrl, this.requestPayloadBuilder(this.queue));
    await super.flush();
  }
}
