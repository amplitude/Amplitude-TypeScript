import { buildResponse } from '@amplitude/analytics-core';
import { Payload, Response, Transport } from '@amplitude/analytics-types';

export class SendBeaconTransport implements Transport {
  async send(serverUrl: string, payload: Payload): Promise<Response | null> {
    return new Promise((resolve, reject) => {
      /* istanbul ignore if */
      if (
        typeof window === 'undefined' ||
        typeof window.navigator === 'undefined' ||
        typeof window.navigator.sendBeacon === 'undefined'
      ) {
        throw new Error('BeaconTransport is not supported.');
      }
      try {
        const data = JSON.stringify(payload);
        const success = window.navigator.sendBeacon(serverUrl, JSON.stringify(payload));
        if (success) {
          return resolve(
            buildResponse({
              code: 200,
              events_ingested: payload.events.length,
              payload_size_bytes: data.length,
              server_upload_time: Date.now(),
            }),
          );
        }
        return resolve(buildResponse({ code: 500 }));
      } catch (e) {
        reject(e);
      }
    });
  }
}
