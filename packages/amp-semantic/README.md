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

## Semantic identity and visibility

Every new semantic payload includes `tab_id` and `document_id`. The capture runtime stamps these
fields centrally, including when the context family is disabled. The host can inject `getIdentity()`;
without it, the package uses shared in-memory IDs for its host document, with no storage or listeners.

The Session Replay host lazily creates identity only when a semantic event is accepted. In a top-level
page it stores an opaque tab ID and document owner in sessionStorage (`AMP_semantic_tab_v1`).
Actual `pagehide` releases ownership so normal same-origin reloads/navigation reuse the tab ID;
each newly loaded document gets a new document ID. A copied record with a live owner gets a fresh
tab ID. A bfcache restore preserves the original document identity and reclaims ownership.
SPA navigation, stop/resume, and session resets preserve both IDs within the current document.
These IDs are unrelated to the replay event store's internal ownership ID.

Storage unavailable, corrupt, or a missing navigation boundary can break tab continuity. Capture
falls back to document-scoped in-memory IDs when storage is blocked; it never requires storage to
emit. Child-frame hosts use document-scoped IDs without modifying top-level tab storage; they are
not correlated to the parent's tab. The lightweight identity ownership listeners last for the
page lifetime once initialized, while recorder listeners are removed on stop. Disabled or
sampled-out capture does not initialize identity storage or listeners.

Context includes `visibility_state`, `focused` (`document.hasFocus()`), and `user_agent`.
Visibility emits `{ state, focused, trigger }` for changed visibility/focus pairs, where trigger is
`visibilitychange`, `focus`, or `blur`. Window focus changes are observed separately from focus
moving between form controls. Identical state notifications are deduplicated. Focus and visibility
are observations, not proof of attention or a reason for leaving the page.

The wire version remains `v: 1`; the schema accepts legacy payloads without these fields. Missing
identity/focus/visibility means unknown. These additions only identify semantic events. They do not
attribute interleaved raw rrweb events, link an opener to its child, or implement multi-tab DOM replay.

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

### Local Session Replay inspector

From the repository root, run:

```sh
pnpm dev:semantic
```

This builds Session Replay and its workspace dependencies, then opens `http://127.0.0.1:5174/session-replay-browser/sr-semantic-test.html` in the existing Vite test server. After package source changes, run `pnpm build:semantic` again and reload. The page also works with the repository's normal `pnpm dev` watch workflow.

Interact with the checkout form, dialog, notice, navigation, and privacy fixtures. The inspector decodes actual Session Replay transport batches, validates every `amp-semantic/*` rrweb envelope against `schema.json`, and displays its payload. Use **Flush batches** to inspect the current recording immediately, filter by family, or **Export semantic JSON** to save the captured envelopes.

Controls let you change replay masking, semantic sampling, family switches, and worker transport. **Stop recording** and **Resume recording** exercise the public SDK lifecycle. Disabled or sampled-out semantic capture should leave ordinary replay events flowing. The inspector lives in a blocked shadow tree so its own log updates do not change click-outcome observations.

No real API key is needed. Custom config and transport callbacks handle data locally in memory; the fixture does not upload to Amplitude. Reloading clears its log, which retains up to 10,000 replay events. The analytics mirror is not connected to this SDK path yet.

### Browser integration tests

```sh
pnpm test:semantic
```

This builds the dependencies and runs the package's Chromium Playwright suite, starting the local Vite server automatically. If Chromium is not installed, run `pnpm exec playwright install chromium` first. After a build, use `pnpm --filter @amplitude/amp-semantic test:playwright --ui` for interactive debugging.

The suite covers real SDK → rrweb → serialized transport delivery, schema validation, direct-button click node ID matching, fields/submits, notices/dialogs/navigation, masking, disabled capture, sampling, the remote kill switch, individual family switches, stop/resume, JSON export, and worker transport. It also checks that inspector rendering does not falsely classify a no-change click. These fixture checks do not establish production byte budgets or exact timestamp alignment.

For an isolated Chromium recorder smoke check, from the repository root:

```sh
node packages/amp-semantic/test/e2e/smoke.cjs
```

The smoke check uses the workspace's Vite and Playwright installations. It validates actual emitted events against the schema and reports measured click-dispatch p95 for its fixture.
