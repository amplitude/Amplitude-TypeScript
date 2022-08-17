import { AmplitudeCore, Destination, amplitudePromise } from '@amplitude/analytics-core';
import { NodeClient, NodeConfig, NodeOptions } from '@amplitude/analytics-types';
import { Context } from './plugins/context';
import { useNodeConfig } from './config';

export class AmplitudeNode extends AmplitudeCore<NodeConfig> {
  async init(apiKey: string, options?: NodeOptions) {
    // Step 0: Block concurrent initialization
    if (this.initializing) {
      return;
    }
    this.initializing = true;

    const nodeOptions = useNodeConfig(apiKey, {
      ...options,
    });

    await super._init(nodeOptions);

    await this.add(new Context());
    await this.add(new Destination());

    this.initializing = false;

    // Set timeline ready for processing events
    // Send existing events, which might be collected by track before init
    this.timeline.isReady = true;
    if (!this.config.optOut) {
      this.timeline.scheduleApply(0);
    }
  }
}

export const createInstance = (): NodeClient => {
  const client = new AmplitudeNode();
  return {
    init: amplitudePromise(client.init.bind(client)),
    add: amplitudePromise(client.add.bind(client)),
    remove: amplitudePromise(client.remove.bind(client)),
    track: amplitudePromise(client.track.bind(client)),
    logEvent: amplitudePromise(client.logEvent.bind(client)),
    identify: amplitudePromise(client.identify.bind(client)),
    groupIdentify: amplitudePromise(client.groupIdentify.bind(client)),
    setGroup: amplitudePromise(client.setGroup.bind(client)),
    revenue: amplitudePromise(client.revenue.bind(client)),
    flush: amplitudePromise(client.flush.bind(client)),
    setOptOut: client.setOptOut.bind(client),
  };
};

export default createInstance();
