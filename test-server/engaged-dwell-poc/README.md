# Engaged Dwell POC — Delayed Events Endpoint

POC for **SDKW-21**, exploring the "piggyback on the heartbeat / delayed events
endpoint" approach to engaged-dwell tracking (solution #1 in the ticket: a separate
`[Amplitude] Page Viewed Completed` event carrying dwell time).

## What it demonstrates

- Regular events go to the **`/httpapi`** endpoint (the normal ingestion endpoint).
- Heartbeats (delayed events) go to the **`/httpapi/delayed`** endpoint. The delayed service
  replaces the whole row keyed by `id` on each heartbeat.
- `[Amplitude] Page Viewed` is sent as a **`delayedPayload.instant_events`** entry on the
  `/httpapi/delayed` heartbeat → ingested immediately, once per page view.
- `[Amplitude] Page Viewed Completed` (with accumulated engaged-dwell time) is sent as a
  **`delayedPayload.events`** entry on every heartbeat → held in the delayed service,
  timeout refreshed on each heartbeat, and only ingested when the timeout lapses (i.e.
  the page stopped heartbeating because the user left).
- This is how the **last page view's** dwell time gets captured with no successor page
  view (open question #4 in the ticket).

## Settings

- Heartbeat interval: **1s** (`HEARTBEAT_MS` in `client.js`)
- Delayed-events timeout: **10s** (`TIMEOUT_MS` in `server.js`)

## How to run

From the repo root:

```
pnpm dev          # standard dev server, opens on :5173
# or, just this POC without the package watcher:
node_modules/.bin/vite dev
```

Then open `/engaged-dwell-poc/page1.html`.

## How to see it work

1. Open **page1.html**, open DevTools → Network, filter for `delayed`. You'll see a POST
   heartbeat to `/httpapi/delayed` every 1s.
2. The **Delayed service** table shows the held `Page Viewed Completed` row: `id`,
   `timeout` (countdown, reset to 10s on each heartbeat), and `events` (with live dwell).
3. The **Ingested events pool** shows the `Page Viewed` (source `instant`) immediately, and
   anything sent via the **Track event via HTTP API** button (source `http-api`).
4. Click through to **page2.html**. Page 1 stops heartbeating; watch its delayed row count
   down from 10s and then flush into the ingested pool as source `delayed-expired` with the
   final dwell time — while page 2 heartbeats under its own row.

## Files

- `server.js` — Vite middleware mocking the two endpoints (`/httpapi`, `/httpapi/delayed`)
  plus the in-memory delayed table and the timeout reaper. Every response piggybacks a
  `state` snapshot so the dashboards stay live with no separate polling endpoint. Wired into
  `vite.config.js`.
- `client.js` — dependency-free stand-in for the SDK plugin: dwell accumulation, heartbeat,
  and the live dashboard.
- `page1.html` / `page2.html` — the two demo pages.
