import { Transport } from '@amplitude/analytics-types';

export class Fetch implements Transport {
  send() {
    return Promise.resolve(null);
  }
}
