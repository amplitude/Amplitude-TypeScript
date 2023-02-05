import { debugWrapper, getClientLogConfig, getClientStates, returnWrapper } from '@amplitude/analytics-core';
import { BrowserClient } from '@amplitude/analytics-types';
import { AmplitudeBrowser } from './browser-client';

export const createInstance = (): BrowserClient => {
  const client = new AmplitudeBrowser();
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
      getClientStates(client, ['config.apiKey', 'timeline.plugins']),
    ),
    remove: debugWrapper(
      returnWrapper(client.remove.bind(client)),
      'remove',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.plugins']),
    ),
    track: debugWrapper(
      returnWrapper(client.track.bind(client)),
      'track',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    logEvent: debugWrapper(
      returnWrapper(client.logEvent.bind(client)),
      'logEvent',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    identify: debugWrapper(
      returnWrapper(client.identify.bind(client)),
      'identify',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    groupIdentify: debugWrapper(
      returnWrapper(client.groupIdentify.bind(client)),
      'groupIdentify',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    setGroup: debugWrapper(
      returnWrapper(client.setGroup.bind(client)),
      'setGroup',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    revenue: debugWrapper(
      returnWrapper(client.revenue.bind(client)),
      'revenue',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    flush: debugWrapper(
      returnWrapper(client.flush.bind(client)),
      'flush',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    getUserId: debugWrapper(
      client.getUserId.bind(client),
      'getUserId',
      getClientLogConfig(client),
      getClientStates(client, ['config', 'config.userId']),
    ),
    setUserId: debugWrapper(
      client.setUserId.bind(client),
      'setUserId',
      getClientLogConfig(client),
      getClientStates(client, ['config', 'config.userId']),
    ),
    getDeviceId: debugWrapper(
      client.getDeviceId.bind(client),
      'getDeviceId',
      getClientLogConfig(client),
      getClientStates(client, ['config', 'config.deviceId']),
    ),
    setDeviceId: debugWrapper(
      client.setDeviceId.bind(client),
      'setDeviceId',
      getClientLogConfig(client),
      getClientStates(client, ['config', 'config.deviceId']),
    ),
    reset: debugWrapper(
      client.reset.bind(client),
      'reset',
      getClientLogConfig(client),
      getClientStates(client, ['config', 'config.userId', 'config.deviceId']),
    ),
    getSessionId: debugWrapper(
      client.getSessionId.bind(client),
      'getSessionId',
      getClientLogConfig(client),
      getClientStates(client, ['config']),
    ),
    setSessionId: debugWrapper(
      client.setSessionId.bind(client),
      'setSessionId',
      getClientLogConfig(client),
      getClientStates(client, ['config']),
    ),
    setOptOut: debugWrapper(
      client.setOptOut.bind(client),
      'setOptOut',
      getClientLogConfig(client),
      getClientStates(client, ['config']),
    ),
    setTransport: debugWrapper(
      client.setTransport.bind(client),
      'setTransport',
      getClientLogConfig(client),
      getClientStates(client, ['config']),
    ),
  };
};

export default createInstance();
