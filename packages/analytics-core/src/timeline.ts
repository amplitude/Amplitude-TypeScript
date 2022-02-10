import {
  BeforePlugin,
  Config,
  Context,
  DestinationPlugin,
  EnrichmentPlugin,
  Event,
  Plugin,
  PluginType,
  Result,
} from '@amplitude/analytics-types';

export const queue: Context[] = [];
export const plugins: Plugin[] = [];
let flushing = false;

export const register = async (plugin: Plugin) => {
  await plugin.setup();
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
  return new Promise<Result>((resolve) => {
    const context = {
      event,
      config,
      resolve,
    };
    queue.push(context);
    schedule(0);
  });
};

export const schedule = (timeout: number) => {
  if (flushing) return;
  flushing = true;
  setTimeout(() => {
    void flush().then(() => {
      flushing = false;
      if (queue.length > 0) {
        schedule(0);
      }
    });
  }, timeout);
};

export const flush = async () => {
  const context = queue.shift();

  if (!context) {
    return;
  }

  const before = plugins.filter<BeforePlugin>(
    (plugin: Plugin): plugin is BeforePlugin => plugin.type === PluginType.BEFORE,
  );

  for (const plugin of before) {
    const event = await plugin.execute({ ...context.event });
    context.event = event;
  }

  const enrichment = plugins.filter<EnrichmentPlugin>(
    (plugin: Plugin): plugin is EnrichmentPlugin => plugin.type === PluginType.ENRICHMENT,
  );

  for (const plugin of enrichment) {
    const event = await plugin.execute({ ...context.event });
    context.event = event;
  }

  const destination = plugins.filter<DestinationPlugin>(
    (plugin: Plugin): plugin is DestinationPlugin => plugin.type === PluginType.DESTINATION,
  );

  for (const plugin of destination) {
    await plugin.execute(context.event);
  }

  return context.resolve({
    success: true,
    code: 200,
    message: 'success',
  });
};
