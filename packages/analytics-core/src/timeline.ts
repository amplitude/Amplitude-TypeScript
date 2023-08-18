import {
  BeforePlugin,
  Config,
  CoreClient,
  DestinationPlugin,
  EnrichmentPlugin,
  Event,
  EventCallback,
  Plugin,
  Result,
} from '@amplitude/analytics-types';
import { buildResult } from './utils/result-builder';
import { UUID } from './utils/uuid';

export class Timeline {
  queue: [Event, EventCallback][] = [];
  // Flag to guarantee one schedule apply is running
  applying = false;
  // Flag indicates whether timeline is ready to process event
  // Events collected before timeline is ready will stay in the queue to be processed later
  plugins: Plugin[] = [];

  constructor(private client: CoreClient) {}

  async register(plugin: Plugin, config: Config) {
    plugin.name = plugin.name ?? UUID();
    plugin.type = plugin.type ?? 'enrichment';
    await plugin.setup?.(config, this.client);
    this.plugins.push(plugin);
  }

  async deregister(pluginName: string) {
    const index = this.plugins.findIndex((plugin) => plugin.name === pluginName);
    const plugin = this.plugins[index];
    this.plugins.splice(index, 1);
    await plugin.teardown?.();
  }

  reset(client: CoreClient) {
    this.applying = false;
    const plugins = this.plugins;
    plugins.map((plugin) => plugin.teardown?.());
    this.plugins = [];
    this.client = client;
  }

  push(event: Event) {
    return new Promise<Result>((resolve) => {
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
      (plugin: Plugin): plugin is BeforePlugin => plugin.type === 'before',
    );

    for (const plugin of before) {
      /* istanbul ignore if */
      if (!plugin.execute) {
        // do nothing
        continue;
      }
      const e = await plugin.execute({ ...event });
      if (e === null) {
        resolve({ event, code: 0, message: '' });
        return;
      } else {
        event = e;
      }
    }

    const enrichment = this.plugins.filter<EnrichmentPlugin>(
      (plugin: Plugin): plugin is EnrichmentPlugin => plugin.type === 'enrichment' || plugin.type === undefined,
    );

    for (const plugin of enrichment) {
      /* istanbul ignore if */
      if (!plugin.execute) {
        // do nothing
        continue;
      }
      const e = await plugin.execute({ ...event });
      if (e === null) {
        resolve({ event, code: 0, message: '' });
        return;
      } else {
        event = e;
      }
    }

    const destination = this.plugins.filter<DestinationPlugin>(
      (plugin: Plugin): plugin is DestinationPlugin => plugin.type === 'destination',
    );

    const executeDestinations = destination.map((plugin) => {
      const eventClone = { ...event };
      return plugin.execute(eventClone).catch((e) => buildResult(eventClone, 0, String(e)));
    });

    void Promise.all(executeDestinations).then(([result]) => {
      const resolveResult =
        result || buildResult(event, 100, 'Event not tracked, no destination plugins on the instance');
      resolve(resolveResult);
    });

    return;
  }

  async flush() {
    const queue = this.queue;
    this.queue = [];

    await Promise.all(queue.map((item) => this.apply(item)));

    const destination = this.plugins.filter<DestinationPlugin>(
      (plugin: Plugin): plugin is DestinationPlugin => plugin.type === 'destination',
    );

    const executeDestinations = destination.map((plugin) => {
      return plugin.flush && plugin.flush();
    });

    await Promise.all(executeDestinations);
  }
}
