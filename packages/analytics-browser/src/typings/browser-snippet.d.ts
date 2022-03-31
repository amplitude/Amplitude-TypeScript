export type QueueProxy = Array<[string, ...Array<any>]>;

export interface InstanceProxy {
  _q: QueueProxy;
}

declare global {
  // globalThis only includes `var` declarations
  // eslint-disable-next-line no-var
  var amplitude: InstanceProxy & { invoked: boolean };
}
