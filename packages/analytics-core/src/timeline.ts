import {
  BeforePlugin,
  Config,
  DestinationPlugin,
  EnrichmentPlugin,
  Event,
  EventCallback,
  Plugin,
  PluginType,
  Result,
} from '@amplitude/analytics-types';
import { OPT_OUT_MESSAGE } from './messages';
import { buildResult } from './utils/result-builder';

export const queue: [Event, EventCallback, Plugin[]][] = [];
let applying = false;

export const register = async (plugin: Plugin, config: Config) => {
  await plugin.setup(config);
  config.plugins.push(plugin);
};

export const deregister = (pluginName: string, config: Config) => {
  config.plugins.splice(
    config.plugins.findIndex((plugin) => plugin.name === pluginName),
    1,
  );
  return Promise.resolve();
};

export const push = (event: Event, config: Config) => {
  return new Promise<Result>((resolve) => {
    if (config.optOut) {
      resolve(buildResult(event, 0, OPT_OUT_MESSAGE));
      return;
    }
    queue.push([event, resolve, config.plugins]);
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
    return;
  }

  let [event] = item;
  const [, resolve, plugins] = item;

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

  const executeDestinations = destination.map((plugin) => {
    const eventClone = { ...event };
    return plugin.execute(eventClone).catch((e) => buildResult(eventClone, 0, String(e)));
  });

  void Promise.all(executeDestinations).then(([result]) => {
    resolve(result);
  });

  return;
};

export const flush = async (config: Config) => {
  const destination = config.plugins.filter<DestinationPlugin>(
    (plugin: Plugin): plugin is DestinationPlugin => plugin.type === PluginType.DESTINATION,
  );

  const flushDestinations = destination.map((plugin) => plugin.flush(true));

  await Promise.all(flushDestinations);
};
