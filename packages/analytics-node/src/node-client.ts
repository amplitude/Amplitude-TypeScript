import { AmplitudeCore, Destination, returnWrapper } from '@amplitude/analytics-core';
import { NodeClient, NodeConfig, NodeOptions } from '@amplitude/analytics-types';
import { Context } from './plugins/context';
import { useNodeConfig } from './config';

export class AmplitudeNode extends AmplitudeCore<NodeConfig> {
  async init(apiKey = '', options?: NodeOptions) {
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
    init: returnWrapper(client.init.bind(client)),
    add: returnWrapper(client.add.bind(client)),
    remove: returnWrapper(client.remove.bind(client)),
    track: returnWrapper(client.track.bind(client)),
    logEvent: returnWrapper(client.logEvent.bind(client)),
    identify: returnWrapper(client.identify.bind(client)),
    groupIdentify: returnWrapper(client.groupIdentify.bind(client)),
    setGroup: returnWrapper(client.setGroup.bind(client)),
    revenue: returnWrapper(client.revenue.bind(client)),
    flush: returnWrapper(client.flush.bind(client)),
    setOptOut: client.setOptOut.bind(client),
  };
};

export default createInstance();
