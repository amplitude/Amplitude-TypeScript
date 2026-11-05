# @amplitude/amp-semantic

Internal, composable semantic capture runtime for Amplitude. This increment installs no production event recorders and is not connected to Session Replay.

The host supplies a document, window, and transport callback. `createSemanticCapture` accepts typed recorder factories and optional per-family budgets (200 events per session by default). With no recorders supplied it emits nothing and installs no browser listeners.

The runtime owns opt-in sampling, start/stop and session reset, event version/timestamp/identity stamping, host signals, subscriptions, exception isolation, and cleanup rollback. Sampling and caps survive stop/start and reset only for a new session. Identity is allocated lazily when an event is accepted; its fallback is document-scoped memory, with no storage access.

Recorders register teardown immediately with `onCleanup` when setup can fail. `canEmit` lets them avoid expensive payload work at capacity. `dropped` returns delivery-cap diagnostics; recorders acknowledge successfully delivered diagnostics with `clearDropped`.

The `snapshot` host signal describes an accepted full snapshot; the runtime does not subscribe to rrweb itself. The host remains responsible for privacy-safe payloads, recording consent, transport, and any persisted tab identity.

Context, Session Replay integration, and visibility are added in separate follow-up PRs. No analytics SDK depends on this package in this increment.

## Development

From the repository root, install dependencies and build with Node 24, `pnpm install`, and `pnpm build`. Run `pnpm --filter @amplitude/amp-semantic test` for runtime lifecycle and public contract tests.
