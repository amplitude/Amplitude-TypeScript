import { getGlobalScope } from '@amplitude/analytics-client-common';
import { BaseTransport } from '@amplitude/analytics-core';
import { Payload, Response, Transport } from '@amplitude/analytics-types';

export class SendBeaconTransport extends BaseTransport implements Transport {
  async send(serverUrl: string, payload: Payload): Promise<Response | null> {
    return new Promise((resolve, reject) => {
      const globalScope = getGlobalScope();
      /* istanbul ignore if */
      if (!globalScope?.navigator.sendBeacon) {
        throw new Error('SendBeaconTransport is not supported');
      }
      try {
        const data = JSON.stringify(payload);
        const success = globalScope.navigator.sendBeacon(serverUrl, JSON.stringify(payload));
        if (success) {
          return resolve(
            this.buildResponse({
              code: 200,
              events_ingested: payload.events.length,
              payload_size_bytes: data.length,
              server_upload_time: Date.now(),
            }),
          );
        }
        return resolve(this.buildResponse({ code: 500 }));
      } catch (e) {
        reject(e);
      }
    });
  }
}
