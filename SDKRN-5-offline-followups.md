# SDKRN-5 — offline mode follow-ups

Tracking doc for the React Native offline-mode feature (PR #1796): manual
verification, the test-case matrix, and the UI-test (Maestro) work that stacks on
top of it.

## Feature recap

Events queue while the device is offline and flush on reconnect, driven by a
native connectivity checker (`AmplitudeReactNativeConnectivity`, iOS + Android)
bridged to a JS `BeforePlugin` (`networkConnectivityCheckerPlugin`) that flips
`config.offline`. The shared `Destination` plugin short-circuits `schedule()` /
`flush()` and keeps the queue while `config.offline === true`, then flushes on
reconnect. The plugin is installed before `Destination` and skipped on the
`OfflineDisabled` sentinel.

## Test-case matrix

| TC  | Scenario                                   | Status |
| --- | ------------------------------------------ | ------ |
| TC1 | Offline queue -> reconnect flush           | ✅ manual; ⚙️ Maestro (see below) |
| TC2 | Cold-launch offline seed                   | ⬜ to verify |
| TC3 | Android API 21–22 fallback callback        | ⬜ to verify |
| TC4 | Captive portal (validated vs connected)    | ⬜ to verify |
| TC5 | Web (`navigator.onLine`)                   | ⬜ to verify |

### TC1 — offline queue -> reconnect flush (definition)

1. Launch the app **online**; the launch-time event uploads (HTTP 200).
2. Track an event while online — it uploads.
3. Go **offline**.
4. Track event(s) — they must **QUEUE** in memory, with **no** network attempt
   (`Destination.flush()` short-circuits; "Skipping flush while offline." logs).
5. **Reconnect**.
6. The queued events **FLUSH** — a real upload with a `serverUploadTime` in the
   response.

### TC1 — manual verification log

Verified end-to-end on an **Android emulator** after the Metro dedupe fix:

- Offline: tapping the Offline-test button queued events with **no** network
  attempts ("Skipping flush while offline." at `Debug`).
- Reconnect: the SDK flushed immediately and the batch uploaded successfully
  (200, `serverUploadTime` present in the response body).

Pre-fix, the app never actually entered offline mode — events were attempted and
dropped after retries instead of queued. **Root cause:** a duplicate
`react-native` in the bundle (`packages/analytics-react-native` pins its own
`react-native` 0.70.6 devDep, so Metro bundled a second copy alongside the app's
0.71.x). Two copies => two `RCTDeviceEventEmitter` singletons => the SDK's
`NativeEventEmitter` listener was registered on a different emitter than the
native bridge emitted to, so live connectivity-change events never reached the
plugin (only the initial `getNetworkConnectivityStatus()` seed worked). Fixed via
`resolver.resolveRequest` in `expo-app/metro.config.js` forcing a single
`react-native` / `react`. **Requires `expo start --clear`** to drop the stale
bundler cache. This is an example-app bundling artifact, not an SDK bug — a real
consumer installs a single `react-native`.

### Android emulator caveats

- On API >= 23 the connectivity checker requires `NET_CAPABILITY_VALIDATED`
  (gated so API 21–22 aren't treated as permanently offline). Emulators can keep
  reporting a validated network, so **`cmd connectivity airplane-mode` /
  `setAirplaneMode` are unreliable** for forcing the SDK offline there.
- The reliable trigger is disabling the radios directly:

  ```
  adb shell svc wifi disable && adb shell svc data disable   # go offline
  adb shell svc wifi enable  && adb shell svc data enable    # reconnect
  ```

---

## TC1 as a Maestro UI test — feasibility findings

**Goal:** express TC1 (launch online -> send -> go offline -> track [must queue]
-> reconnect -> queued events flush) as an automated Maestro flow on the
`expo-app`.

### Conclusion

**Not cleanly expressible as a single hermetic Maestro flow**, for two reasons —
but it *is* testable with (a) small UI instrumentation in `App.tsx` and (b) a
hybrid Maestro-flow + adb driver. Both are now in the repo:

- Instrumentation: `examples/react-native/expo-app/App.tsx` — a TC1 status panel.
- Self-contained flow (best-effort): `.maestro/tc1-offline-queue-flush.yaml`.
- Reliable hybrid driver: `.maestro/run-tc1.sh`.

### Blocker 1 — toggling connectivity from a flow

What Maestro can do for connectivity and whether it produces a *real* offline
state for this SDK:

| Mechanism | In-flow? | Produces real offline for this SDK? |
| --- | --- | --- |
| `setAirplaneMode` (Android) | ✅ yes; keeps app + JS state alive | ⚠️ **unreliable on emulators** — airplane mode may not drop `NET_CAPABILITY_VALIDATED`; works on physical devices / well-behaved emulators |
| `- runScript` shim | ✅ yes | ❌ no — `runScript` is a JS sandbox (GraalJS), not a shell; it cannot run `adb`/`svc` |
| External `adb shell svc wifi/data disable` | ❌ not from inside a flow | ✅ **yes** — the verified trigger |

So the only *in-flow* primitive (`setAirplaneMode`) is exactly the one the manual
testing found unreliable on the emulator. The reliable trigger (`adb svc ...`)
has to be orchestrated **around** Maestro from a shell script, because Maestro
deliberately has no shell-exec step.

### Blocker 2 — assertions are UI-only

Maestro asserts on visible UI, not logcat or network. TC1's "queued vs sent"
distinction was previously only observable in `Debug` logs. Fixed by adding a
minimal, example-only **TC1 status panel** to `App.tsx`:

| Label | SDK state it surfaces |
| --- | --- |
| `Offline: <bool>` | live `config.offline` (captured via a tiny enrichment plugin + polled — there's no JS event to subscribe to) |
| `Queued: <n>` | in-memory queue depth = number of `track()` promises still pending. A track promise only resolves once a send is *attempted* (`fulfillRequest`); offline short-circuits flush, so pending == queued. |
| `Uploaded: <n>` | count of events whose promise resolved with **HTTP 200** |
| `Last: <…>` | last flush outcome — `"… → queued (offline)"` (the UI equivalent of "Skipping flush while offline.") vs the resolved `"… → 200 Event tracked successfully"` after reconnect |

This makes every TC1 transition `assertVisible`-able. `Queued: 2` holding while
`Offline: true` (despite RN's 1s `flushIntervalMillis`) is the positive proof of
queueing; `Queued: 0` + the `200` `Last:` line after reconnect proves the flush.

### What ships

1. **`.maestro/tc1-offline-queue-flush.yaml`** — self-contained flow using
   `setAirplaneMode`. Full TC1 assert sequence. The clean path on physical
   devices / emulators where airplane mode registers as a real network loss. If
   `Offline: true` times out on your emulator, that's Blocker 1 — use the driver.

2. **`.maestro/run-tc1.sh`** — hybrid driver (recommended on emulators). Runs the
   flow in three phases as separate `maestro test` invocations against the *same*
   running app, interleaving `adb shell svc wifi/data disable|enable` between
   phases. Only phase 1 launches/clears state; phases 2–3 attach to the
   foregrounded app so the in-memory queue + counters survive the toggles.

### Requirements / limitations to be aware of

- **Real key + reachability.** `Uploaded` / the `200` `Last:` assertion need a
  real `AMPLITUDE_API_KEY` (inlined via `babel.config.js`) and reachability to
  `api2.amplitude.com`. With a dummy key the queue still drains on reconnect, but
  `Uploaded` won't increment — in that case assert only on `Offline:` + `Queued:`.
- **Deduped bundle.** Must be built after the `metro.config.js` dedupe fix, with
  `expo start --clear`; otherwise live connectivity events never reach the plugin.
- **Needs a real device/emulator.** This is an instrumented UI test; it cannot run
  in a headless JS-only CI runner. Run it on a device, a CI runner with an Android
  emulator (radios togglable via adb), or a device farm. Maestro Cloud does **not**
  expose adb svc / arbitrary shell, so the `run-tc1.sh` path needs a self-hosted
  emulator; on Maestro Cloud only the `setAirplaneMode` flow is usable (subject to
  Blocker 1 on that fleet's emulators).

### Alternatives considered

- **Detox** — can mock/disable network at the native layer and assert in-process,
  avoiding both blockers, but it's a heavier harness not currently set up here.
- **Pure Maestro Cloud** — viable only for the `setAirplaneMode` flow and only
  where that fleet's devices honor airplane mode for this SDK.
- **Hybrid Maestro + adb (chosen)** — lowest-friction given the existing Maestro
  setup; the adb driver makes the connectivity toggle deterministic.
