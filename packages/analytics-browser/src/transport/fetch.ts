import { Transport } from '@amplitude/analytics-types';

export class FetchTransport implements Transport {
  send() {
    return Promise.resolve(null);
  }
}
