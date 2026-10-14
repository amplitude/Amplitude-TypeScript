# TEST SERVER

This is a test server that serves HTML pages from this directory using Vite. The HTML pages are tagged with scripts that reference JS files from the packages directory.

If you have any use-cases of the SDK that you'd like to test, please add a new HTML page to this project and test it from there.

## DEV

To run this in 'dev' mode, from the root of this project, run `pnpm dev`. This will both watch for changes to the packages and update them as they change; and it will run a Vite dev server. This means that as you make changes to any of the JS files (or downstream files) that are referenced by the HTML page, the changes will be reflected immediately and the page will do a hot reload.

## Engaged-time SDK demo

Open `/browser-sdk/engaged-time.html` after building the packages and starting Vite
(`pnpm exec vite --host 127.0.0.1`). The app imports the local Browser SDK, enables
`autocapture.pageViews.trackEngagedTime`, and displays actual HTTP payloads. Its
default local receiver acknowledges requests without simulating delayed ingestion.
Select Amplitude US and supply a project API key to test the actual delayed service.

The defaults are a 5,000 ms rolling activity window, 15,000 ms heartbeat, and
180,000 ms (3 minutes) page inactivity timeout. This is one setting used for two paths:
the SDK finalizes after that duration without qualifying activity, and each snapshot
sends the same duration as the delayed request's top-level `timeout` field. The service
renews its fallback deadline from the last accepted heartbeat and finalizes the latest
stored snapshot if the SDK cannot deliver its final snapshot. Heartbeats do not reset
the SDK inactivity timer. Expiry and Event API ingestion are separate steps; integration
testing still needs to verify actual delivery latency. The SDK options are
`engagementThresholdMillis`, `heartbeatIntervalMillis`, and
`pageSessionTimeoutMillis` inside `autocapture.pageViews.trackEngagedTime`.
Use `true` or `{}` for default timings, `false` to disable, or an options object to
customize timings. Omitting `trackEngagedTime` leaves engagement disabled by default.
Invalid durations fall back to defaults; the heartbeat
is capped at half the page timeout to leave room for service renewal. Tracking is
disabled by default. Video keeps its separate 60-second heartbeat and one-hour TTL.

Use the default settings (5 seconds / 15 seconds / 3 minutes) to check:

1. Leave the page idle: engagement stops after five seconds, snapshots keep the same
   `insert_id`, `time`, page-view ID, and counter, and the three-minute timeout emits
   one final copy in `instant_events`.
2. Move, scroll, or type before expiry: the same logical page resumes.
3. Switch tabs or applications: engagement pauses immediately. Return before
   expiry to resume, or after expiry to start a new logical view on activity.
4. Navigate to another article: the old view finalizes with its original URL and
   the new view gets new IDs. Prerendered pages wait for activation. Leaving the
   document finalizes even when it enters BFCache. Returning through Back/Forward
   starts a new view once the restored page is visible and focused, even before
   the previous inactivity deadline. Switching tabs still only pauses engagement.
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

### Engaged-time configuration and remote config

```js
autocapture: {
  pageViews: {
    trackEngagedTime: {
      engagementThresholdMillis: 5_000,
      heartbeatIntervalMillis: 15_000,
      pageSessionTimeoutMillis: 180_000,
    },
  },
}
```

| SDK `trackEngagedTime` value | Meaning |
| --- | --- |
| Omitted / `undefined` | No explicit choice; disabled by default |
| `false` | Explicitly disabled |
| `true` or `{}` | Enabled with default timings |
| Options object | Enabled with supplied timings; omitted timings use defaults |

The existing remote-config translator accepts the same nested feature shape as
other autocapture options. Under
`configs.analyticsSDK.browserSDK.autocapture.pageViews`, the proposed wire value is:

```json
{
  "trackEngagedTime": {
    "enabled": true,
    "engagementThresholdMillis": 5000,
    "heartbeatIntervalMillis": 15000,
    "pageSessionTimeoutMillis": 180000
  }
}
```

The translator removes `enabled: true`, leaving the options object (or `true`
when there are no other fields); `enabled: false` becomes `false`. A separate
`trackEngagedTimeEnabled` setting is unnecessary. This is verified against the
SDK translator and join logic; backend authoring of this new field is not yet
verified.

Browser autocapture remote values take precedence, including over local `false`.
The existing merge is shallow: omitting remote `pageViews` preserves the local
page-view configuration, but supplying remote `pageViews` replaces that whole
object. It does not merge individual engagement timings with local timings.
