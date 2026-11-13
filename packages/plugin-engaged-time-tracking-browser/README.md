# Engaged-time tracking

Experimental browser enrichment plugin for cumulative engaged time on default or custom page-view events. Each logical view keeps its event name, timestamp, insert ID, identity/session, and existing properties across delayed snapshots.

## Options

The plugin accepts `EngagedTimeOptions`:

| Option | Default | Behavior |
| --- | --- | --- |
| `pageViewEventType` | `[Amplitude] Page Viewed` | Exact, case-sensitive source event name to observe |
| `secondaryPageViewEventType` | Primary event name | Name for SDK-generated same-page lifecycle renewals |
| `activityWindowMillis` | 5,000 ms | Rolling window counted as engaged after activity |
| `heartbeatIntervalMillis` | 15,000 ms | Cumulative snapshot cadence, capped below the inactivity timeout |
| `inactivityTimeoutMillis` | 180,000 ms | Finalize after inactivity; maximum 24 hours |

## Lifecycle

The plugin waits for a matching source event. Initialization, navigation, focus, and activity cannot create a view before the first source. Each matching event finalizes the preceding logical view and starts a new delay group. URL changes alone do not create custom PageViews.

After inactivity the old view is finalized. Resumed same-page activity creates a minimal event using `secondaryPageViewEventType`, falling back to the primary name when omitted. It receives fresh IDs and does not copy the previous view's business properties. Repeated idle cycles use the same naming rule. Application events with only the secondary name are not implicitly captured.

Blur/visibility pauses and resumes engagement. Page exit, BFCache, identity/session/reset, and consent boundaries finalize or cancel state as appropriate. A generated renewal queued across navigation is canceled. Teardown and opt-out stop generation. Page-exit delivery is best effort.

## Snapshot delivery

The source event returns to its original pipeline with delay metadata; Heartbeat does not send a duplicate first copy. Periodic and final snapshots use the real `client.track()` and the full SDK pipeline. The internal `extra.engagedTimeReplay` marker prevents recapture and lets page enrichment preserve its original context. Unmarked new logical views and unrelated delayed events retain normal enrichment.

The source event and top-level properties are shallow-copied. Nested business objects remain shared references and should not be mutated after tracking. Later enrichment executes on each send; returned fields are not implicitly saved to the source. Capture page context before this plugin when installing it in an SDK.

Snapshots add engaged/total time in milliseconds and version/reason diagnostics. Finalization retains the view's insert ID, timestamp, identity/session and delay ID, and removes `delay.timeout` for delayed-service finalization. Delayed events omit `user_properties`; use a separate `identify()` call. Queue admission failure falls back to ordinary delivery without engagement rather than throwing from this plugin. Shared Heartbeat and Timeline implementations are unchanged.

Browser SDK configuration, built-in registration order, and integration examples are delivered in the dependent Browser integration layer.
