# @amplitude/amp-semantic

Composable semantic capture for Session Replay. This first increment ships only
`amp-semantic/context` and `amp-semantic/visibility`. Capture is disabled by default.

## Enable through Session Replay

```ts
sessionReplay.init(API_KEY, {
  deviceId: DEVICE_ID,
  sessionId: SESSION_ID,
  sampleRate: 1,
  semanticCapture: {
    enabled: true,
    sampleRate: 1,
    families: { context: true, visibility: true },
  },
});
```

The analytics Session Replay plugin accepts the same `semanticCapture` option.
Semantic sampling is additional to replay sampling. A stable random draw is kept
across stop/start cycles within the session; a new session resets sampling and caps.
Each family allows at most 200 events per session in this capture instance.
`families` disables individual registered families when set to `false`; omitted
families are enabled. Only context and visibility are registered in this release.

The remote `sr_semantic_config` can override `enabled`, `sampleRate`, and individual
family settings. A partial remote config does not enable capture unless local or
remote `enabled` is true. Remote `enabled: false` is the kill switch.

## Events

Both are rrweb custom events (`type: 5`). The envelope has the rrweb timestamp and
`data.tag`; the payload has `v: 1`, `tab_id`, and `document_id`. `schema.json`
describes the two supported wire payloads.

| Event | When | Payload |
| --- | --- | --- |
| `amp-semantic/context` | Each accepted rrweb full snapshot, after recording is ready | SDK, effective default mask level, stylesheet counts, viewport, device heuristic, language, user agent, current visibility and focus, analytics configuration, optional dropped-event counts |
| `amp-semantic/visibility` | Document visibility changes, with duplicates suppressed | `state: "hidden"` or `"visible"` |

```json
{
  "type": 5,
  "timestamp": 1792627218062,
  "data": {
    "tag": "amp-semantic/visibility",
    "payload": {
      "v": 1,
      "tab_id": "tab-uuid",
      "document_id": "document-uuid",
      "state": "hidden"
    }
  }
}
```

Context is a snapshot, not continuous tracking: `visibility_state` and `focused`
describe that moment. Visibility events update the document visibility timeline;
focus/blur do not emit events. A visible document need not have keyboard focus.
Browser notification timing can vary, particularly in embedded browsers. Visibility
does not measure element visibility, user activity, or explain all replay gaps.

`css.inlined` counts readable stylesheets when the host has stylesheet inlining
enabled; it is not confirmation that each sheet was included in the replay.
`css.unreadable` counts access failures, including cross-origin restrictions, not
failed network loads. No stylesheet contents are read into the payload. `device`
is a viewport/coarse-pointer heuristic. Analytics autocapture lists configuration,
not a guarantee that every detector is active.

No DOM text, field values, URLs, click targets, or accessibility trees are captured
by these two families. The privacy setting is reported as context, while rrweb
continues to enforce replay masking. The package adds one document visibility
listener, no DOM observers or polling. Context collection runs only on snapshots
and stops doing payload work when its cap is exhausted.

## Identity and lifecycle

The runtime stamps identity centrally. Session Replay supplies a tab ID using
session storage and a document ID in memory. A normal same-tab navigation reuses
the tab ID when the outgoing page releases ownership on `pagehide`; a copied,
still-owned storage record generates a fresh ID. Blocked storage or a missing
pagehide can result in a fresh tab ID on navigation. IDs are correlation hints,
not an authoritative browser tab registry. Child frames do not claim parent storage.

Stop, shutdown, reinitialization, and loss of recording eligibility detach capture.
Identity bookkeeping is shared for the document lifetime; its pagehide/pageshow
listeners do not emit semantic lifecycle events. Existing rrweb delivery and upload
policies still apply to semantic custom events.

## Extension boundary

`createSemanticCapture(config, host, recorders?)` injects the host and accepts
recorders. The runtime owns sampling, caps, timestamps, identity, fault isolation,
subscriptions, and cleanup. This package does not import rrweb or an analytics SDK.
Dialog and notice recorders, DOM enrichment helpers, and forwarding rrweb mutations
are deferred to the next increment. Clicks, forms, keys, navigation, resource errors,
recording/lifecycle events, and analytics-event forwarding are also not shipped here.

## Local validation

From the repository root, run `pnpm install` and `pnpm build`, then:

```sh
pnpm --filter @amplitude/amp-semantic test --runInBand
pnpm --filter @amplitude/session-replay-browser test --runInBand
pnpm exec vite --port 5175
```

Open `/session-replay-browser/sr-semantic-test.html`. The fixture uses local
configuration and transport handlers; it does not upload replay data to Amplitude.
Switch Chrome tabs and return, then flush to inspect visibility timestamps. Stop
and resume to verify cleanup and new context snapshots. Query parameters
`enabled=false`, `sampleRate=0`, `disabled=context`, `disabled=visibility`, and
`remoteEnabled=false` exercise the capture gates.
