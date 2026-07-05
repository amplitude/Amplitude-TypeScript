# Shadow DOM support

Optional shadow-DOM autocapture and selector generation, gated by remote config.

| Package | Role |
|---------|------|
| `@amplitude/element-selector` | `pierce`, `segmentWalk`, `resolveSelector`, traversal primitives |
| `@amplitude/plugin-autocapture-browser` | Event targets, ancestor walks, `ShadowGate`, mutation/exposure observers |

**Remote config:** `shadowDomEnabled` (default `false`), `maxShadowDomDepth` (default `1`, clamped `[1, 10]`). Independent from the selector engine kill switch (`enabled`).

Config summary: [`packages/element-selector/README.md`](../element-selector/README.md#shadow-dom).

---

## Architecture

Two independent axes:

| Axis | Config | Effect |
|------|--------|--------|
| Selector algorithm | `enabled` | Strategy-chain engine vs legacy `cssPath` |
| Shadow piercing | `shadowDomEnabled` | Cross shadow boundaries (` >>> ` delimited selectors) vs single tree |

**`ShadowGate`** (`src/shadow-mode.ts`) latches on the first remote-config delivery that enables shadow support and does not revert until the next page load. **First delivery also fixes `maxShadowDomDepth` for the page.**

`onArm` runs one-time discovery scans (attach `MutationObserver` to existing open shadow roots, register in-shadow elements for exposure) when config arrives after observables subscribe.

Per-event code reads `ShadowMode` once in `addAdditionalEventProperties` and passes it into helpers. Clicks/changes use `document` listeners + `composedPath()`; selector generation is on-demand at event time.

**MutationObserver fan-out:** one observer per discovered open shadow root (`src/observables.ts`). Discovery: `onArm` body scan + DFS (`collectOpenShadowRoots`) on each `addedNodes` `Element`.

---

## Limitations

| Scenario | Supported? |
|----------|------------|
| Late host mount (new element + `attachShadow` in `connectedCallback`) | Yes — `addedNodes` |
| Late remote config (roots already in DOM) | Yes — `onArm` scan |
| Late `attachShadow` on an element already in the DOM | **No** — no mutation record; clicks/selectors still work; mutation/exposure may miss |
| Closed shadow roots | Opaque — no piercing or round-trip |

Open roots only. Disabling `shadowDomEnabled` mid-session has no effect until reload.

---

## Performance

**Off path (`shadowDomEnabled: false`):** no meaningful overhead — pre-shadow code paths, mutation callback returns after `readGate()`.

**On path — per click:** `composedPath()`, composed ancestor walks, `segmentWalk` + generation. Low concern at typical DOM depth.

**On path — steady state (main concern):** MO fan-out per shadow root; **DFS in mutation callbacks** (`collectOpenShadowRoots` + `querySelectorAllDeep` on `addedNodes`). Caps: `MAX_SHADOW_DOM_TRAVERSAL_NODES` (50k), `MAX_SHADOW_COMPOSED_WALK_ITERATIONS` (1024). Higher risk on SPAs with many shadow roots and heavy DOM churn.

**Planned mitigations (prefer over global `attachShadow` patch):** `ShadowRootRegistry`, cheaper `addedNodes` checks (`node.shadowRoot`), batched discovery, targeted exposure indexing. A monkey patch conflicts with session replay (`@amplitude/rrweb-record`) and other frameworks that already wrap `Element.prototype.attachShadow` — treat as last resort only.

---

## Follow-ups

- Scenario C regression test (document intentional gap)
- `ShadowRootRegistry` — extract discovery from MO callback; wire exposure
- Reduce DFS in mutation/exposure paths
- Merge duplicate ancestor walks on the click path
- Dual-plugin e2e (autocapture + session replay) before any `attachShadow` patch

---

## Source & tests

| File | Purpose |
|------|---------|
| `src/shadow-mode.ts` | `ShadowGate`, latch semantics |
| `src/observables.ts` | Mutation fan-out, exposure discovery |
| `src/helpers.ts` | `resolveEventTarget`, deep queries |
| `src/hierarchy.ts` | Composed ancestor walks |
| `src/data-extractor.ts` | Gate arming, per-event enrichment |
| `../element-selector/src/helpers/shadow.ts` | Traversal, `collectOpenShadowRoots` |
| `../element-selector/src/engine.ts` | `pierce`, dispatch |

| Test | Covers |
|------|--------|
| `test/shadow-gate.test.ts` | Latch, `onArm`, shared gate |
| `test/helpers.test.ts`, `test/hierarchy.test.ts`, `test/observables.test.ts` | Capture layer |
| `e2e/shadow-dom.spec.ts` | Real browser autocapture (CI) |
| `e2e/shadow-dom-perf.spec.ts` | Perf differential — **manual only** (`npx playwright test packages/plugin-autocapture-browser/e2e/shadow-dom-perf.spec.ts`) |
| `../element-selector/test/shadow.test.ts` | Selector pierce, `resolveSelector` |
| `../element-selector/test/scenarios/off-path-differential.test.ts` | Kill-switch / round-trip invariants |
