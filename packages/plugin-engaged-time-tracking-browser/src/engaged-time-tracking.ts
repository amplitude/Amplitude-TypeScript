import {
  BrowserClient,
  BrowserConfig,
  CampaignParser,
  EngagedTimeOptions,
  EnrichmentPlugin,
  Event,
  getGlobalScope,
  getOrCreatePageViewId,
  getPageTitle,
  omitUndefined,
  PageTrackingHistoryChanges,
  replaceSensitiveString,
} from '@amplitude/analytics-core';
import { PageEngagement } from './page-engagement';

/** Browser integration coordinates the initial/navigation source without coupling the plugins. */
export interface PageViewSourceOptions {
  autoTrackPageViews?: boolean;
  trackHistoryChanges?: PageTrackingHistoryChanges;
}

/** Owns the same page lifecycle for default and custom event names. */
export const engagedTimeTrackingPlugin = (
  options: EngagedTimeOptions = {},
  { autoTrackPageViews = true, trackHistoryChanges }: PageViewSourceOptions = {},
): EnrichmentPlugin => {
  const eventType = options.pageViewEventType ?? '[Amplitude] Page Viewed';
  let owner: PageEngagement | undefined;
  let localConfig: BrowserConfig;
  let exited = false;
  let installed = false;
  let awaitingSource = !autoTrackPageViews;
  let cancellation = 0;
  let revision = 0;
  let pendingRevision: number | undefined;
  let lastPageViewId: string | undefined;
  let properties: Record<string, unknown> = {};
  let currentHref = '';
  let removeContext: (() => Promise<void>) | undefined;
  const removeListeners: (() => void)[] = [];
  const finish = (reason: string) => {
    cancellation += 1;
    revision += 1;
    owner?.finish(reason);
  };

  return {
    name: '@amplitude/plugin-engaged-time-tracking-browser',
    type: 'enrichment',
    setup: async (config: BrowserConfig, client: BrowserClient) => {
      localConfig = config;
      const scope = getGlobalScope();
      if (!scope?.document) return;
      installed = true;
      currentHref = scope.location.href;
      const doc = scope.document as Document & { prerendering?: boolean };
      const listen = (target: EventTarget, type: string, listener: EventListener) => {
        target.addEventListener(type, listener);
        removeListeners.push(() => target.removeEventListener(type, listener));
      };
      // Register before the engagement owner so BFCache restore clears the exit guard before resume.
      listen(scope, 'pagehide', () => {
        exited = true;
        revision += 1;
        cancellation += 1;
      });
      listen(scope, 'pageshow', () => {
        exited = false;
      });

      const trackPageView = async () => {
        if (!installed || exited || config.optOut || doc.prerendering || awaitingSource || pendingRevision === revision)
          return;
        const context = { revision, cancellation };
        pendingRevision = revision;
        const href = scope.location.href;
        const pageViewId = getOrCreatePageViewId(config.apiKey, href, lastPageViewId);
        lastPageViewId = pageViewId;
        // Keep article metadata on same-page renewal, but regenerate page/identity/time/IDs.
        const event: Event = {
          event_type: eventType,
          extra: { engagedTimeContext: context },
          event_properties: {
            ...properties,
            '[Amplitude] Page Domain': scope.location.hostname,
            '[Amplitude] Page Location': href,
            '[Amplitude] Page Path': scope.location.pathname,
            '[Amplitude] Page Title': getPageTitle(replaceSensitiveString),
            '[Amplitude] Page URL': href.split('?')[0],
            '[Amplitude] Page View ID': pageViewId,
          },
        };
        try {
          event.event_properties = { ...omitUndefined(await new CampaignParser().parse()), ...event.event_properties };
          if (installed && !config.optOut && context.cancellation === cancellation) {
            await client.track(event).promise;
          }
        } finally {
          if (pendingRevision === context.revision) pendingRevision = undefined;
        }
      };
      const engagement = new PageEngagement(client, scope, options, config, () => {
        void trackPageView();
      });
      owner = engagement;
      engagement.setOptOut(config.optOut);
      const contextName = '@amplitude/plugin-engaged-time-tracking-browser/context';
      await client.add({
        name: contextName,
        type: 'before',
        execute: async (event) => {
          if (!event.delay && !event.extra?.engagedTimeContext) {
            event.extra = { ...event.extra, engagedTimeContext: { cancellation, revision } };
          }
          return event;
        },
      }).promise;
      removeContext = async () => {
        await client.remove(contextName).promise;
      };

      let href = scope.location.href;
      let active = true;
      const onNavigation = () => {
        const next = scope.location.href;
        if (!active || next === href) return;
        const previous = new URL(href);
        const current = new URL(next);
        href = next;
        currentHref = next;
        if (
          trackHistoryChanges === 'pathOnly' &&
          current.origin + current.pathname === previous.origin + previous.pathname
        )
          return;
        revision += 1;
        properties = {};
        awaitingSource = !autoTrackPageViews;
        engagement.finish('navigation');
        if (autoTrackPageViews) void trackPageView();
      };
      listen(scope, 'popstate', onNavigation);
      // Match the existing page-view source: pushState and popstate, not replaceState.
      for (const method of ['pushState'] as const) {
        const original = scope.history[method];
        const proxy = new Proxy(original, {
          apply: (target, thisArg, args: Parameters<History[typeof method]>) => {
            target.apply(thisArg, args);
            onNavigation();
          },
        });
        scope.history[method] = proxy;
        removeListeners.push(() => {
          active = false;
          if (scope.history[method] === proxy) scope.history[method] = original;
        });
      }
      if (autoTrackPageViews) {
        if (doc.prerendering)
          listen(doc, 'prerenderingchange', () => {
            void trackPageView();
          });
        else void trackPageView();
      }
    },
    execute: async (event) => {
      if (!owner || event.delay || event.event_type !== eventType) return event;
      if (exited || localConfig.optOut) return null;
      const context = event.extra?.engagedTimeContext as { cancellation: number; revision: number } | undefined;
      if (context && context.cancellation !== cancellation) return null;
      if (context && context.revision !== revision) return event;
      awaitingSource = false;
      const incoming = event.event_properties as Record<string, unknown> | undefined;
      // The default page-view plugin may already have assigned this counter.
      if (incoming?.['[Amplitude] Page Counter'] === undefined) {
        localConfig.pageCounter = (localConfig.pageCounter || 0) + 1;
        event.event_properties = { ...incoming, '[Amplitude] Page Counter': localConfig.pageCounter };
      }
      const pageViewId = incoming?.['[Amplitude] Page View ID'];
      lastPageViewId =
        typeof pageViewId === 'string'
          ? pageViewId
          : getOrCreatePageViewId(localConfig.apiKey, currentHref, lastPageViewId);
      event.event_properties = { ...event.event_properties, '[Amplitude] Page View ID': lastPageViewId };
      properties = { ...event.event_properties };
      for (const key of [
        '[Amplitude] Page Counter',
        '[Amplitude] Page View ID',
        '[Amplitude] Engaged Time',
        '[Amplitude] Total Time',
        '[Amplitude] Snapshot Version',
        '[Amplitude] Engagement Snapshot Reason',
        '[Amplitude] Previous Page Location',
        '[Amplitude] Previous Page Type',
      ])
        delete properties[key];
      return owner.start(event) ? null : event;
    },
    teardown: async () => {
      installed = false;
      cancellation += 1;
      owner?.teardown();
      owner = undefined;
      removeListeners.forEach((remove) => remove());
      await removeContext?.();
    },
    onOptOutChanged: async (optOut) => {
      if (optOut) {
        cancellation += 1;
        revision += 1;
      }
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
