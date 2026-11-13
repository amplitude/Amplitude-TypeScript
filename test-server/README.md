# TEST SERVER

This is a test server that serves HTML pages from this directory using Vite. The HTML pages are tagged with scripts that reference JS files from the packages directory.

If you have any use-cases of the SDK that you'd like to test, please add a new HTML page to this project and test it from there.

## DEV

To run this in 'dev' mode, from the root of this project, run `pnpm dev`. This will both watch for changes to the packages and update them as they change; and it will run a Vite dev server. This means that as you make changes to any of the JS files (or downstream files) that are referenced by the HTML page, the changes will be reflected immediately and the page will do a hot reload.

## Engaged-time SDK demo

Engaged-time tracking is **experimental** and disabled by default. Its API and behavior may change.

Open `/browser-sdk/engaged-time.html` after building the packages and starting Vite
(`pnpm exec vite --host 127.0.0.1`). The app imports the local Browser SDK, enables
`autocapture.engagedTimeTracking`, and displays actual HTTP payloads. Its
default local receiver acknowledges requests without simulating delayed ingestion.
Select Amplitude US and supply a project API key to test the actual delayed service.
Select the custom page-view checkbox to disable automatic page views and send
`page_view` events from the demo on initialization and article navigation. The engagement plugin waits for those events; it only generates replacement views after an accepted view ends.

The defaults are a 5,000 ms rolling activity window, 15,000 ms heartbeat, and
180,000 ms (3 minutes) page inactivity timeout. This is one setting used for two paths:
the SDK finalizes after that duration without qualifying activity, and each snapshot
sends the same duration as the delayed request's top-level `timeout` field. The service
renews its fallback deadline from the last accepted heartbeat and finalizes the latest
stored snapshot if the SDK cannot deliver its final snapshot. Heartbeats do not reset
the SDK inactivity timer. Expiry and Event API ingestion are separate steps; integration
testing still needs to verify actual delivery latency. The SDK options are
`activityWindowMillis`, `heartbeatIntervalMillis`, and
`inactivityTimeoutMillis` inside `autocapture.engagedTimeTracking`.
Use `true` or `{}` for default timings, `false` to disable, or an options object to
customize timings. Omitting `engagedTimeTracking` leaves engagement disabled by default.
Invalid durations fall back to defaults; the heartbeat
is capped at half the page timeout to leave room for service renewal. Tracking is
disabled by default. Video keeps its separate 60-second heartbeat and one-hour TTL.

Use the default settings (5 seconds / 15 seconds / 3 minutes) to check:

1. Leave the page idle: engagement stops after five seconds, snapshots keep the same
   `insert_id`, `time`, and source-provided page properties, and the three-minute timeout emits
   one final copy in `instant_events`.
2. Move, scroll, or type before expiry: the same logical page resumes.
3. Switch tabs or applications: engagement pauses immediately. Return before
   expiry to resume. After expiry, renewed activity automatically generates a new logical view with the configured event name. Renewal does not copy the previous view's application or page properties; normal SDK enrichment and engagement metrics still apply.
4. Navigate to another article: the demo emits the next matching page-view event,
   which finalizes the old view with its original URL and starts a new delay group. Leaving the
   document finalizes even when it enters BFCache. Returning through Back/Forward
   automatically starts a new view once visible and focused. Switching tabs still only pauses engagement.
5. Opt out: local engagement state is discarded. Opt in and interact to start anew.
6. Finish tracking: the final copy is sent and page listeners are removed.

The inspector counts outgoing payloads, not ingested analytics events. Local mode
does not validate service TTL behavior. Page exit delivery is best effort; a killed
or suspended browser relies on the service's last accepted cumulative snapshot.

## Production preview

To run this in 'prod' mode, run `pnpm build` and then run `pnpm start`. This will build the assets and serve the statically. This mode currently has no use-case, but could be used in the future to run end-to-end tests. This will likely never be served in production as a web page because it's only for testing.

# HTTPS

To run the server as HTTPS follow these steps

1. add "local.website.com" to `/etc/hosts`
2. generate the certificates using the script "npm run generate-signed-cert"
3. add the cert.pem (at ~/certs/local-website/cert.pem) to the macOS keychain so that it's trusted by your browser
4. run `pnpm dev:ssh` and it will open the website at https://local.website.com

## TIPS
* You can enable a "Workspace" in Chrome on this site, which allows you to edit the files from inside the browser

### Engaged-time configuration

```js
autocapture: {
  pageViews: false,
  engagedTimeTracking: {
    pageViewEventType: 'page_view',
    secondaryPageViewEventType: 'Engagement Resumed',
    activityWindowMillis: 5_000,
    heartbeatIntervalMillis: 15_000,
    inactivityTimeoutMillis: 180_000,
  },
}
```

| SDK `engagedTimeTracking` value | Meaning |
| --- | --- |
| Omitted / `undefined` | No explicit choice; disabled by default |
| `false` | Explicitly disabled |
| `true` or `{}` | Enabled with default timings |
| Options object | Enabled with supplied timings; omitted timings use defaults |

Engaged page views and their snapshots omit `user_properties`. Send user-property updates separately with `identify()`. A delayed page view may arrive after newer events when the service expires it; carrying older user-property updates would overwrite newer values in ingestion order.

`engagedTimeTracking` and `pageViews` are independent. `true` or `{}` matches only
`[Amplitude] Page Viewed`; specify `pageViewEventType` to match a custom or renamed
event. Engagement preserves the original lifecycle behavior: initialization and
valid navigation produce views, and renewed activity after inactivity creates a
fresh view with `secondaryPageViewEventType`, falling back to the primary event name when omitted. An active view resumes without an extra
PV. **Highlight: custom page views automatically renew too; configure a separate secondary name to avoid inflating primary PV counts.**
Sending a manual PV for the same automatic transition can create another logical view.
Engagement has one entry point: `autocapture.engagedTimeTracking`. The earlier
nested experimental option is removed. PageView has no engagement timer or lifecycle ownership.
The original event sends the first delayed snapshot through the normal SDK pipeline.
Heartbeat and final snapshots call the real client and repeat the pipeline, using an
internal engagement-replay marker to preserve Page Counter and all captured URL fields,
including Previous Page. Other enrichment, including Session Replay, runs normally.
Video Analytics delayed events do not carry this marker and keep their existing behavior.
See [the plugin README](../packages/plugin-engaged-time-tracking-browser/README.md)
for lifecycle, processing side effects and replay limitations.

## nuqs SPA

Run `pnpm dev:nuqs` for the [nuqs page-view example](./nuqs-spa/README.md) at http://127.0.0.1:5174/. Initialize the real SDK with a test project's API key, select `all` (default) or `pathOnly`, and observe page views from nuqs query-state updates.
