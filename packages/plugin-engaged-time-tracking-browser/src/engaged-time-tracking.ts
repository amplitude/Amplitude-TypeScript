import {
  BrowserClient,
  BrowserConfig,
  EngagedTimeOptions,
  EnrichmentPlugin,
  Event,
  getGlobalScope,
} from '@amplitude/analytics-core';
import { createPageEngagement, PageEngagement } from './page-engagement';

/** Observe configured page views; only idle/lifecycle recovery creates replacement views. */
export const engagedTimeTrackingPlugin = (options: EngagedTimeOptions = {}): EnrichmentPlugin => {
  // Exact application PageView event name to observe.
  const eventType = options.pageViewEventType ?? '[Amplitude] Page Viewed';
  // Generated lifecycle renewals can use a separate analytics event name.
  const secondaryEventType = options.secondaryPageViewEventType ?? eventType;
  // Tracks the current view's elapsed time, activity, and heartbeat.
  let pageEngagement: PageEngagement | undefined;
  // Shared SDK settings, including the current opt-out value.
  let browserConfig: BrowserConfig;
  // Blocks renewal after pagehide until pageshow, including BFCache.
  let exited = false;
  // Prevents this plugin from generating events after teardown.
  let installed = false;
  // URL of the last accepted view; renewal waits on this same URL.
  let pageHref: string | undefined;
  // Invalidates queued events across identity, session, consent, or exit boundaries.
  let cancellation = 0;
  // Advances for each accepted view so an older renewal cannot replace it.
  let revision = 0;
  // Identifies an in-flight renewal to suppress repeated activity/focus requests.
  let pendingContext: { revision: number; cancellation: number } | undefined;
  // Removes the before-plugin that stamps each event's lifecycle context.
  let removeContext: (() => Promise<void>) | undefined;
  // Unsubscribes this plugin's DOM lifecycle listeners during teardown.
  const removeListeners: (() => void)[] = [];
  // Reuses a completed promise for synchronous plugin hooks.
  const resolved = Promise.resolve();
  // Cancels stale queued events and finalizes the active view.
  const finish = (reason: string) => {
    cancellation += 1;
    pageEngagement?.finish(reason);
  };

  return {
    name: '@amplitude/plugin-engaged-time-tracking-browser',
    type: 'enrichment',
    setup: (config: BrowserConfig, client: BrowserClient) => {
      browserConfig = config;
      const scope = getGlobalScope();
      if (!scope?.document) return resolved;
      installed = true;
      const doc = scope.document as Document & { prerendering?: boolean };
      const listen = (target: EventTarget, type: string, listener: EventListener) => {
        target.addEventListener(type, listener);
        removeListeners.push(() => target.removeEventListener(type, listener));
      };
      // Register before the engagement tracker so BFCache restore clears the exit guard before resume.
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
        // Renew without carrying application properties from the previous view.
        const event: Event = { event_type: secondaryEventType, extra: { engagedTimeContext: context } };
        return client.track(event).promise.finally(() => {
          if (pendingContext === context) pendingContext = undefined;
        });
      };
      pageEngagement = createPageEngagement(client, scope, options, config, () => {
        void trackPageView();
      });
      pageEngagement.setOptOut(config.optOut);
      const contextName = '@amplitude/plugin-engaged-time-tracking-browser/context';
      return client
        .add({
          name: contextName,
          type: 'before',
          execute: (event) => {
            // Drop stale generated renewals before page counter/URL enrichment mutates state.
            const context = event.extra?.engagedTimeContext as typeof pendingContext & { href?: string };
            if (
              event.extra?.engagedTimeReplay !== true &&
              context?.revision !== undefined &&
              (context.revision !== revision ||
                context.cancellation !== cancellation ||
                context.href !== scope.location.href)
            )
              return Promise.resolve(null);
            if (event.extra?.engagedTimeReplay !== true && !event.extra?.engagedTimeContext) {
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
      const context = event.extra?.engagedTimeContext as
        | { cancellation: number; revision?: number; href?: string }
        | undefined;
      if (
        !pageEngagement ||
        event.extra?.engagedTimeReplay === true ||
        (event.event_type !== eventType &&
          !(event.event_type === secondaryEventType && context?.revision !== undefined))
      )
        return Promise.resolve(event);
      if (exited || browserConfig.optOut) return Promise.resolve(null);
      if (context && context.cancellation !== cancellation) return Promise.resolve(null);
      if (context?.revision !== undefined && context.revision !== revision) return Promise.resolve(null);
      if (context?.href !== undefined && context.href !== getGlobalScope()!.location.href)
        return Promise.resolve(context.revision !== undefined ? null : event);
      pageHref = getGlobalScope()!.location.href;
      revision += 1;
      return Promise.resolve(pageEngagement.start(event) ?? event);
    },
    teardown: () => {
      installed = false;
      cancellation += 1;
      pageEngagement?.teardown();
      pageEngagement = undefined;
      removeListeners.forEach((remove) => remove());
      return removeContext?.() ?? resolved;
    },
    onOptOutChanged: (optOut) => {
      if (optOut) {
        cancellation += 1;
      }
      pageEngagement?.setOptOut(optOut);
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
