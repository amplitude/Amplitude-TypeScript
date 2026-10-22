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
    families: { keys: false },
  },
});
```

The analytics Session Replay plugin accepts the same `semanticCapture` option. The remote `sr_semantic_config` object can override enabled, sample rate, and individual families. The standalone capture runtime also supports immediate `updateConfig()` calls; SDK remote settings follow the existing SDK config-refresh/restart lifecycle.

The adapter emits synchronously through `recordFunction.addCustomEvent`, avoiding debug metadata and asynchronous size lookups. It queues initial snapshot notifications until rrweb returns its cancellation callback and emits terminal recording state before cancellation.

## Semantic identity and visibility

Click `states` includes `mixed` (native checkbox indeterminate or ARIA checked/pressed mixed),
`busy` (the target's aria-busy), and `open` (native details/dialog), alongside existing states.
Mixed observations omit the checked token. Field events include optional `checked: true | false`
for native checkbox/radio controls, including masked controls; blocked controls remain excluded.
Other field types omit it, and older events without it mean unknown. These reads use existing
event handlers, with no extra observers, scans, or layout checks. Radio peers and silent programmatic
state changes are not continuously tracked. `value_state` is not checkbox selection state.

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
Visibility emits `{ state, trigger: "visibilitychange" }` only when the document changes
between hidden and visible. Both transitions emit immediately, with no settling timer. Duplicate
visibility notifications and standalone window/element focus or blur events emit nothing.
Visibility payloads omit `focused`: focus may arrive after the visibility boundary, and a one-time
snapshot would be misleading as the focus state for the visible interval. Initial visibility is
included in context. The visibility listener is removed on stop or family disabling. Visibility
is an observation, not proof of attention or a reason for leaving the page.
The wire schema still accepts legacy `focused` fields and `focus`/`blur` triggers from earlier
recordings. Context retains its observation-time `focused` snapshot; local diagnostics also show
raw focus notifications, but neither is continuous semantic focus tracking.

The local replay inspector displays millisecond timestamps and separate visibility diagnostics for
browser event creation, handler execution, and batch decoding. These diagnostics stay local and
are not semantic payload fields. A reported embedded-browser switch produced hidden/visible
observations only 4 ms apart despite several seconds away; the cause is still under investigation.
Do not treat that pair as a measured absence interval. Synthetic visibility tests do not establish
native browser tab-switch behavior.

The wire version remains `v: 1`; the schema accepts legacy payloads without these fields. Missing
identity/focus/visibility means unknown. These additions only identify semantic events. They do not
attribute interleaved raw rrweb events, link an opener to its child, or implement multi-tab DOM replay.

## Host API and extensions

```ts
const capture = createSemanticCapture(config, host);
capture.start();
capture.notify('recording', { state: 'start', reason: 'init' });
capture.notify('snapshot', undefined);
// Invalidate cached interaction headings after host navigation:
capture.notify('navigation', 'push');
capture.notify('recording', { state: 'stop', reason: 'customer_stop' });
capture.stop();
```

Pass a third argument containing recorder factories to replace the default recorder set. Built-in factories and `defaultRecorders` are exported so hosts can compose a subset. A `SemanticRecorder` declares its families and implements `setup(context)`, returning complete cleanup. Call `context.onCleanup()` immediately after acquiring a resource when setup could subsequently fail; the runtime unwinds those resources if setup throws. Context signal subscriptions are automatically scoped to their recorder. Cleanup should be idempotent.

To add an event family, add its payload to `SemanticPayloads`, its session limit to `SEMANTIC_CAPS`, its wire variant to `schema.json`, and its factory to the desired recorder set. Wire tags and payload `v` are stable contracts. Breaking payload changes require a new version; avoid encoding application classification into capture facts.

`SemanticHost.externalClicks` lets hosts reuse existing native click hooks. Session Replay routes primary clicks through its existing heatmap `ClickHandler` and rrweb's `mouseInteraction` hook, including when heatmaps are disabled. The hook receives the original event in memory, preserving modifiers, keyboard activation, trust and composed-path targeting. Native events are never added to recorded rrweb data. Selector lookup is shared for the same element within one click; an actionable ancestor gets its own lookup when it differs from the raw target. Consumer failures are isolated.

The pinned rrweb recorder has a workspace patch adding an optional native-event hook argument and `record.supportsNativeMouseInteraction`. Replace this patch with a published recorder release before publishing the SDK: workspace patches do not propagate to consumers of the unbundled package. Older recorders retain the independent native listener as a compatibility fallback. `externalAuxClicks: false` keeps the middle-button `auxclick` listener because rrweb does not forward auxiliary clicks. Standalone semantic capture still installs its own native listeners.

Recorder processing timestamps are supplied to generic hosts. rrweb's `addCustomEvent` controls its own wire timestamp, so exact ±1 ms alignment with MouseInteraction remains a browser integration requirement.

## Privacy and limits

All captured text uses the replay privacy policy, including referenced labels and nested text sources. Blocked elements are skipped, masked text is `null`, and typed values and browser validation messages are never included. Text traversal is bounded and fails closed when its budget is exceeded. Unsupported URL schemes are discarded; HTTP(S) paths and hash routes are templated without queries or secondary fragments. Detached dialog names are cleared because their former masking ancestry cannot safely be reconstructed.

The page event and its title observer, scheduled checks, and page-wide scans are deferred. URL/heading context on interactions remains; the replay adapter forwards navigation solely to invalidate cached headings.

Recorders include context, clicks, keys, resource load failures, field state, form submissions, notices, dialogs, recording state, visibility, lifecycle, and an accepted-analytics-event mirror.

## Work limits

Recorders call `context.canEmit(family)` before expensive payload construction when possible.
A cap-rejected candidate increments the dropped count without resolving its text, selector, or
layout; `emit()` still enforces the cap independently. This is not a reservation. Recorders retain
cheap transition bookkeeping and shared subscriptions so another family is not silently disabled.
Field candidates rejected before deduplication can contribute to the dropped count.

Notice/dialog mutation callbacks enqueue affected roots. Overlapping subtree discovery is deduplicated
and processed in batches of at most 1,000 visited elements and a cooperative 4 ms budget; payload
processing is limited to 50 candidates per batch and shares that time budget. Blocked subtrees are
skipped. Large bursts may span multiple animation frames, so these are observation-time facts, not
precise timestamps of each DOM mutation. One initial dialog selector query establishes the baseline;
it no longer resolves names or reads layout for every existing dialog.

Heading discovery traverses at most 2,000 elements with a cooperative 2 ms budget and reuses only the
DOM candidate for up to 250 ms. Text, masking and visibility are re-read when emitted; no private text
is cached. Navigation, snapshots, disconnected candidates and hidden candidates invalidate discovery.
New higher-priority headings may take up to 250 ms to be selected, and over-budget discovery can omit
a heading. These budgets are checked between DOM operations, not hard deadlines for browser calls.

The SDK still has separate autocapture/replay observers; this package does not introduce a shared observer across those packages.

## Remaining integration and release work

- The analytics mirror requires a host signal after analytics enrichment/filtering accepts an event for delivery. The existing Session Replay plugin `execute()` runs too early; SDK forwarding is intentionally not wired there.
- Coordinated cross-origin child iframe capture bypasses the ordinary snapshot callback and needs an additional rrweb lifecycle bridge. Semantic recorders currently operate on their host document, not a shadow-root/iframe forest.
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

Controls let you change replay masking, semantic sampling, family switches, and worker transport. **Stop recording** and **Resume recording** exercise the public SDK lifecycle. Disabled or sampled-out semantic capture should leave ordinary replay events flowing. The inspector lives in a blocked shadow tree to keep its own controls and log updates outside recorded content.

No real API key is needed. Custom config and transport callbacks handle data locally in memory; the fixture does not upload to Amplitude. Reloading clears its log, which retains up to 10,000 replay events. The analytics mirror is not connected to this SDK path yet.

### Browser integration tests

```sh
pnpm test:semantic
```

This builds the dependencies and runs the package's Chromium Playwright suite, starting the local Vite server automatically. If Chromium is not installed, run `pnpm exec playwright install chromium` first. After a build, use `pnpm --filter @amplitude/amp-semantic test:playwright --ui` for interactive debugging.

The suite covers real SDK → rrweb → serialized transport delivery, schema validation, direct-button click node ID matching, fields/submits, notices/dialogs, post-navigation click context, masking, disabled capture, sampling, the remote kill switch, individual family switches, stop/resume, JSON export, and worker transport. It also checks ordinary clicks without a page change. These fixture checks do not establish production byte budgets or exact timestamp alignment.

For an isolated Chromium recorder smoke check, from the repository root:

```sh
node packages/amp-semantic/test/e2e/smoke.cjs
```

The smoke check uses the workspace's Vite and Playwright installations. It validates actual emitted events against the schema and reports measured click-dispatch p95 for its fixture.


## Keys and resource errors

`keys` emits `{ key, target: { id, role, name } }` with common identity/version fields. It allows
Escape, Enter, Tab, arrows, Home/End, PageUp/PageDown, F1–F12 and Ctrl/Meta+K/P/F (optionally Shift).
Modifier prefixes are canonical. Ordinary typing, Backspace/Delete, repeat, IME/composition,
AltGraph, password/hidden inputs, and blocked targets are excluded. Names use shared masking;
control values and editable text are never names. Browser/OS-intercepted shortcuts are unavailable.
The target is the actual DOM key target, not an inferred cause of a dialog transition.

`resource-error` emits `{ rt, count, container?, path? }`, where `rt` is img/css/font/script. Only
observed load failures are captured, not runtime exceptions or fetch/XHR. Identical resource type,
templated path, and container are aggregated over 500 ms; 100 pending groups force an early flush.
Counts saturate at 65,535. Hidden/pagehide flushes immediately; stop/disable discards pending groups.
The rrweb timestamp is batch emission time. Do not infer exact click attribution from that timestamp.
Paths omit origins, queries and fragments; data/blob/invalid/over-200-character paths are omitted.
Detached/blocked elements are dropped and container masking is checked again at emission.

FontFaceSet loadingerror supplies a failed-face count; font URLs and affected containers are not
available, so those fields are omitted. Font family names are never sent. Document-level font counts
cannot attribute or exclude a failure specific to a blocked region. Element errors in shadow roots
and other frame documents, and failures before capture starts, are outside this recorder's coverage.
There are no retrospective requests, polling, or DOM/CSS scans.

Caps are 1,000 keys and 200 resource-error groups per session. Disable either independently with
`families: { keys: false, 'resource-error': false }`. The local playground has a command palette
(Ctrl/Cmd+K, Escape) and a button that triggers real missing local image/CSS/script/font requests.
