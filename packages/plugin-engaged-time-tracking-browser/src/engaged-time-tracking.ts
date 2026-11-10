import {
  BrowserClient,
  BrowserConfig,
  EngagedTimeOptions,
  EnrichmentPlugin,
  Event,
  getGlobalScope,
  getOrCreatePageViewId,
  getPageTitle,
  replaceSensitiveString,
} from '@amplitude/analytics-core';
import { createPageEngagement, PageEngagement } from './page-engagement';
import { createSnapshotClient } from './snapshot-client';

/** Observe configured page views; only idle/lifecycle recovery creates replacement views. */
export const engagedTimeTrackingPlugin = (options: EngagedTimeOptions = {}): EnrichmentPlugin => {
  const eventType = options.pageViewEventType ?? '[Amplitude] Page Viewed';
  let owner: PageEngagement | undefined;
  let localConfig: BrowserConfig;
  let exited = false;
  let installed = false;
  let pageHref: string | undefined;
  let cancellation = 0;
  let revision = 0;
  let pendingContext: { revision: number; cancellation: number } | undefined;
  let lastPageViewId: string | undefined;
  let properties: Record<string, unknown> = {};
  let removeContext: (() => Promise<void>) | undefined;
  const removeListeners: (() => void)[] = [];
  const resolved = Promise.resolve();
  const finish = (reason: string) => {
    cancellation += 1;
    owner?.finish(reason);
  };

  return {
    name: '@amplitude/plugin-engaged-time-tracking-browser',
    type: 'enrichment',
    setup: (config: BrowserConfig, client: BrowserClient) => {
      localConfig = config;
      const scope = getGlobalScope();
      if (!scope?.document) return resolved;
      installed = true;
      const doc = scope.document as Document & { prerendering?: boolean };
      const listen = (target: EventTarget, type: string, listener: EventListener) => {
        target.addEventListener(type, listener);
        removeListeners.push(() => target.removeEventListener(type, listener));
      };
      // Register before the engagement owner so BFCache restore clears the exit guard before resume.
      listen(scope, 'pagehide', () => {
        exited = true;
        cancellation += 1;
      });
      listen(scope, 'pageshow', () => {
        exited = false;
      });

      const trackPageView = () => {
        if (
          !installed ||
          exited ||
          config.optOut ||
          doc.prerendering ||
          scope.location.href !== pageHref ||
          (pendingContext?.revision === revision && pendingContext.cancellation === cancellation)
        )
          return resolved;
        const context = { revision, cancellation, href: scope.location.href };
        pendingContext = context;
        const href = scope.location.href;
        const pageViewId = getOrCreatePageViewId(config.apiKey, href, lastPageViewId);
        lastPageViewId = pageViewId;
        // Inherit accepted page/campaign metadata; refresh live title/viewport and IDs.
        // URL changes require a new matching source event, not a synthesized navigation.
        const event: Event = {
          event_type: eventType,
          extra: { engagedTimeContext: context },
          event_properties: {
            ...properties,
            '[Amplitude] Page Title': getPageTitle(replaceSensitiveString),
            '[Amplitude] Min Page Y': Math.floor(scope.scrollY),
            '[Amplitude] Viewport Width': scope.innerWidth,
            '[Amplitude] Page View ID': pageViewId,
          },
        };
        // Renewal inherits the accepted view's campaign/business context. It does
        // not rediscover attribution or become a source for a new URL.
        return client.track(event).promise.finally(() => {
          if (pendingContext === context) pendingContext = undefined;
        });
      };
      const engagement = createPageEngagement(createSnapshotClient(client, config), scope, options, config, () => {
        void trackPageView();
      });
      owner = engagement;
      engagement.setOptOut(config.optOut);
      const contextName = '@amplitude/plugin-engaged-time-tracking-browser/context';
      return client
        .add({
          name: contextName,
          type: 'before',
          execute: (event) => {
            if (!event.delay && !event.extra?.engagedTimeContext) {
              event.extra = { ...event.extra, engagedTimeContext: { cancellation, href: scope.location.href } };
            }
            return Promise.resolve(event);
          },
        })
        .promise.then(() => {
          removeContext = () => client.remove(contextName).promise;
        });
    },
    execute: (event) => {
      if (!owner || event.delay || event.event_type !== eventType) return Promise.resolve(event);
      if (exited || localConfig.optOut) return Promise.resolve(null);
      const context = event.extra?.engagedTimeContext as
        | { cancellation: number; revision?: number; href?: string }
        | undefined;
      if (context && context.cancellation !== cancellation) return Promise.resolve(null);
      if (context?.revision !== undefined && context.revision !== revision) return Promise.resolve(null);
      if (context?.href !== undefined && context.href !== getGlobalScope()!.location.href)
        return Promise.resolve(event);
      pageHref = getGlobalScope()!.location.href;
      revision += 1;
      const incoming: Record<string, unknown> = { ...event.event_properties };
      // The default page-view plugin may already have assigned this counter.
      if (incoming['[Amplitude] Page Counter'] === undefined) {
        localConfig.pageCounter = (localConfig.pageCounter || 0) + 1;
        incoming['[Amplitude] Page Counter'] = localConfig.pageCounter;
      }
      const pageViewId = incoming['[Amplitude] Page View ID'];
      lastPageViewId =
        typeof pageViewId === 'string'
          ? pageViewId
          : getOrCreatePageViewId(localConfig.apiKey, getGlobalScope()!.location.href, lastPageViewId);
      incoming['[Amplitude] Page View ID'] = lastPageViewId;
      event.event_properties = incoming;
      properties = { ...incoming };
      [
        '[Amplitude] Page Counter',
        '[Amplitude] Page View ID',
        '[Amplitude] Engaged Time',
        '[Amplitude] Total Time',
        '[Amplitude] Snapshot Version',
        '[Amplitude] Engagement Snapshot Reason',
        '[Amplitude] Previous Page Location',
        '[Amplitude] Previous Page Type',
      ].forEach((key) => delete properties[key]);
      return Promise.resolve(owner.start(event) ? null : event);
    },
    teardown: () => {
      installed = false;
      cancellation += 1;
      owner?.teardown();
      owner = undefined;
      removeListeners.forEach((remove) => remove());
      return removeContext?.() ?? resolved;
    },
    onOptOutChanged: (optOut) => {
      if (optOut) {
        cancellation += 1;
      }
      owner?.setOptOut(optOut);
      return resolved;
    },
    onReset: () => {
      finish('reset');
      return resolved;
    },
    onIdentityChanged: (identity) => {
      if ('userId' in identity || 'deviceId' in identity) finish('identity_change');
      return resolved;
    },
    onSessionIdChanged: () => {
      finish('session_change');
      return resolved;
    },
  };
};
