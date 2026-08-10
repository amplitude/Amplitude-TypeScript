# Shadow DOM support

Autocapture can pierce **open** shadow roots when remote config enables it. Clicks inside a shadow tree produce element paths that cross boundaries (` >>> ` between per-tree segments). The selector engine resolves those paths with `resolveSelector` — plain `document.querySelector` cannot pierce shadow boundaries.

**Default:** shadow piercing is off (`shadowDomEnabled: false`). It is independent from the selector engine kill switch (`enabled`).

| Package | Responsibility |
|---------|----------------|
| `@amplitude/element-selector` | Traversal primitives (`pierce`, `segmentWalk`, `resolveSelector`), selector generation across boundaries |
| `@amplitude/plugin-autocapture-browser` | Event targets, composed ancestor walks, `ShadowGate`, mutation and exposure observers |

**Remote config**

| Field | Default | Notes |
|-------|---------|-------|
| `shadowDomEnabled` | `false` | Turns shadow piercing on for the page (see latch below) |
| `maxShadowDomDepth` | `1` | How many shadow boundaries a walk may cross; clamped to `[1, 10]` |

Config field details and selector syntax: [`packages/element-selector/README.md`](../element-selector/README.md#shadow-dom).

---

## How it works

### Two independent switches

| Switch | Config | What changes |
|--------|--------|--------------|
| Selector algorithm | `enabled` | Strategy-chain engine vs legacy `cssPath` |
| Shadow piercing | `shadowDomEnabled` | Cross-boundary selectors vs single-tree selectors |

### ShadowGate (latch once per page)

`ShadowGate` (`src/shadow-mode.ts`) holds the effective shadow mode for the page:

1. Starts off until remote config arms it.
2. **Latches on the first delivery that enables shadow support** — later deliveries that disable it have no effect until the next full page load.
3. **Fixes `maxShadowDomDepth` on that first arming delivery** for the rest of the page.

When the gate arms, `onArm` subscribers run a one-time discovery scan: attach `MutationObserver` instances to existing open shadow roots and register in-shadow elements for exposure tracking. This covers the case where shadow roots existed before config arrived.

Per-event code reads `ShadowMode` once in `addAdditionalEventProperties` and passes it through helpers. Clicks use `document` listeners plus `composedPath()`; selector generation runs on demand at event time.

### Shadow root discovery (mutations & exposure)

`MutationObserver` cannot see across a shadow boundary (`subtree: true` stops at each root), so autocapture attaches **one observer per discovered open shadow root** (`src/observables.ts`).

Discovery sources:

| Source | When it runs |
|--------|--------------|
| `onArm` body scan | Remote config arms the gate (roots already in the DOM) |
| `addedNodes` handling | New elements enter the tree after observers are live |

On each mutation batch, discovery walks `addedNodes` with DFS (`collectOpenShadowRoots`) to find nested open roots within the depth budget.

**When shadow is disabled:** only `document.body` is observed; mutation callbacks return immediately after `readGate()`.

---

## When discovery works (and when it does not)

| Situation | Mutation / exposure observers | Clicks & on-demand selectors |
|-----------|------------------------------|------------------------------|
| Host mounts later (`connectedCallback` + `attachShadow`) | Yes — `addedNodes` | Yes |
| Remote config arrives after roots are in the DOM | Yes — `onArm` scan | Yes |
| `attachShadow` on an element **already** in the DOM | **No** — no mutation record for the attach itself | Yes |

The third row is an intentional gap: scan-based discovery cannot see a root attached to an existing host without a child-list mutation. Clicks and selector generation still work via `composedPath()`; mutation-driven features (dead clicks, exposure, etc.) may miss content inside that root until something else mutates the subtree.

### Other rollout limits

- **Open roots only.** Closed roots are opaque; `composedPath()` retargets to the host and selectors cannot round-trip through closed boundaries.
- **Depth budget.** Targets deeper than `maxShadowDomDepth` get a best-effort selector anchored at the outermost in-budget host.
- **Traversal caps.** `MAX_SHADOW_COMPOSED_WALK_ITERATIONS` (1024) bounds composed ancestor walks; `MAX_SHADOW_DOM_TRAVERSAL_NODES` (50k) bounds shadow-root collection DFS.

---

## Performance

### Shadow disabled (`shadowDomEnabled: false`)

No meaningful overhead beyond a gate read in observer callbacks. Code paths match pre-shadow behavior.

### Per click (shadow enabled)

`composedPath()`, composed ancestor walks, `segmentWalk`, and selector generation. Typical DOM depth makes this low concern.

### Steady state (shadow enabled) — main cost

- One `MutationObserver` per discovered open shadow root.
- DFS in mutation callbacks (`collectOpenShadowRoots`, `querySelectorAllDeep` on `addedNodes`).

Higher risk on SPAs with many shadow roots and heavy DOM churn. Traversal caps above bound worst-case synchronous work.

### Improving steady-state cost (if needed)

Prefer these over patching `Element.prototype.attachShadow`:

- `ShadowRootRegistry` — centralize discovery outside the mutation callback hot path
- Cheaper `addedNodes` checks (e.g. `node.shadowRoot`) before DFS
- Batched discovery and more targeted exposure indexing

**Do not patch `attachShadow` by default.** Session replay (`@amplitude/rrweb-record`) and other libraries already wrap the same API; a global monkey patch is a last resort and needs dual-plugin validation (autocapture + session replay) before consideration.

---

## Source map & tests

### Implementation

| File | Role |
|------|------|
| `src/shadow-mode.ts` | `ShadowGate`, latch semantics |
| `src/observables.ts` | Observer fan-out, exposure discovery |
| `src/helpers.ts` | `resolveEventTarget`, deep queries |
| `src/hierarchy.ts` | Composed ancestor walks |
| `src/data-extractor.ts` | Gate arming, per-event enrichment |
| `../element-selector/src/helpers/shadow.ts` | Traversal, `collectOpenShadowRoots` |
| `../element-selector/src/engine.ts` | `pierce`, dispatch |

### Tests

| Test | Covers |
|------|--------|
| `test/shadow-gate.test.ts` | Latch, `onArm`, shared gate, late config |
| `test/helpers.test.ts`, `test/hierarchy.test.ts`, `test/observables.test.ts` | Capture layer |
| `e2e/shadow-dom.spec.ts` | Real-browser autocapture (CI) |
| `e2e/shadow-dom-perf.spec.ts` | Perf differential — **manual only** |
| `../element-selector/test/shadow.test.ts` | Selector pierce, `resolveSelector` |
| `../element-selector/test/scenarios/off-path-differential.test.ts` | Kill-switch / round-trip invariants |

**Before enabling for an org:** run `e2e/shadow-dom.spec.ts` (CI) and locally:

```bash
npx playwright test packages/plugin-autocapture-browser/e2e/shadow-dom-perf.spec.ts
```
