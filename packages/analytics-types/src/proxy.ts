import { Result } from './result';

interface ProxyItem {
  name: string;
  args: any[];
  resolve?: (promise: Promise<Result>) => void;
}

export type QueueProxy = Array<ProxyItem>;

export interface InstanceProxy {
  _q: QueueProxy;
  _iq: InstanceProxy[];
}
