# nuqs SPA page-view example

A React Router v6 SPA using nuqs 2 and the local workspace Browser SDK, including the SDK-413 replaceState fix. Visitors initialize a real SDK instance with their test project's API key and choose `trackHistoryChanges: 'all'` (the default) or `'pathOnly'`.

## Run

From the repository root, after the usual `pnpm install` and `pnpm build`:

```sh
pnpm dev:nuqs
```

Open http://127.0.0.1:5174/. This dedicated Vite server supports deep links and stays separate from the shared test server and the TRC harness on port 5173. It resolves every `@amplitude/*` import to the workspace build. Rebuild packages after changing SDK source; app edits cause a full reload.

## Initialize the SDK

1. Set `VITE_AMPLITUDE_API_KEY` in the repository-root `.env` file.
2. Choose **all (default)** or **pathOnly**.
3. Click **Initialize SDK**. Refresh to change the tracking mode.

The app uses the real workspace Browser SDK with the `.env` key, US server zone, and `Types.LogLevel.Debug`. Inspect SDK debug logs in the browser console, requests in the Network panel, or events in the Amplitude project. There are no event observers or history instrumentation in the app. `window.amplitude` exposes the SDK instance for console inspection.

Remote config is disabled so it cannot override the selected mode; diagnostics and unrelated autocapture features are disabled. Neither `.env` nor its values are committed.

## Try it

The SPA controls table puts buttons and their underlying code in rows, with expected additional page views in the `all` and `pathOnly` columns. Query-button annotations follow the selected nuqs history mode.

Initialization tracks one initial page view. The selected mode determines how later URL changes are tracked:

| Action | `all` | `pathOnly` |
| --- | --- | --- |
| Next page via nuqs | +1 per actual URL write | +0 |
| Clear page query via nuqs | +1 | +0 |
| Write same value / state-only replacement | +0 | +0 |
| Replace route to a different path | +1 | +1 |
| Replace hash | +1 | +0 |
| Catalog / Settings navigation to a different path | +1 | +1 |

nuqs defaults to `history: 'replace'`. Switch its history mode to `push`, change the page number, and use Back/Forward to visit earlier query states. Query-only Back/Forward increments `all`; path changes are tracked in either mode.

nuqs may batch rapid query updates into one URL write.

References: [nuqs React Router adapter](https://nuqs.dev/docs/adapters#react-router-v6), [history options](https://nuqs.dev/docs/options#history), [batching](https://nuqs.dev/docs/batching).
