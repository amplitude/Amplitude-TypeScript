import { Diagnostic as CoreDiagnostic } from '@amplitude/analytics-core';

export class Diagnostic extends CoreDiagnostic {
  async flush(): Promise<void> {
    await fetch(this.serverUrl, this.requestPayloadBuilder(this.queue));
    await super.flush();
  }
}
