import {
  BrowserClient,
  BrowserConfig,
  EngagedTimeOptions,
  EnrichmentPlugin,
  getGlobalScope,
} from '@amplitude/analytics-core';
import { PageEngagement } from './page-engagement';

/** Listens for page views; never creates them or depends on the page-view plugin. */
export const engagedTimeTrackingPlugin = (options: EngagedTimeOptions = {}): EnrichmentPlugin => {
  const eventType = options.pageViewEventType ?? '[Amplitude] Page Viewed';
  let owner: PageEngagement | undefined;
  let localConfig: BrowserConfig;
  let exited = false;
  let cancellation = 0;
  let revision = 0;
  let removeContext: (() => Promise<void>) | undefined;
  const removeListeners: (() => void)[] = [];
  const finish = (reason: string) => {
    cancellation += 1;
    owner?.finish(reason);
  };

  return {
    name: '@amplitude/plugin-engaged-time-tracking-browser',
    type: 'enrichment',
    setup: async (config: BrowserConfig, client: BrowserClient) => {
      localConfig = config;
      const scope = getGlobalScope();
      if (!scope?.document) return;

      // Activity may extend an existing view, but cannot synthesize another one.
      const engagement = new PageEngagement(client, scope, options, config, () => undefined);
      owner = engagement;
      engagement.setOptOut(config.optOut);
      // Capture lifecycle context before asynchronous enrichment can hold an event.
      // This also supports page views converted from another event by an enrichment plugin.
      const contextName = '@amplitude/plugin-engaged-time-tracking-browser/context';
      await client.add({
        name: contextName,
        type: 'before',
        execute: async (event) => {
          if (!event.delay) {
            event.extra = { ...event.extra, engagedTimeContext: { cancellation, revision } };
          }
          return event;
        },
      }).promise;
      removeContext = async () => {
        await client.remove(contextName).promise;
      };
      const listen = (type: string, listener: EventListener) => {
        scope.addEventListener(type, listener);
        removeListeners.push(() => scope.removeEventListener(type, listener));
      };
      listen('pagehide', () => {
        exited = true;
        cancellation += 1;
      });
      listen('pageshow', () => {
        exited = false;
      });

      let href = scope.location.href;
      let active = true;
      const onNavigation = () => {
        if (!active || scope.location.href === href) return;
        href = scope.location.href;
        revision += 1;
        engagement.finish('navigation');
      };
      listen('popstate', onNavigation);
      for (const method of ['pushState', 'replaceState'] as const) {
        const original = scope.history[method];
        const proxy = new Proxy(original, {
          apply: (target, thisArg, args: Parameters<History[typeof method]>) => {
            target.apply(thisArg, args);
            onNavigation();
          },
        });
        scope.history[method] = proxy;
        removeListeners.push(() => {
          // Another plugin may have wrapped this proxy since setup.
          active = false;
          if (scope.history[method] === proxy) scope.history[method] = original;
        });
      }
    },
    execute: async (event) => {
      if (!owner || event.delay || event.event_type !== eventType) return event;
      if (exited || localConfig.optOut) return null;
      const context = event.extra?.engagedTimeContext as { cancellation: number; revision: number } | undefined;
      if (context && context.cancellation !== cancellation) return null;
      // Preserve a view held across navigation as an ordinary event with its original context.
      if (context && context.revision !== revision) return event;
      return owner.start(event) ? null : event;
    },
    teardown: async () => {
      cancellation += 1;
      owner?.teardown();
      owner = undefined;
      removeListeners.forEach((remove) => remove());
      await removeContext?.();
    },
    onOptOutChanged: async (optOut) => {
      if (optOut) cancellation += 1;
      owner?.setOptOut(optOut);
    },
    onReset: async () => {
      finish('reset');
    },
    onIdentityChanged: async (identity) => {
      if ('userId' in identity || 'deviceId' in identity) finish('identity_change');
    },
    onSessionIdChanged: async () => {
      finish('session_change');
    },
  };
};
