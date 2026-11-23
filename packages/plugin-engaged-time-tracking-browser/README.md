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
      secondaryPageViewEventType: 'Engagement Resumed',
      activityWindowMillis: 5_000,
      heartbeatIntervalMillis: 15_000,
      inactivityTimeoutMillis: 180_000,
    },
  },
});

// The application supplies the initial view and subsequent navigation views.
amplitude.track('page_view', { article_id: '123' });
```

- `false` or omitted: disabled. `autocapture: true` does not enable this experimental feature.
- `true` or `{}`: use `[Amplitude] Page Viewed` and the default timings above.
- An options object: optionally override `pageViewEventType`, `secondaryPageViewEventType`, and any of the three durations.

`true` uses `[Amplitude] Page Viewed`, even if `pageViews.eventType` renames automatic events. Set `pageViewEventType` explicitly to track a renamed or custom event. Matching is exact and case-sensitive; other event types are delivered normally. Installation depends only on `autocapture.engagedTimeTracking`; `pageViews` is not changed or inspected. The plugin waits for a matching event. With `pageViews: false` and no matching event, engagement never starts—even after focus, activity, or navigation.

## Lifecycle and delivery

**Behavior to highlight: inactivity renewal creates another PageView, including for custom event names.** The expired view is finalized. Once the user becomes active again on the same page (or returns to a visible page via focus), a new event is generated with `secondaryPageViewEventType` (falling back to `pageViewEventType` when omitted), fresh timestamp, insert ID, and delay group. The renewal supplies only the event name and internal lifecycle context. It does not copy article, campaign, URL, title, scroll, viewport, or other properties from the previous view, and this plugin does not generate Page View ID or Page Counter properties. Normal SDK enrichment may add its own fields; the engagement engine adds its existing timing and snapshot diagnostics. Original application events retain their supplied properties throughout their own snapshots.

Set `secondaryPageViewEventType` to distinguish resumed engagement from primary PageViews in analytics. Omitting it preserves the primary event name, including the default `[Amplitude] Page Viewed`. Every SDK-generated lifecycle renewal uses this secondary name, including repeated idle cycles and recovery after BFCache or identity/session/reset boundaries. Application-supplied navigation events still use `pageViewEventType`; the plugin does not start timing arbitrary application events with the secondary name. Snapshots retain the name of their own logical view. The old view finalizes at the existing inactivity deadline; configuring a secondary name does not extend it. Aggregate both names when reporting total engagement across these periods.

Initialization and navigation do not create events in this plugin. The existing PageView plugin supplies default events according to its own configuration; applications supply custom events with `track(pageViewEventType, properties)`. Each matching event finalizes the preceding logical view and starts the next delay group. URL/history changes alone do not define a new custom logical view or end the current one. After a URL change, renewal also waits for a matching PageView for that URL.

Switching tabs pauses engagement. Returning before expiry resumes the same view without generating another. Returning after expiry, renewed activity after identity/session/reset boundaries, and BFCache restoration can generate a new view. Before the first accepted matching event, activation, focus, activity, identity changes, and BFCache restoration cannot generate a view. Teardown and opt-out stop generation; opt-in re-enables activity-based renewal. The next explicitly tracked matching event always starts a fresh view, even at the same URL. Applications that also manually emit page views for an automatic lifecycle transition must account for the additional view; this API does not silently deduplicate business events.

`pageViews.trackOn` controls the default page-view source, not event-name matching or engagement enablement. Its default emits at initialization/navigation; a callback gates those automatic events; `'attribution'` converts a campaign identify into a page view. The independent option remains opt-in and matches the final event name regardless of the source. The engagement plugin always waits for its first matching event and never bypasses a source's `trackOn` decision. After accepting a view, it owns lifecycle renewal.

During normal initialization, the Browser SDK installs engagement after PageView tracking and Page URL enrichment. Page Counter is part of PageView tracking: it increments once for each event matching that source's configured name. The first event continues through the original pipeline once. Heartbeat/final snapshots use the real client and carry the internal `extra.engagedTimeReplay` marker: PageView tracking preserves their counter without incrementing SDK state, and URL enrichment preserves every captured page field, including Previous Page. Other delayed events, including Video Analytics, are enriched normally. A genuine renewed PageView passes through normal enrichment once and can increment the counter. Custom events do not acquire a counter when the PageView source is disabled or matches another name.

For example, with `pageViews: { trackOn: 'attribution' }`, `engagedTimeTracking: true`, and user-property attribution enabled, visiting `?utm_source=newsletter&utm_medium=email&utm_campaign=launch` causes attribution to emit a campaign `$identify`. PageView tracking converts that campaign event to `[Amplitude] Page Viewed` and assigns counter 1; URL enrichment adds page/referrer context; engagement then starts timing. Repeated heartbeats retain counter 1. An ordinary `$identify` such as a plan update is not converted. `trackOn: 'attribution'` does not itself emit page views at initialization or on every navigation; it requires a qualifying campaign event.

The new plugin calls `pageEngagement.start(event)` during enrichment, after the event reaches its `execute()` method, as did the earlier implementation before extraction. Neither begins counting synchronously inside `track()`. Queueing, event-loop scheduling, and upstream async enrichment can delay that call; it has no fixed upper bound. Original `event.time` is preserved, but engagement/total-time accumulation begins at the actual `start()` call and is not backdated. Heartbeat cadence, batch flush interval, and backend finalization are separate delivery timings, not a fixed delay before counting starts.

Snapshots add `[Amplitude] Engaged Time` and `[Amplitude] Total Time` in milliseconds. They also include snapshot version/reason diagnostics. Ingestion is delayed until finalization or the service fallback timeout. Snapshots retain the original enriched page context. Delayed events omit `user_properties`; send user-property updates using a separate `identify()` call. If source data cannot be serialized or a snapshot is too large for the heartbeat queue, the original event is sent normally without engagement tracking.

Opt-out discards active state. Opt-in permits the next matching event, or qualifying activity after a previously accepted view, to create a view. A view held in asynchronous enrichment across an identity, session, consent, or page-exit boundary is canceled; an application view held across navigation is sent normally without starting engagement for a later page. A generated renewal queued across navigation is canceled before page enrichment when detected in the before phase; if navigation occurs during upstream asynchronous enrichment, it is canceled at engagement instead.

## Enrichment order and replay

The Browser SDK adds engagement at the end of normal built-in plugin installation, after PageView/counter and URL enrichment. Engagement copies the event at that point, adds its delay group and initial timing properties, and returns the first event to the existing pipeline. It does not enqueue another immediate send. Enrichment plugins registered afterward, including Session Replay in Unified, continue processing that first event and every replay.

Heartbeat and final snapshots call the real `client.track()`. Only these replays carry `extra.engagedTimeReplay: true`; the engagement plugin passes them through without starting another view. PageView and URL plugins skip their page mutation for this specific marker. Renewed views are new, unmarked source events and receive normal counting and page enrichment. The internal marker is not a public configuration option or a new plugin interface.

The saved data includes the source timestamp, insert ID, identity/session, business properties and page fields already added by preceding plugins. The event and its top-level event properties are shallow-copied; nested business objects remain shared references, consistent with ordinary SDK event handling. Applications and custom plugins must not mutate those nested objects after tracking. Later plugins may return new objects; their results do not automatically update the saved source. They execute afresh on every snapshot, so their own properties (including SR ID) may change or be removed according to their current logic. Arbitrary custom enrichment can still overwrite fields. Manually installing a page-context plugin after engagement does not retroactively add its context to the saved view.

Initial opt-out can defer another plugin's registration until opt-in, placing that plugin after engagement. This PR does not add special installation ordering for that general SDK case. The first event still continues through later plugins, but their returned fields are not automatically captured for replays; a deferred PageView counter or URL plugin may therefore add fields to the initial event that are absent from the saved snapshots.

## Processing and lifecycle

Replays run `process()` and the complete before/enrichment/destination pipeline. With an original nonzero `time`, Browser Context does not advance `lastEventTime`; the saved event/session IDs are supplied again. Browser still evaluates session expiration and campaign changes. A replay in the current session can therefore start a new SDK session and finalize the old logical view. A replay explicitly belonging to an older session does not start another session. Session start/end tracking and other plugins retain their ordinary SDK side effects. Context also assigns the supplied event ID back to `lastEventId`; this is normal replay processing, not a side-effect-free delivery path.

Identity/session/reset boundaries keep the old view's identity on its final snapshot. Final delivery is deferred to a microtask so synchronous Browser identity/session updates complete before reentering `track()`. `flush()` drains pending timeline events before flushing destinations; asynchronous plugins and browser page-exit constraints can still delay or prevent delivery. Separate logical views can be delivered in a different order after enrichment, but each keeps its original time and delay group.

## Ownership boundary

`autocapture.engagedTimeTracking` is the only engagement entry point. The superseded nested page-view option is removed. PageView has no timer, heartbeat, or lifecycle-renewal ownership; PageView and URL enrichment only recognize marked replays to avoid repeating their page mutations.

The original event supplies the first delayed snapshot. The engagement engine then updates a private Heartbeat queue at the configured cadence and sends subsequent/final snapshots through the real client. The snapshot-client destination adapter has been removed. Existing destination queues, storage, batching, retry, coalescing and delayed-service routing remain in use. Finalization retains the original insert ID, timestamp and delay ID, and removes `delay.timeout` for the service's `instant_events` path. Delayed events continue to omit `user_properties`.
