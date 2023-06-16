import { getGlobalScope } from '@amplitude/analytics-client-common';
import { BrowserStorage } from './browser-storage';

export class SessionStorage<T> extends BrowserStorage<T> {
  constructor() {
    super(getGlobalScope()?.sessionStorage);
  }
}
