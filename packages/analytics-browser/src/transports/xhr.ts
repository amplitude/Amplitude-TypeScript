import { buildResponse } from '@amplitude/analytics-core';
import { Payload, Response, Transport } from '@amplitude/analytics-types';

export class XHRTransport implements Transport {
  private state = {
    done: 4,
  };

  async send(serverUrl: string, payload: Payload): Promise<Response | null> {
    return new Promise((resolve, reject) => {
      /* istanbul ignore if */
      if (typeof XMLHttpRequest === 'undefined') {
        reject(new Error('XHRTransport is not supported.'));
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', serverUrl, true);
      xhr.onreadystatechange = () => {
        if (xhr.readyState === this.state.done) {
          try {
            const responsePayload = xhr.responseText;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const parsedResponsePayload: Record<string, any> = JSON.parse(responsePayload);
            const result = buildResponse(parsedResponsePayload);
            resolve(result);
          } catch (e) {
            reject(e);
          }
        }
      };
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Accept', '*/*');
      xhr.send(JSON.stringify(payload));
    });
  }
}
