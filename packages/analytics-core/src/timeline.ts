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

export class Timeline {
  queue: [Event, EventCallback][] = [];
  applying = false;
  flushing = false;
  plugins: Plugin[] = [];

  async register(plugin: Plugin, config: Config) {
    await plugin.setup(config);
    this.plugins.push(plugin);
  }

  deregister(pluginName: string) {
    this.plugins.splice(
      this.plugins.findIndex((plugin) => plugin.name === pluginName),
      1,
    );
    return Promise.resolve();
  }

  push(event: Event, config: Config) {
    return new Promise<Result>((resolve) => {
      if (config.optOut) {
        resolve(buildResult(event, 0, OPT_OUT_MESSAGE));
        return;
      }
      this.queue.push([event, resolve]);
      this.scheduleApply(0);
    });
  }

  scheduleApply(timeout: number) {
    if (this.applying) return;
    this.applying = true;
    setTimeout(() => {
      void this.apply(this.queue.shift()).then(() => {
        this.applying = false;
        if (this.queue.length > 0) {
          this.scheduleApply(0);
        }
      });
    }, timeout);
  }

  async apply(item: [Event, EventCallback] | undefined) {
    if (!item) {
      return;
    }

    let [event] = item;
    const [, resolve] = item;

    const before = this.plugins.filter<BeforePlugin>(
      (plugin: Plugin): plugin is BeforePlugin => plugin.type === PluginType.BEFORE,
    );

    for (const plugin of before) {
      event = await plugin.execute({ ...event });
    }

    const enrichment = this.plugins.filter<EnrichmentPlugin>(
      (plugin: Plugin): plugin is EnrichmentPlugin => plugin.type === PluginType.ENRICHMENT,
    );

    for (const plugin of enrichment) {
      event = await plugin.execute({ ...event });
    }

    const destination = this.plugins.filter<DestinationPlugin>(
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
  }

  async flush() {
    const queue = this.queue;
    this.queue = [];

    await Promise.all(queue.map((item) => this.apply(item)));

    const destination = this.plugins.filter<DestinationPlugin>(
      (plugin: Plugin): plugin is DestinationPlugin => plugin.type === PluginType.DESTINATION,
    );

    const executeDestinations = destination.map((plugin) => {
      return plugin.flush && plugin.flush();
    });

    await Promise.all(executeDestinations);
  }
}
