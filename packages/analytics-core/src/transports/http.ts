import { HttpResponse, Transport, TransportResponse } from '@amplitude/analytics-types';
import * as http from 'http';
import { buildResponse } from '../utils/response-builder';
import { UnexpectedError } from '../response';

export class Http implements Transport {
  send(serverUrl: string, payload: Record<string, any>): Promise<TransportResponse> {
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
    return new Promise((resolve, reject) => {
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
              const parsedResponsePayload = JSON.parse(responsePayload) as HttpResponse;
              const result = buildResponse(parsedResponsePayload);
              if (result.code === 200) {
                resolve(result);
                return;
              }
              reject(result);
            } catch (error) {
              // skip
            } finally {
              reject(buildResponse({ code: res.statusCode || 0 }));
            }
          }
        });
      });
      req.on('error', (error: Error) => new UnexpectedError(error));
      req.end(requestPayload);
    });
  }
}
