import { Result } from '@amplitude/analytics-types';

interface ProxyItem {
  name: string;
  args: any[];
  resolve?: (promise: Promise<Result>) => void;
}

export type QueueProxy = Array<ProxyItem>;

export interface InstanceProxy {
  _q: QueueProxy;
}

declare global {
  // globalThis only includes `var` declarations
  // eslint-disable-next-line no-var
  var amplitude: InstanceProxy & { invoked: boolean };
}
