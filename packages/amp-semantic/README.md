# @amplitude/amp-semantic

Internal, composable semantic capture runtime for Amplitude. Context, visibility, and browser lifecycle capture use a host interface. Session Replay supplies configuration, identity, recording signals, and rrweb transport.

The host supplies a document, window, and transport callback. `createCapture` accepts typed recorder factories and optional per-family budgets (200 events per session by default). With an empty recorder list it emits nothing and installs no browser listeners.

The runtime owns opt-in sampling, start/stop and session reset, event version/timestamp/identity stamping, host snapshot signals, exception isolation, and cleanup rollback. Sampling and caps survive stop/start and reset only for a new session. Identity is allocated lazily when an event is accepted; its fallback is document-scoped memory, with no storage access.

Recorders register teardown immediately with `onCleanup` when setup can fail. `canEmit` lets them avoid expensive payload work at capacity. `dropped` returns delivery-cap diagnostics; recorders acknowledge successfully delivered diagnostics with `clearDropped`.

The `snapshot` host signal describes an accepted full snapshot; the runtime does not subscribe to rrweb itself. The host remains responsible for privacy-safe payloads, recording consent, transport, and any persisted tab identity.

Context, visibility, browser lifecycle, and navigation are the default recorders in this increment. Session Replay accepts this package through a locally supplied createCapture callback; capture remains disabled by default.

## Development

From the repository root, install dependencies and build with Node 24, `pnpm install`, and `pnpm build`. Run `pnpm --filter @amplitude/amp-semantic test` for runtime lifecycle and public contract tests.

## Context recorder

`createSemanticCapture(config, host)` installs the context, visibility, lifecycle, and navigation recorders by default. The host additionally supplies `sdk`, `getPrivacy`, and optional analytics context and stylesheet-inlining configuration. Call `notify('snapshot', undefined)` after an accepted full snapshot to emit context. Starting capture alone emits nothing.

`amp-semantic/context` records the effective mask level for the snapshot URL (including URL overrides), stylesheet counts, viewport, a device heuristic, language, user agent, visibility and focus snapshots, analytics SDK configuration, and dropped-event counts. The runtime stamps version, timestamp and document identity. It never captures input values or page text.

The context budget is 200 events per session. At capacity the recorder skips stylesheet and other payload reads. Successfully delivered context acknowledges dropped-event diagnostics; failed delivery preserves them. `schema.json` describes the rrweb custom-event envelope used by the Session Replay adapter.

## Session Replay integration

Import `createSemanticCapture` from `@amplitude/amp-semantic` and enable with `semanticCapture: { enabled: true, createCapture: createSemanticCapture }` (also supported by the Session Replay analytics plugin). Without a local createCapture callback, semantic capture is inert even if remote configuration enables it. The replay SDK has no production dependency on this package; applications that opt in include its code in their own bundle. To load it later, dynamically import the semantic package before initializing replay with its createCapture callback. Additional sampling and a per-family switch apply within replay-selected sessions. Remote configuration can disable capture. The adapter waits for rrweb readiness, forwards accepted full snapshots, and tears down capture on stop or reinitialization. A new session resets sampling and caps.

Accepted context becomes a type-5 rrweb custom event tagged `amp-semantic/context`. The host persists tab identity in session storage when available and keeps document identity in memory, with a fallback when storage is unavailable. The analytics plugin forwards its autocapture configuration.

For local validation, build with `pnpm build`, then run `pnpm exec vite --host 127.0.0.1 --port 5174 --strictPort`. Open `/session-replay-browser/sr-semantic-test.html`. The inspector uses local transport and no real API key. `pnpm --filter @amplitude/amp-semantic test:playwright` runs Chromium transport and lifecycle tests.

## Visibility recorder

`amp-semantic/visibility` emits only hidden/visible transitions, deduplicated from the document's `visibilitychange` event. Its payload contains `state`, version and identity; focus/blur alone do not emit events. The listener is removed on stop and recreated on resume. Disable only this family with `semanticCapture: { enabled: true, createCapture: createSemanticCapture, families: { visibility: false } }`.

The initial state is present in context. The visibility budget is 200 events per session. Native notification timing is browser-dependent; an embedded browser can report transitions late. Browser tests inject deterministic transitions to verify transport and timestamps, while native tab behavior should be checked manually in Chrome.

## Navigation recorder

`amp-semantic/navigation` mirrors accepted `amplitude/url-tracking@1` rrweb plugin observations. It adds no history patches, polling, or page scans. The URL plugin applies configured UGC rules first; the semantic recorder then removes origins and queries and templates identifier-shaped path and hash-route segments. Other literal path segments remain, so configure UGC rules for sensitive routes. Each observation retains its plugin timestamp, even if two different URLs map to the same template. Empty URLs are ignored. Disable this family with `families: { navigation: false }`; the budget is 200 events per session.

## Browser lifecycle recorder

`amp-semantic/lifecycle` records `pagehide`, `pageshow`, `pageshow_bfcache`, `freeze`, and `resume` as browser boundaries. The BFCache variant is selected when `pageshow.persisted` is true. Its payload contains only the boundary type plus version and identity. These events support deriving replay gaps and resume intervals downstream; they do not claim that a recording stopped or restarted. The listener is removed on stop. Disable this family with `families: { lifecycle: false }`. The budget is 200 events per session.
