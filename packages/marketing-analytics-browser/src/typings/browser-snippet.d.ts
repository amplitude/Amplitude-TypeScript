import { InstanceProxy } from '@amplitude/analytics-types';

declare global {
  // globalThis only includes `var` declarations
  // eslint-disable-next-line no-var
  var amplitude: InstanceProxy & { invoked: boolean };
}
