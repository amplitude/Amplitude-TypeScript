# Shadow DOM support

Design notes, operational constraints, performance characteristics, and planned follow-ups for shadow-DOM autocapture and selector generation.

**Packages involved**

| Package | Responsibility |
|---------|----------------|
| `@amplitude/element-selector` | Selector generation (`pierce`, `segmentWalk`, `resolveSelector`) and shared traversal primitives (`walkComposedAncestors`, `collectOpenShadowRoots`) |
| `@amplitude/plugin-autocapture-browser` | Capture layer: event targets, ancestor walks, `ShadowGate`, mutation/exposure observers |

Remote config fields: `shadowDomEnabled` (default `false`), `maxShadowDomDepth` (default `1`, clamped to `[1, 10]`). These are independent from the selector engine kill switch (`enabled`).

See also: [`packages/element-selector/README.md`](../element-selector/README.md#shadow-dom) (config summary), [`tools/shadow-harness/README.md`](../../tools/shadow-harness/README.md) (multi-site validation).

---

## Architecture

### Two independent axes

| Axis | Config | Effect |
|------|--------|--------|
| Selector algorithm | `enabled` | Strategy-chain engine vs legacy `cssPath` |
| Shadow piercing | `shadowDomEnabled` | Cross shadow boundaries vs stay in one tree |

The selector engine dispatches at the top level (`engine.ts`): off-shadow uses a single-tree path; on-shadow uses `pierce` across segments joined by ` >>> `.

Capture helpers use the same pattern: light-DOM implementations are unchanged from pre-shadow behavior; shadow paths are separate functions gated by `ShadowMode.enabled`.

### `ShadowGate` and `onArm`

`ShadowGate` (`src/shadow-mode.ts`) holds the page-scoped shadow mode. It **latches on** the first remote-config delivery that enables shadow support and does not revert until the next full page load.

`onArm` notifies subscribers (mutation observable, exposure observable) to run **one-time discovery scans** — attaching `MutationObserver` instances to existing open shadow roots and registering in-shadow elements for exposure. This handles the case where observables subscribe before remote config arrives.

**First delivery wins for depth too.** If the first arming payload has `maxShadowDomDepth: 1` and a later one says `3`, depth stays at `1` for the page.

`ShadowGate` stays at the observable boundary. Per-event code reads `ShadowMode` once (e.g. in `addAdditionalEventProperties`) and passes it into helpers.

### What does not need observers

| Feature | Mechanism |
|---------|-----------|
| Click / change capture | `document` listeners (`capture: true`) + `composedPath()` when shadow is on |
| Selector generation | On-demand at event time via `engine.generate` |

Observers are required for **DOM-change awareness** (mutation events, dead-click / action-click heuristics) and **exposure discovery** (registering `IntersectionObserver` targets).

### MutationObserver fan-out

A single `MutationObserver` cannot see into shadow trees (`subtree: true` stops at each boundary). The implementation attaches **one observer instance to every discovered open shadow root** (`src/observables.ts`).

Discovery sources today:

1. **`onArm`** — full scan of `document.body` when shadow support enables
2. **`addedNodes`** — on each mutation batch, DFS (`collectOpenShadowRoots`) on every added `Element`

---

## Late shadow roots

Three distinct scenarios:

| Scenario | Example | Supported? |
|----------|---------|------------|
| **A. Late host mount** | New `<my-host>` appended; shadow attached in `connectedCallback` | **Yes** — host appears in `addedNodes` |
| **B. Late remote config** | Shadow roots already in DOM when `shadowDomEnabled` flips on | **Yes** — `onArm` full scan |
| **C. Late `attachShadow` on existing element** | Host already in DOM; `attachShadow()` called later | **No** — no mutation; host does not reappear in `addedNodes` |

**What still works for scenario C:** click/change capture and selector generation (document listeners + `composedPath`).

**What breaks for scenario C:** mutation events inside that root, dead-click / action-click heuristics that depend on in-shadow mutations, exposure for elements already inside the root at attach time.

---

## Performance

### Off path (`shadowDomEnabled: false`)

No meaningful overhead. Top-level dispatch keeps pre-shadow code paths; the mutation callback returns immediately after `readGate()`.

### On path — per click (low concern)

Per captured event when shadow is on:

- `composedPath()` (native)
- `walkComposedAncestors` for closest-ancestor and hierarchy (typically ~10–30 nodes)
- `segmentWalk` + selector generation (default depth 1 → at most two tree segments)

Ancestor walks are duplicated across closest-ancestor, hierarchy, and selector — acceptable at normal DOM depth; could be merged in a follow-up.

### On path — steady state (main concern)

| Cost | Concern | Notes |
|------|---------|-------|
| MO fan-out per shadow root | Medium | Same observer config on each root; in-shadow `characterData` / `attribute` mutations multiply callback volume |
| DFS in mutation callbacks | **High** | `collectOpenShadowRoots` on every `addedNodes` `Element`; exposure also calls `querySelectorAllDeep` → another DFS |
| `onArm` full-document scan | Medium (once) | Scales with page size; not continuous |
| Traversal caps | Safety net | `MAX_SHADOW_DOM_TRAVERSAL_NODES` (50k), `MAX_SHADOW_COMPOSED_WALK_ITERATIONS` (1024) |

**Risk profile:** Low for pages with few web components; higher for SPAs with many shadow roots and heavy DOM churn (large `addedNodes` subtrees).

---

## The DFS problem

Today, shadow-root discovery in mutation callbacks works by **depth-first scanning** the subtree under each added element (`collectOpenShadowRoots` in `@amplitude/element-selector`). Exposure discovery compounds this with `querySelectorAllDeep` on the same nodes.

This runs **synchronously inside `MutationObserver` callbacks** — the worst place for unbounded work. Inserting one large container can trigger a scan of up to 50k nodes per added element.

### Ways to avoid or reduce DFS

| Approach | Fixes discovery DFS? | Fixes exposure DFS? | Tradeoffs |
|----------|---------------------|---------------------|-----------|
| **`attachShadow` patch** | **Yes** — register root at creation O(1) | No | **High risk on real pages** — see [Monkey patch coexistence](#monkey-patch-coexistence); prefer non-patch mitigations first |
| **`ShadowRootRegistry`** (extract discovery layer) | Enables all options below | Yes, if exposure subscribes to registry events | Refactor; cleaner than embedding discovery in MO callback |
| **Register on `shadowRoot` only** — check `node.shadowRoot` on added node, skip full subtree DFS | Partial | N/A | Misses nested roots deeper in subtree unless parent is walked |
| **Cheap pre-check** — only DFS if subtree contains custom elements / known hosts | Partial | Partial | Heuristic; may miss uncommon patterns |
| **Batch per frame** — queue `addedNodes`, scan once in `requestAnimationFrame` / `queueMicrotask` | Reduces frequency | Reduces frequency | Still DFS, but amortized; adds latency to discovery |
| **Narrow MO config on shadow roots** — `childList` only, drop `characterData` where not needed | No | No | Reduces mutation volume, not DFS |
| **Targeted exposure** — `node.matches(allowlist)` then `querySelector` on node only; deep scan only for known hosts | No | **Yes** | More logic; must handle nested shadow inside added subtree |

**Recommended combination for a follow-up** (patch optional, not default):

1. **`ShadowRootRegistry`** — single place for `onArm` scan + `addedNodes` handling; mutation and exposure subscribe to it
2. **Targeted exposure indexing** — avoid `querySelectorAllDeep` on every added node; match self + shallow query, deep scan only when a new root is registered
3. **Batch discovery** per animation frame as a safety valve on DFS hot spots
4. **`attachShadow` patch** — only if profiling still shows discovery gaps *and* a chain-safe coexistence story is proven (see below). Not the first lever.

The monkey patch **does not** remove MO fan-out, mutation volume, or per-click walks — only the “hunt for shadow roots via DFS” path.

---

## Monkey patch coexistence

An `Element.prototype.attachShadow` monkey patch is **problematic on many customer pages** because other libraries patch the same global. Autocapture must not assume it owns that prototype.

**Known patchers on Amplitude pages**

| Library | Why it patches `attachShadow` |
|---------|------------------------------|
| **Session Replay (`@amplitude/rrweb-record`)** | `ShadowDomManager` — observe mutations inside shadow trees for replay |
| **Other rrweb consumers** | Same pattern (PostHog, etc.) |
| **Frameworks / runtimes** | Stencil, LWC synthetic shadow, and others detect or replace built-ins |

**Failure modes if autocapture patches naively**

- **Replacing instead of chaining** — skips another library’s wrapper; replay or framework behavior breaks.
- **Restoring the native method on teardown** — removes *all* wrappers beneath ours, not just our layer.
- **`toString` / native-code checks** — frameworks may detect a non-native `attachShadow` and install their own polyfill, causing double-patching or broken recording.

**If a patch is ever added**, it must:

1. Wrap whatever is **currently** on `Element.prototype.attachShadow` (not assumed-native).
2. Call `previous.call(this, init)` and return the same `ShadowRoot`.
3. Restore only **our** layer (`proto.attachShadow = previous`), never the native implementation.
4. Preserve `toString` from the wrapped function (rrweb does this for Stencil compatibility).
5. Avoid uninstall while session replay is active — shadow mode already latches for the page.

There is **no shared hook today** between autocapture and session replay for shadow-root registration; coexistence depends entirely on a correct wrapper chain.

**Practical implication:** treat the patch as a last resort. Prefer `ShadowRootRegistry`, cheaper `addedNodes` checks (`node.shadowRoot`), batched discovery, and targeted exposure before adding another global patcher. Scenario C (late `attachShadow` on an existing host) may remain a documented gap rather than risk destabilizing rrweb or customer frameworks.

---

## Planned follow-ups

Track these as incremental PRs. Check off in PR descriptions when complete.

### Correctness

- [ ] **Scenario C regression test** — document intentional gap (late `attachShadow` on existing host); clicks still work; mutation/exposure may miss
- [ ] **Operator docs** — first delivery wins for `maxShadowDomDepth`, not just on/off
- [ ] **`attachShadow` patch (evaluate last)** — scenario C only; chain-safe; dual-plugin e2e with session replay; skip if coexistence cannot be guaranteed

### Architecture

- [ ] **`ShadowRootRegistry`** — extract discovery from `createMutationObservable`; expose `onRootAdded(root, depth)`
- [ ] **Wire exposure to registry** — remove duplicate `onArm` full-document scan where registry can drive indexing
- [ ] **Rename `onArm` → `onceWhenEnabled`** (optional clarity pass)

### Performance

- [ ] **Remove discovery DFS from MO callback** via registry + cheaper checks (not necessarily a global patch)
- [ ] **Targeted exposure indexing** — no full `querySelectorAllDeep` on every `addedNodes` element
- [ ] **Batch discovery** per frame (if profiling shows remaining hot spots)
- [ ] **Merge click-path ancestor walks** — single `walkComposedAncestors` pass for closest + hierarchy
- [ ] **Evaluate MO config per root** — `childList`-only on shadow roots if `characterData` is not required for mutation events there
- [ ] **Micro-benchmark / perf script** — DOM churn on `test-server/shadow-dom-test.html` with long-task measurement

### Validation

- [ ] **CI or scheduled job** for `tools/shadow-harness` against a small `urls.txt` corpus
- [ ] **Dual-plugin e2e** — autocapture + session replay together (required before any `attachShadow` patch ships)
- [ ] **Capture off-path differential** — extend if new helpers are added (see `test/shadow-capture-off-path.test.ts`)

---

## Key source files

| File | Purpose |
|------|---------|
| `src/shadow-mode.ts` | `ShadowGate`, `ShadowMode`, latch semantics |
| `src/observables.ts` | Mutation fan-out, exposure discovery |
| `src/helpers.ts` | Capture helpers (dispatch pattern), `resolveEventTarget` |
| `src/hierarchy.ts` | Ancestor walks, shadow-root-top sibling indexing |
| `src/data-extractor.ts` | Gate arming, per-event enrichment |
| `../element-selector/src/helpers/shadow.ts` | Shared traversal, `collectOpenShadowRoots`, caps |
| `../element-selector/src/engine.ts` | `pierce`, selector dispatch |

## Tests

| Test file | Covers |
|-----------|--------|
| `test/shadow-gate.test.ts` | Latch, `onArm`, late config, shared gate |
| `test/shadow-capture.test.ts` | Helpers, MO fan-out, late host mount |
| `test/shadow-capture-off-path.test.ts` | Kill-switch: off path unchanged on shadow DOM |
| `test/shadow-integration.test.ts` | End-to-end capture on/off |
| `e2e/shadow-dom.spec.ts` | Real browser: retargeting, `composedPath` |
| `../element-selector/test/shadow.test.ts` | Selector pierce, `resolveSelector`, traversal primitives |
| `../element-selector/test/scenarios/off-path-differential.test.ts` | Engine kill-switch differential |
