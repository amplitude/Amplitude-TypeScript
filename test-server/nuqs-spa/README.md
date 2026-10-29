# nuqs SPA page-view example

A React Router v6 SPA using nuqs 2 and the local workspace Browser SDK, including the SDK-413 replaceState fix. Visitors initialize a real SDK instance with their test project's API key and choose `trackHistoryChanges: 'all'` (the default) or `'pathOnly'`.

## Run

From the repository root, after the usual `pnpm install` and `pnpm build`:

```sh
pnpm dev:nuqs
```

Open http://127.0.0.1:5174/. This dedicated Vite server supports deep links and stays separate from the shared test server and the TRC harness on port 5173. It resolves every `@amplitude/*` import to the workspace build. Rebuild packages after changing SDK source; app edits cause a full reload.

## Initialize the SDK

1. Enter your test project's API key.
2. Choose **all (default)** or **pathOnly**, and the project's US/EU server zone.
3. Click **Initialize SDK**. The page confirms the active mode and enables the SPA controls.

The app calls the workspace Browser SDK's `init()` with the supplied API key. Events use the standard SDK transport and are sent to the selected Amplitude project. An enrichment observer displays generated page views without replacing the transport, destination, or delivery responses. The visible list is an observation of generated events, not an acknowledgement of successful ingestion; inspect the browser Network panel or your Amplitude project to verify delivery.

The API key is not saved. Remote config is disabled so it cannot override the selected tracking mode; diagnostics and unrelated autocapture features are disabled. Refresh to change initialization options or reset the observed count. The current SPA URL is preserved by a refresh.

## Try it

The counter starts at 1 for the initial page view after initialization. The selected mode determines how later URL changes are tracked:

| Action | `all` | `pathOnly` |
| --- | --- | --- |
| Next page / search / category via nuqs | +1 per actual URL write | +0 |
| Clear nonempty query via nuqs | +1 | +0 |
| Write same value / state-only replacement | +0 | +0 |
| Replace route to a different path | +1 | +1 |
| Replace hash | +1 | +0 |
| Catalog / Settings navigation to a different path | +1 | +1 |
| Uncheck trackOn, then change URL | +0 | +0 |

nuqs defaults to `history: 'replace'`. Switch its history mode to `push`, change the page number, and use Back/Forward to visit earlier query states. Query-only Back/Forward increments `all`; path changes are tracked in either mode.

nuqs batches/throttles URL writes, so rapid keystrokes may produce fewer history calls and page views than characters typed. The history trace shows the actual calls; it does not dispatch synthetic navigation or analytics events. Expand any page-view entry to inspect the observed event. Only the latest ten observed events and latest 100 history calls are shown; the counter retains the full session count.

For console inspection, `window.amplitude` (also `window.nuqsDemo.client`) exposes the initialized SDK instance and `window.nuqsDemo.getSnapshot()` returns the event/trace state.

References: [nuqs React Router adapter](https://nuqs.dev/docs/adapters#react-router-v6), [history options](https://nuqs.dev/docs/options#history), [batching](https://nuqs.dev/docs/batching).
