# @amplitude/amp-semantic

Internal, composable semantic capture runtime for Amplitude. This increment adds context capture through a host interface. Session Replay wiring follows separately.

The host supplies a document, window, and transport callback. `createCapture` accepts typed recorder factories and optional per-family budgets (200 events per session by default). With no recorders supplied it emits nothing and installs no browser listeners.

The runtime owns opt-in sampling, start/stop and session reset, event version/timestamp/identity stamping, host snapshot signals, exception isolation, and cleanup rollback. Sampling and caps survive stop/start and reset only for a new session. Identity is allocated lazily when an event is accepted; its fallback is document-scoped memory, with no storage access.

Recorders register teardown immediately with `onCleanup` when setup can fail. `canEmit` lets them avoid expensive payload work at capacity. `dropped` returns delivery-cap diagnostics; recorders acknowledge successfully delivered diagnostics with `clearDropped`.

The `snapshot` host signal describes an accepted full snapshot; the runtime does not subscribe to rrweb itself. The host remains responsible for privacy-safe payloads, recording consent, transport, and any persisted tab identity.

Session Replay integration and visibility are added in separate follow-up PRs. No analytics SDK depends on this package in this increment.

## Development

From the repository root, install dependencies and build with Node 24, `pnpm install`, and `pnpm build`. Run `pnpm --filter @amplitude/amp-semantic test` for runtime lifecycle and public contract tests.

## Context recorder

`createSemanticCapture(config, host)` installs the context recorder by default. The host additionally supplies `sdk`, `getPrivacy`, and optional analytics context and stylesheet-inlining configuration. Call `notify('snapshot', undefined)` after an accepted full snapshot to emit context. Starting capture alone emits nothing.

`amp-semantic/context` records the effective mask level for the snapshot URL (including URL overrides), stylesheet counts, viewport, a device heuristic, language, user agent, visibility and focus snapshots, analytics SDK configuration, and dropped-event counts. The runtime stamps version, timestamp and document identity. It never captures input values or page text.

The context budget is 200 events per session. At capacity the recorder skips stylesheet and other payload reads. Successfully delivered context acknowledges dropped-event diagnostics; failed delivery preserves them. `schema.json` describes the rrweb custom-event envelope expected from a future transport adapter.
