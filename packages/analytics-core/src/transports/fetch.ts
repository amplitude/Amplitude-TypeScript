import { BaseTransport } from './base';
import { Transport } from '../types/transport';
import { Payload } from '../types/payload';
import { Response } from '../types/response';

export class FetchTransport extends BaseTransport implements Transport {
  async send(serverUrl: string, payload: Payload): Promise<Response | null> {
    /* istanbul ignore if */
    if (typeof fetch === 'undefined') {
      throw new Error('FetchTransport is not supported');
    }
    const options: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        Accept: '*/*',
      },
      body: JSON.stringify(payload),
      method: 'POST',
    };
    const response = await fetch(serverUrl, options);
    const responseText = await response.text();
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return this.buildResponse(JSON.parse(responseText));
    } catch {
      return this.buildResponse({ code: response.status });
    }
  }
}
