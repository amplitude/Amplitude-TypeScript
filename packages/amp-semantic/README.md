# @amplitude/amp-semantic

Experimental browser semantic capture for Amplitude Session Replay. The package emits versioned captured facts; it does not classify user intent or upload data.

## Package boundary

`amp-semantic` depends on the shared DOM privacy package, not rrweb, the analytics client, or Session Replay. A `SemanticHost` supplies the DOM, replay node IDs, current privacy/URL configuration, analytics capability information, and a synchronous event sink. The Session Replay adapter translates these events into `amp-semantic/<family>` rrweb custom events.

Capture is disabled by default. The runtime owns sampling, per-session caps, family switches, subscriptions, error containment, and teardown. Each recorder owns its DOM listeners, observers, and timers. Stopping capture preserves session caps and the sampling decision; `resetSession()` starts a new accounting period. Hosts should forward `snapshot` only after the corresponding full snapshot has entered the recording stream.

## Session Replay integration

```ts
sessionReplay.init(API_KEY, {
  deviceId,
  sessionId,
  semanticCapture: {
    enabled: true,
    sampleRate: 1,
    families: { 'click-outcome': false },
  },
});
```

The analytics Session Replay plugin accepts the same `semanticCapture` option. The remote `sr_semantic_config` object can override enabled, sample rate, and individual families. The standalone capture runtime also supports immediate `updateConfig()` calls; SDK remote settings follow the existing SDK config-refresh/restart lifecycle.

The adapter emits synchronously through `recordFunction.addCustomEvent`, avoiding debug metadata and asynchronous size lookups. It queues initial snapshot notifications until rrweb returns its cancellation callback and emits terminal recording state before cancellation.

## Host API and extensions

```ts
const capture = createSemanticCapture(config, host);
capture.start();
capture.notify('recording', { state: 'start', reason: 'init' });
capture.notify('snapshot', undefined);
// When the host owns navigation tracking:
capture.notify('navigation', 'push');
capture.notify('recording', { state: 'stop', reason: 'customer_stop' });
capture.stop();
```

Pass a third argument containing recorder factories to replace the default recorder set. Built-in factories and `defaultRecorders` are exported so hosts can compose a subset. A `SemanticRecorder` declares its families and implements `setup(context)`, returning complete cleanup. Call `context.onCleanup()` immediately after acquiring a resource when setup could subsequently fail; the runtime unwinds those resources if setup throws. Context signal subscriptions are automatically scoped to their recorder. Cleanup should be idempotent.

To add an event family, add its payload to `SemanticPayloads`, its session limit to `SEMANTIC_CAPS`, its wire variant to `schema.json`, and its factory to the desired recorder set. Wire tags and payload `v` are stable contracts. Breaking payload changes require a new version; avoid encoding application classification into capture facts.

`SemanticHost.externalClicks` and `externalNavigation` let hosts reuse existing native hooks instead of attaching duplicate hooks. The current replay hook does not expose the native `MouseEvent`; the adapter therefore uses the package's native click listener. Recorder processing timestamps are supplied to generic hosts. rrweb's current `addCustomEvent` controls its own wire timestamp, so exact ±1 ms alignment with MouseInteraction remains a browser integration requirement.

## Privacy and limits

All captured text uses the replay privacy policy, including referenced labels and nested text sources. Blocked elements are skipped, masked text is `null`, and typed values and browser validation messages are never included. Text traversal is bounded and fails closed when its budget is exceeded. Unsupported URL schemes are discarded; HTTP(S) paths and hash routes are templated without queries or secondary fragments. Detached dialog names are cleared because their former masking ancestry cannot safely be reconstructed.

Recorders include context, clicks, page identity/checks, field state, form submissions, notices, dialogs, recording state, visibility, lifecycle, click outcomes, and an accepted-analytics-event mirror. Click outcomes reuse autocapture's mutation/navigation definition and observer categories. They are suppressed when dead/error frustration capture is available.

## Remaining integration and release work

- The analytics mirror requires a host signal after analytics enrichment/filtering accepts an event for delivery. The existing Session Replay plugin `execute()` runs too early; SDK forwarding is intentionally not wired there.
- Coordinated cross-origin child iframe capture bypasses the ordinary snapshot callback and needs an additional rrweb lifecycle bridge. Semantic recorders currently operate on their host document, not a shadow-root/iframe forest.
- The click-outcome wire payload cannot distinguish auxiliary clicks; modifier clicks and `_blank` links are excluded, but auxiliary eligibility is not yet identical to autocapture.
- Within-frame dialog open/close transitions can coalesce in the observer batch.
- The inherited 100% unit-coverage threshold is retained and is not yet met. Do not treat passing tests with coverage disabled as a passing release gate.
- The real-browser smoke fixture checks shapes, privacy, teardown, reconfiguration, and click dispatch overhead. It does not establish the ≤5% replay-byte budget or exact rrweb timestamp/ID alignment on production journeys. Actionable-ancestor click IDs can differ from rrweb's raw target IDs; that spec tension needs explicit resolution before release.

## Validation

Build dependencies first, then run the package's build, test, and lint scripts. `schema.json` validates complete rrweb custom-event envelopes and is shipped with the package for downstream consumers. Fixture tests cover each specified family and reject extra raw-value fields.

For a real Chromium smoke check, from the repository root:

```sh
node packages/amp-semantic/test/e2e/smoke.cjs
```

The smoke check uses the workspace's Vite and Playwright installations. It validates actual emitted events against the schema and reports measured click-dispatch p95 for its fixture.
