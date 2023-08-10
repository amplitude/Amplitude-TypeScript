import { getGlobalScope } from '@amplitude/analytics-client-common';
import { BrowserStorage } from './browser-storage';

export class LocalStorage<T> extends BrowserStorage<T> {
  constructor(savedMaxCount = 1000) {
    super(getGlobalScope()?.localStorage);
    this.savedMaxCount = savedMaxCount;
  }
}
