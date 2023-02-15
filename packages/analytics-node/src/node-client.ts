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

export class AmplitudeNode extends AmplitudeCore {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: NodeConfig;

  init(apiKey = '', options?: NodeOptions) {
    return returnWrapper(this._init({ ...options, apiKey }));
  }
  protected async _init(options: NodeOptions & { apiKey: string }) {
    // Step 0: Block concurrent initialization
    if (this.initializing) {
      return;
    }
    this.initializing = true;

    const nodeOptions = useNodeConfig(options.apiKey, {
      ...options,
    });

    await super._init(nodeOptions);

    await this.add(new Destination()).promise;
    await this.add(new Context()).promise;

    this.initializing = false;

    await this.runQueuedFunctions('dispatchQ');
  }
}

export const createInstance = (): NodeClient => {
  const client = new AmplitudeNode();
  return {
    init: debugWrapper(
      client.init.bind(client),
      'init',
      getClientLogConfig(client),
      getClientStates(client, ['config']),
    ),
    add: debugWrapper(
      client.add.bind(client),
      'add',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.plugins']),
    ),
    remove: debugWrapper(
      client.remove.bind(client),
      'remove',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.plugins']),
    ),
    track: debugWrapper(
      client.track.bind(client),
      'track',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    logEvent: debugWrapper(
      client.logEvent.bind(client),
      'logEvent',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    identify: debugWrapper(
      client.identify.bind(client),
      'identify',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    groupIdentify: debugWrapper(
      client.groupIdentify.bind(client),
      'groupIdentify',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    setGroup: debugWrapper(
      client.setGroup.bind(client),
      'setGroup',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    revenue: debugWrapper(
      client.revenue.bind(client),
      'revenue',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    flush: debugWrapper(
      client.flush.bind(client),
      'flush',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
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
