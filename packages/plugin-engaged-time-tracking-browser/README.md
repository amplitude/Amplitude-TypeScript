# Engaged-time tracking

Experimental browser enrichment plugin for cumulative engaged time on default or custom page-view events. It uses the existing heartbeat and delayed-ingestion service. Each logical page view retains its event name, original timestamp, insert ID, identity, and business properties across snapshots.

## Browser SDK configuration

`engagedTimeTracking` is an opt-in sibling of `pageViews` under `autocapture`. Its type is `boolean | EngagedTimeOptions`:

```ts
amplitude.init(API_KEY, {
  autocapture: {
    pageViews: false,
    engagedTimeTracking: {
      pageViewEventType: 'page_view',
      activityWindowMillis: 5_000,
      heartbeatIntervalMillis: 15_000,
      inactivityTimeoutMillis: 180_000,
    },
  },
});

// Explicit tracking starts an additional logical view, even at the same URL.
amplitude.track('page_view', { article_id: '123' });
```

- `false` or omitted: disabled. `autocapture: true` does not enable this experimental feature.
- `true` or `{}`: use `[Amplitude] Page Viewed` and the default timings above.
- An options object: optionally override `pageViewEventType` and any of the three durations.

`true` uses `[Amplitude] Page Viewed`, even if `pageViews.eventType` renames automatic events. Set `pageViewEventType` explicitly to track a renamed or custom event. Matching is exact and case-sensitive; other event types are delivered normally. The `pageViews` setting is not changed: the engagement plugin can independently generate lifecycle events using its configured name. The Browser SDK reuses a matching default page-view source for initialization/navigation to avoid duplicate automatic views.

## Standalone plugin

The plugin can be installed independently of the page-view plugin:

```ts
import { engagedTimeTrackingPlugin } from '@amplitude/plugin-engaged-time-tracking-browser';

await amplitude.init(API_KEY, { autocapture: false }).promise;
await amplitude.add(engagedTimeTrackingPlugin({ pageViewEventType: 'page_view' })).promise;
// Explicit tracking starts an additional logical view, even at the same URL.
amplitude.track('page_view', { article_id: '123' });
```

Use either the Browser SDK option or manual installation; installing the same named plugin twice is ignored by the SDK.

## Lifecycle and delivery

**Behavior to highlight: inactivity renewal creates another PageView, including for custom event names.** The expired view is finalized. Once the user becomes active again on the same page (or returns to a visible page via focus), a new event is generated with the configured `pageViewEventType`, fresh timestamp, insert ID, page-view ID, and delay group. This retains the established default engaged-time behavior; custom page views are not a different lifecycle mode. Same-page renewal retains article/business properties but uses current SDK identity/session and refreshes URL, scroll, and viewport metadata. Navigation clears the previous page's business-property template.

Initialization and valid `pushState`/`replaceState`/`popstate` navigation create page views. A standalone plugin owns these sources; when the Browser SDK already has a page-view plugin producing the same event type, that source is reused instead. `replaceState` triggers a view only when it changes the URL, matching the main-branch default source. `trackHistoryChanges: 'pathOnly'` ignores query-only navigation.

Switching tabs pauses engagement. Returning before expiry resumes the same view without generating another. Returning after expiry, renewed activity after identity/session/reset boundaries, and BFCache restoration can generate a new view. Prerendered standalone initialization waits for activation. Teardown and opt-out stop generation; opt-in re-enables activity-based renewal. The next explicitly tracked matching event always starts a fresh view, even at the same URL. Applications that also manually emit page views for an automatic lifecycle transition must account for the additional view; this API does not silently deduplicate business events.

`pageViews.trackOn` controls the default page-view source, not event-name matching or engagement enablement. Its default emits at initialization/navigation; a callback gates those automatic events; `'attribution'` converts a campaign identify into a page view. The independent option remains opt-in and matches the final event name regardless of the source. If that default source owns the configured name, the engagement plugin waits for its first event rather than bypassing its `trackOn` decision. After accepting a view, it owns lifecycle renewal.

The new plugin calls `PageEngagement.start(event)` during enrichment, after the event reaches its `execute()` method, as did the earlier implementation before extraction. Neither begins counting synchronously inside `track()`. Queueing, event-loop scheduling, and upstream async enrichment can delay that call; it has no fixed upper bound. Original `event.time` is preserved, but engagement/total-time accumulation begins at the actual `start()` call and is not backdated. Heartbeat cadence, batch flush interval, and backend finalization are separate delivery timings, not a fixed delay before counting starts.

Snapshots add `[Amplitude] Engaged Time` and `[Amplitude] Total Time` in milliseconds. They also include snapshot version/reason diagnostics. Ingestion is delayed until finalization or the service fallback timeout. Snapshots retain the original enriched page context. Delayed events omit `user_properties`; send user-property updates using a separate `identify()` call. If a snapshot is too large for the heartbeat queue, the original event is sent normally without engagement tracking.

Opt-out discards active state. Opt-in permits the next matching event or qualifying activity to create a view. A view held in asynchronous enrichment across an identity, session, consent, or page-exit boundary is canceled; a view held across navigation is sent normally without starting engagement for a later page.

## Ownership boundary

`autocapture.engagedTimeTracking` is the only engagement entry point. The superseded nested page-view option is removed; the PageView plugin has no timer, heartbeat, lifecycle renewal, or dependency on this package. Its runtime source and tests match `main`.

The new plugin captures a fully enriched page-view snapshot once. Heartbeats send that snapshot directly to all installed SDK destinations instead of calling the ordinary event pipeline again. Existing destination queues, storage, batching, retry, coalescing, and delayed-service routing are reused. PageView counters, URL enrichment, and user enrichment do not rerun on every heartbeat. No engagement-specific snapshot guard is needed in the PageView or Page URL enrichment plugins.
