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

amplitude.track('page_view', { article_id: '123' });
```

- `false` or omitted: disabled. `autocapture: true` does not enable this experimental feature.
- `true` or `{}`: use `[Amplitude] Page Viewed` and the default timings above.
- An options object: optionally override `pageViewEventType` and any of the three durations.

Enabling engagement never enables page-view autocapture. `true` only matches the default event name, even if `pageViews.eventType` renames automatic events. Set `pageViewEventType` explicitly to track a renamed or custom event. Matching is exact and case-sensitive; other event types are delivered normally.

## Standalone plugin

The plugin can be installed independently of the page-view plugin:

```ts
import { engagedTimeTrackingPlugin } from '@amplitude/plugin-engaged-time-tracking-browser';

await amplitude.init(API_KEY, { autocapture: false }).promise;
await amplitude.add(engagedTimeTrackingPlugin({ pageViewEventType: 'page_view' })).promise;
amplitude.track('page_view', { article_id: '123' });
```

Use either the Browser SDK option or manual installation; installing the same named plugin twice is ignored by the SDK.

## Lifecycle and delivery

The plugin starts only when it receives a matching event. The next matching event finalizes the previous view and starts a new delay group, even at the same URL. URL changes through `pushState`, `replaceState`, or `popstate`, page exit (including BFCache), inactivity, identity/session changes, reset, and teardown end the current view. Switching tabs pauses engagement; returning before expiry resumes it.

After a view ends, focus, user activity, and BFCache restoration do **not** synthesize a replacement page view. A subsequent matching event is required to resume tracking. This preserves customer control over page-view counts. Engagement begins when the plugin receives the event; supplying an older event timestamp does not backfill interaction time.

Snapshots add `[Amplitude] Engaged Time` and `[Amplitude] Total Time` in milliseconds. They also include snapshot version/reason diagnostics. Ingestion is delayed until finalization or the service fallback timeout. Snapshots retain the original enriched page context. Delayed events omit `user_properties`; send user-property updates using a separate `identify()` call. If a snapshot is too large for the heartbeat queue, the original event is sent normally without engagement tracking.

Opt-out discards active state. Opt-in waits for the next matching event. A view held in asynchronous enrichment across an identity, session, consent, or page-exit boundary is canceled; a view held across navigation is sent normally without starting engagement for a later page.

## Legacy configuration

`autocapture.pageViews.trackEngagedTime` remains supported for compatibility with the earlier experimental API and its automatic renewal behavior. An explicit `autocapture.engagedTimeTracking` setting, including `false`, takes precedence and disables legacy engagement to prevent duplicate snapshots. New integrations should use the independent option.
