import { Payload, Response, Transport } from '@amplitude/analytics-types';
import { buildResponse } from '@amplitude/analytics-core';
import * as http from 'http';
import * as https from 'https';

export class Http implements Transport {
  send(serverUrl: string, payload: Payload): Promise<Response | null> {
    let protocol: typeof http | typeof https;
    if (serverUrl.startsWith('http://')) {
      protocol = http;
    } else if (serverUrl.startsWith('https://')) {
      protocol = https;
    } else {
      throw new Error('Invalid server url');
    }

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
      const req = protocol.request(options, (res) => {
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
              const result = buildResponse(parsedResponsePayload);
              resolve(result);
              return;
            } catch {
              resolve(null);
            }
          }
        });
      });
      req.on('error', buildResponse);
      req.end(requestPayload);
    });
  }
}
