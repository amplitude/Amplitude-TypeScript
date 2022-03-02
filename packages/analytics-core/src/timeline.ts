import {
  BeforePlugin,
  Config,
  DestinationPlugin,
  EnrichmentPlugin,
  Event,
  EventCallback,
  Plugin,
  PluginType,
} from '@amplitude/analytics-types';
import { Result } from './result';
import { handleUnknownError } from './utils/result-builder';

export const queue: [Event, EventCallback][] = [];
export const plugins: Plugin[] = [];
let applying = false;

export const register = async (plugin: Plugin, config: Config) => {
  await plugin.setup(config);
  plugins.push(plugin);
};

export const deregister = (pluginName: string) => {
  plugins.splice(
    plugins.findIndex((plugin) => plugin.name === pluginName),
    1,
  );
  return Promise.resolve();
};

export const push = (event: Event, config: Config) => {
  config; // wink
  return new Promise<Result>((resolve) => {
    queue.push([event, resolve]);
    scheduleApply(0);
  });
};

export const scheduleApply = (timeout: number) => {
  if (applying) return;
  applying = true;
  setTimeout(() => {
    void apply().then(() => {
      applying = false;
      if (queue.length > 0) {
        scheduleApply(0);
      }
    });
  }, timeout);
};

export const apply = async () => {
  const item = queue.shift();

  if (!item) {
    return 0;
  }

  let [event] = item;
  const [, resolve] = item;

  const before = plugins.filter<BeforePlugin>(
    (plugin: Plugin): plugin is BeforePlugin => plugin.type === PluginType.BEFORE,
  );

  for (const plugin of before) {
    event = await plugin.execute({ ...event });
  }

  const enrichment = plugins.filter<EnrichmentPlugin>(
    (plugin: Plugin): plugin is EnrichmentPlugin => plugin.type === PluginType.ENRICHMENT,
  );

  for (const plugin of enrichment) {
    event = await plugin.execute({ ...event });
  }

  const destination = plugins.filter<DestinationPlugin>(
    (plugin: Plugin): plugin is DestinationPlugin => plugin.type === PluginType.DESTINATION,
  );

  const executeDestinations = destination.map((plugin) => plugin.execute({ ...event }).catch(handleUnknownError));

  void Promise.all(executeDestinations).then(([result]) => {
    resolve(result);
  });

  return;
};
