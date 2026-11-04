# @amplitude/amp-semantic

Package foundation for semantic event capture in Amplitude. This increment establishes
workspace packaging, CommonJS/ESM builds, TypeScript declarations, linting, tests, and
the shared event envelope. It does not collect or emit events.

## Public contracts

- `SEMANTIC_VERSION`: payload envelope version (`1`).
- `SemanticIdentity`: `tab_id` and `document_id` correlation fields.
- `SemanticEventEnvelope<Name, Payload>`: a typed name, timestamp, and payload
  containing the caller's fields plus version and identity.

No event families are defined or registered. The package has no browser listeners,
DOM observers, storage access, identity generation, capture runtime, or Session Replay
integration. It is not yet a usable capture SDK.

## Incremental implementation

1. **This PR:** package structure and shared envelope contracts.
2. **Context and visibility:** capture runtime, sampling/caps, identity generation,
   recorders, event schemas, Session Replay integration, and a local test page.
3. **Dialog and notice:** rrweb mutation input, DOM enrichment, and feedback recorders.
4. Additional event families in later PRs.

The existing full implementation remains available in PR #2082. Each event increment
should add its contracts, implementation, documentation, and validation together.

## Development

From the repository root:

```sh
pnpm install
pnpm build
pnpm --filter @amplitude/amp-semantic typecheck
pnpm --filter @amplitude/amp-semantic test --runInBand
pnpm --filter @amplitude/amp-semantic lint
```

The package build cleans `lib` before generating `lib/cjs` and `lib/esm`, avoiding stale
recorders when switching between incremental branches. Runtime dependencies are limited
to the workspace-standard TypeScript helper library; event-specific dependencies arrive
with their implementations.
