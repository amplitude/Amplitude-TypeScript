import { getGlobalScope } from '@amplitude/analytics-client-common';
import { BrowserStorage } from './browser-storage';

export class LocalStorage<T> extends BrowserStorage<T> {
  constructor() {
    super(getGlobalScope()?.localStorage);
  }
}
