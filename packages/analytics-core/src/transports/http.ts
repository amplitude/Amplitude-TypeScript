import { Payload, Response, Transport } from '@amplitude/analytics-types';
import * as http from 'http';
import { BaseTransport } from './base';

export class Http extends BaseTransport implements Transport {
  send(serverUrl: string, payload: Payload): Promise<Response | null> {
    const url = new URL(serverUrl);
    const requestPayload = JSON.stringify(payload);
    const options = {
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestPayload),
      },
      hostname: url.hostname,
      method: 'POST',
      path: url.pathname,
      port: url.port,
      protocol: url.protocol,
    };
    return new Promise((resolve) => {
      const req = http.request(options, (res) => {
        res.setEncoding('utf8');
        let responsePayload = '';
        res.on('data', (chunk: string) => {
          responsePayload += chunk;
        });

        res.on('end', () => {
          if (res.complete && responsePayload.length > 0) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              const parsedResponsePayload: Record<string, any> = JSON.parse(responsePayload);
              const result = this.buildResponse(parsedResponsePayload);
              resolve(result);
              return;
            } catch {
              resolve(null);
            }
          }
        });
      });
      req.on('error', this.buildResponse.bind(this));
      req.end(requestPayload);
    });
  }
}
