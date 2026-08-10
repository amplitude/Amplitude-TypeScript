import { BaseTransport, Payload, Response, Transport } from '@amplitude/analytics-core';
import * as http from 'http';
import * as https from 'https';

/**
 * Node's HTTP client applies no socket or request timeout of its own, so without
 * this a stalled upload hangs forever. Matches the 10s network timeout used by
 * the Amplitude Java and Python SDKs.
 */
export const DEFAULT_REQUEST_TIMEOUT_MILLIS = 10000;

// buildResponse() maps 408 to Status.Timeout and 0 to Status.Unknown. Destination
// retries both with backoff, bounded by flushMaxRetries, rather than dropping the
// batch the way it does for a null response.
const REQUEST_TIMEOUT_STATUS_CODE = 408;
const INCOMPLETE_RESPONSE_STATUS_CODE = 0;

export class Http extends BaseTransport implements Transport {
  constructor(private readonly requestTimeoutMillis: number = DEFAULT_REQUEST_TIMEOUT_MILLIS) {
    super();
  }

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
      // Every path below must settle exactly once. A send() that never settles
      // leaves Destination.flushId set forever, which silently no-ops all later
      // flushes while the event queue keeps growing. See SDK-188.
      let settled = false;
      const settle = (response: Response | null) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(response);
      };

      // A connection that drops mid-response is transient, so retry rather than
      // discard the batch. Amplitude dedupes on insert_id, making a replay of a
      // batch the server may already have processed safe.
      const settleAsIncomplete = () => settle(this.buildResponse({ code: INCOMPLETE_RESPONSE_STATUS_CODE }));

      const req = protocol.request(options, (res) => {
        res.setEncoding('utf8');
        let responsePayload = '';
        res.on('data', (chunk: string) => {
          responsePayload += chunk;
        });
        res.on('aborted', settleAsIncomplete);
        res.on('error', settleAsIncomplete);

        res.on('end', () => {
          // A truncated body tells us nothing about whether the server accepted
          // the batch.
          if (!res.complete) {
            settleAsIncomplete();
            return;
          }
          try {
            // An empty body lands here too, and falls back to the status line.
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const parsedResponsePayload: Record<string, any> = JSON.parse(responsePayload);
            settle(this.buildResponse(parsedResponsePayload));
          } catch {
            settle(this.buildResponse({ code: res.statusCode }));
          }
        });
      });

      // Unlike the cases above, a request that never reached the server keeps its
      // long-standing drop-on-error behavior.
      req.on('error', () => settle(null));
      req.setTimeout(this.requestTimeoutMillis, () => {
        req.destroy();
        settle(this.buildResponse({ code: REQUEST_TIMEOUT_STATUS_CODE }));
      });
      req.end(requestPayload);
    });
  }
}
