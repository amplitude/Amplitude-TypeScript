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
| `useWebWorker` | `false` | Passes `useWebWorker: true` to `init()`, enabling the web worker send path |

After `init()` resolves, the page sets `window.srReady = true`. Tests wait on this
before asserting anything. The SDK instance is exposed as `window.sessionReplay`.

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
