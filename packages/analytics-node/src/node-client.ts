import { AmplitudeCore, Destination, returnWrapper } from '@amplitude/analytics-core';
import { CreateNodeInstance, NodeConfig, NodeOptions } from '@amplitude/analytics-types';
import { Context } from './plugins/context';
import { useNodeConfig } from './config';

export class AmplitudeNode extends AmplitudeCore<NodeConfig> {
  async init(apiKey: string, _userId?: string | undefined, options?: NodeOptions) {
    const nodeOptions = useNodeConfig(apiKey, {
      ...options,
    });
    await super.init(undefined, undefined, nodeOptions);
    await this.add(new Context());
    await this.add(new Destination());
  }
}

export const createInstance: CreateNodeInstance = (instanceName: string) => {
  const client = new AmplitudeNode(instanceName);
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
    setOptOut: client.setOptOut.bind(client),
    flush: returnWrapper(client.flush.bind(client)),
  };
};

export default createInstance('$default');
