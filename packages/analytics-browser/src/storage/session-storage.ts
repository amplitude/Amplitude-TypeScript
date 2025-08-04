import { getGlobalScope, BrowserStorage } from '@amplitude/analytics-core';

export class SessionStorage<T> extends BrowserStorage<T> {
  constructor() {
    super(getGlobalScope()?.sessionStorage);
  }
}
