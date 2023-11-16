import { BaseDiagnostic } from '@amplitude/analytics-core';

export class BrowserDiagnostic extends BaseDiagnostic {
  isDisabled = false;

  async flush(): Promise<void> {
    await fetch(this.serverUrl, this.requestPayloadBuilder(this.queue));
    await super.flush();
  }
}
