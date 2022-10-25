import {
  AmplitudeCore,
  Destination,
  returnWrapper,
  debugWrapper,
  getClientLogConfig,
  getClientStates,
} from '@amplitude/analytics-core';
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

    await this.runQueuedFunctions('dispatchQ');
  }
}

export const createInstance = (): NodeClient => {
  const client = new AmplitudeNode();
  return {
    init: debugWrapper(
      returnWrapper(client.init.bind(client)),
      'init',
      getClientLogConfig(client),
      getClientStates(client, ['config']),
    ),
    add: debugWrapper(
      returnWrapper(client.add.bind(client)),
      'add',
      getClientLogConfig(client),
      getClientStates(client, ['timeline.plugins']),
    ),
    remove: debugWrapper(
      returnWrapper(client.remove.bind(client)),
      'remove',
      getClientLogConfig(client),
      getClientStates(client, ['timeline.plugins']),
    ),
    track: debugWrapper(
      returnWrapper(client.track.bind(client)),
      'track',
      getClientLogConfig(client),
      getClientStates(client, ['timeline.queue.length']),
    ),
    logEvent: debugWrapper(
      returnWrapper(client.logEvent.bind(client)),
      'logEvent',
      getClientLogConfig(client),
      getClientStates(client, ['timeline.queue.length']),
    ),
    identify: debugWrapper(
      returnWrapper(client.identify.bind(client)),
      'identify',
      getClientLogConfig(client),
      getClientStates(client, ['timeline.queue.length']),
    ),
    groupIdentify: debugWrapper(
      returnWrapper(client.groupIdentify.bind(client)),
      'groupIdentify',
      getClientLogConfig(client),
      getClientStates(client, ['timeline.queue.length']),
    ),
    setGroup: debugWrapper(
      returnWrapper(client.setGroup.bind(client)),
      'setGroup',
      getClientLogConfig(client),
      getClientStates(client, ['timeline.queue.length']),
    ),
    revenue: debugWrapper(
      returnWrapper(client.revenue.bind(client)),
      'revenue',
      getClientLogConfig(client),
      getClientStates(client, ['timeline.queue.length']),
    ),
    flush: debugWrapper(
      returnWrapper(client.flush.bind(client)),
      'flush',
      getClientLogConfig(client),
      getClientStates(client, ['timeline.queue.length']),
    ),
    setOptOut: debugWrapper(
      client.setOptOut.bind(client),
      'setOptOut',
      getClientLogConfig(client),
      getClientStates(client, ['config']),
    ),
  };
};

export default createInstance();
