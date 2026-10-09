# Session Replay Browser — E2E Tests

Playwright end-to-end tests that verify the session replay capture lifecycle against a real browser.

## Prerequisites

1. **Install dependencies** from the repo root:
   ```sh
   pnpm i
   ```

2. **Build the session-replay-browser package** (and its dependencies). The test
   page imports the SDK from the workspace, so the `dist/` output must exist:
   ```sh
   pnpm --filter @amplitude/session-replay-browser... build
   ```
   Or use the focused build script if you have it:
   ```sh
   ~/scripts/sr-build.sh
   ```

3. **Install Playwright browsers** (one-time, or after upgrading `@playwright/test`):
   ```sh
   npx playwright install
   ```

## Running the tests

Start the Vite dev server in one terminal (from the repo root):
```sh
vite dev
```

Then in another terminal, run the e2e tests:
```sh
# All SR capture tests
npx playwright test packages/session-replay-browser/e2e/capture.spec.ts

# Single test by name
npx playwright test -g "records with 100% sample rate"

# Chromium only (faster iteration)
npx playwright test --project=chromium packages/session-replay-browser/e2e/capture.spec.ts
```

## Viewing results

```sh
# Open the HTML report (generated after each run)
npx playwright show-report

# Run in headed mode to watch the browser
npx playwright test --headed packages/session-replay-browser/e2e/capture.spec.ts

# Interactive UI mode (great for debugging)
npx playwright test --ui
```

## Test structure

All tests live in `capture.spec.ts` and are grouped into two `describe` blocks:

| Block | What it covers |
|---|---|
| `session replay capture` | Sampling (100% / 0%), opt-out, flush-to-API, session ID rotation |
| `URL-based targeting` | Recording starts/stays on URL match; does not start without a match; SPA pushState navigation triggers re-evaluation |

### How network mocking works

Tests intercept two endpoints before navigating to the test page:

- **`https://sr-client-cfg.amplitude.com/**`** — returns a fake remote config that controls sampling rate and/or URL targeting rules
- **`https://api-sr.amplitude.com/**`** — returns `{ code: 200 }` and optionally records which requests were made

This lets tests run without hitting real Amplitude servers and without needing a valid API key for network traffic (the HTML page uses a test key for initialization only).

### Test page

The test page is at `test-server/session-replay-browser/sr-capture-test.html`. It
accepts URL params to configure the SDK:

| Param | Default | Description |
|---|---|---|
| `sessionId` | `Date.now()` | Session ID passed to `init()` |
| `optOut` | `false` | Passes `optOut: true` to `init()` |
| `sampleRate` | `1.0` | Overrides the SDK-level sample rate (remote config mock takes precedence) |
| `deviceId` | `test-device-id` | Device ID |
| `logLevel` | `0` | SDK log level (4 = DEBUG, useful for troubleshooting) |
| `useWebWorker` | `false` | Passes `useWebWorker: true` to `init()`, enabling the web worker send path. Note: the SDK default is now `true` (SR-4646); the harness explicitly pins `false` when the param is absent to keep the behavior-focused e2e suite on the deterministic main-thread path. The worker path has dedicated coverage (e.g. `capture.spec.ts`, `send-timeout.spec.ts`). |
| `eagerFullSnapshotSend` | _unset_ | Passes `eagerFullSnapshotSend` (`true`/`false`) to `init()`; omitted preserves the SDK default (now `false` post SR-4646). Delivery tests that need the prompt initial send pass `true` explicitly. |
| `captureFullSnapshotOnFocus` | _unset_ | Passes `captureFullSnapshotOnFocus` (`true`/`false`) to `init()`; omitted preserves the SDK default (now `false` post SR-4646). Tests that need the on-focus snapshot pass `true` explicitly. |
| `maxPersistedEventsSizeBytes` | _unset_ | Passes `maxPersistedEventsSizeBytes` (number) to `init()`; omitted preserves the SDK default |
| `maxSingleEventSizeBytes` | _unset_ | Passes `maxSingleEventSizeBytes` (number) to `init()`; omitted preserves the SDK default |

After `init()` resolves, the page sets `window.srReady = true`. Tests wait on this
before asserting anything. The SDK instance is exposed as `window.sessionReplay`.

### Page-load perf harness (`deferFullSnapshot`)

`test-server/session-replay-browser/sr-page-load-perf.html` backs `defer-full-snapshot.spec.ts`.
It builds a large DOM synchronously before the SDK loads, registers `longtask` / LCP
`PerformanceObserver`s at the top of `<head>`, and can hold the window `load` event open with a
slow subresource so "before load" and "after load" are unambiguous. It exposes
`window.getPerfMetrics()` (pre-load long tasks / blocking time, `loadEventStart`, LCP, …).

| Param | Default | Description |
|---|---|---|
| `nodes` | `0` | Rows to render synchronously before the SDK loads (5 DOM nodes each). The perf test uses `6000` (~30k nodes). |
| `slowResource` | _unset_ | URL of an `<img>` appended before the SDK loads. Tests intercept it and delay the response to hold `load` open. |
| `skipSdk` | `false` | `true` never imports the SDK — the no-SDK control used to isolate SDK-attributable blocking. |
| `deferFullSnapshot` | _unset_ | Passes `deferFullSnapshot.enabled` (`true`/`false`) to `init()`; omitted preserves the SDK default (no deferral). |
| `deferUntil` / `deferDelayMs` / `deferMaxWaitMs` | _unset_ | Fill the matching `deferFullSnapshot` fields when `deferFullSnapshot` is present. |
| `eagerFullSnapshotSend` | _unset_ | As on `sr-capture-test.html`; the deferral tests pass `true` so snapshot delivery timing is observable. |
| `sessionId`, `deviceId`, `logLevel`, `useWebWorker` | as above | Same semantics as `sr-capture-test.html`. |

The page-load impact test in `defer-full-snapshot.spec.ts` is chromium-only (it needs the
`longtask` observer and CDP CPU throttling), runs `no-sdk` / `baseline` / `deferred` three
times each under 4x CPU throttling, prints a per-run table to the console, and attaches the
same data as `defer-full-snapshot-page-load-impact.{json,md}` to the Playwright report:

```sh
npx playwright test --config packages/session-replay-browser/e2e/playwright.config.ts \
  --project=chromium packages/session-replay-browser/e2e/defer-full-snapshot.spec.ts --reporter=list
```

`sdkBlockingBeforeLoadMs` (config minus the no-SDK control) is the number to look at: with
deferral it should sit near zero while the baseline pays for the rrweb import + full snapshot
before `load`.

## Troubleshooting

**Tests time out waiting for `srReady`**
- Make sure the Vite dev server is running on port 5173.
- Make sure the packages are built — a missing `dist/` causes a silent import error.
- Set `logLevel=4` in the URL to see SDK logs in the browser console (`--headed`).

**`flush()` doesn't send any requests**
Events are buffered in IndexedDB by default. A `blur` event must fire first to move
them into the send queue before `flush()` will dispatch them:
```ts
await page.evaluate(() => window.dispatchEvent(new Event('blur')));
await page.evaluate(() => (window as any).sessionReplay.flush(false));
```

**Remote config mock isn't taking effect**
The mock must be set up *before* `page.goto()`. The response shape must be nested:
```ts
// correct
{ configs: { sessionReplay: { sr_sampling_config: { ... } } } }

// wrong — RemoteConfigClient splits the key on '.' and traverses it
{ 'configs.sessionReplay': { sr_sampling_config: { ... } } }
```
