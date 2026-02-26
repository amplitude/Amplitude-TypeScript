import { BaseTransport, getGlobalScope, Payload, Response, Transport } from '@amplitude/analytics-core';

/**
 * SendBeacon does not support custom headers (e.g. Content-Encoding: gzip),
 * so request body compression is not applied even when enableRequestBodyCompression is true.
 */
export class SendBeaconTransport extends BaseTransport implements Transport {
  constructor() {
    super();
  }

  async send(serverUrl: string, payload: Payload, _enableRequestBodyCompression = false): Promise<Response | null> {
    return new Promise((resolve, reject) => {
      const globalScope = getGlobalScope();
      /* istanbul ignore if */
      if (!globalScope?.navigator.sendBeacon) {
        throw new Error('SendBeaconTransport is not supported');
      }
      try {
        const data = JSON.stringify(payload);
        // SendBeacon cannot set Content-Encoding, so we always send uncompressed
        const success = globalScope.navigator.sendBeacon(serverUrl, data);
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
