# Shadow-DOM multi-site harness

Injects the **real** shadow selector engine + capture helpers (bundled from
`packages/*/src` on the current branch) into arbitrary live third-party sites
and checks two things per site:

1. **Safety** — zero uncaught page errors (`window.onerror` / `pageerror`) and
   zero throws from the capture helpers. This is the "never break a customer
   site" guarantee.
2. **Correctness** — the round-trip invariant `resolveSelector(generate(el)) === el`
   for every element walked (light DOM + open shadow roots).

It does **not** load or clobber a site's own Amplitude instance — it only
injects the isolated engine under `window.__AMP_SHADOW__`, so it's safe to run
against sites that already ship the production SDK.

## It never sends events to Amplitude

The harness itself generates **zero** events: it never calls `amplitude.init`
and never clicks/scrolls/dispatches — `inPageAudit` only *reads* the DOM. But
many target sites ship their own production Amplitude SDK, which fires page-load
events on any visit. To avoid polluting a customer's Amplitude instance with our
test traffic, the harness **aborts every request to `*.amplitude.com`** at the
network layer (reported per site as `N amplitude req(s) blocked`).

Caveat: a site that proxies ingestion through its **own** domain won't be
covered by the hostname block — for those, run against a non-production URL.
Never add synthetic clicking to this harness while pointing at real sites: that
would drive the site's autocapture and could emit thousands of events.

## The URL corpus

Edit [`urls.txt`](./urls.txt) — one URL per line; `#` comments and blank lines
are ignored. That file is the list the suite runs against.

## Run it

```bash
# From the repo root. Prereqs (one-time):
pnpm build                              # so workspace deps resolve for the bundle
npx playwright install chromium         # if you don't have the browser yet

# Run the whole corpus (headless):
node tools/shadow-harness/harness.mjs

# Watch it in a real browser window:
node tools/shadow-harness/harness.mjs --headed

# Cap elements audited per site (default 3000):
node tools/shadow-harness/harness.mjs --max=1500

# Ad-hoc single URL (bypasses urls.txt):
node tools/shadow-harness/harness.mjs https://www.amazon.com/
```

A machine-readable `report.json` is written next to the script; the console
prints a PASS/FAIL line per site. Exit code is non-zero if any site fails.

## Interpreting results

- `round-trip fail(s)` > 0 → the engine produced a selector that didn't resolve
  back to the same element (non-unique or wrong). Inspect `roundTripFailures` in
  `report.json`.
- `helper error(s)` / `page error(s)` > 0 → something threw on a real DOM. This
  is a rollout blocker — investigate before enabling the flag for any org.
- `pierced selectors` and `shadow roots` = 0 → the site has no open shadow DOM,
  so it didn't exercise the new paths. Add shadow-heavy sites to `urls.txt`
  (YouTube, Salesforce Lightning, SAP UI5, Lit/Stencil/Polymer apps).

## Benign errors are filtered

Some browser messages surface through `window.onerror` on many sites but are
NOT uncaught exceptions from any script — most notably
`"ResizeObserver loop completed with undelivered notifications"` (emitted by the
page's own ResizeObserver usage) and the opaque cross-origin `"Script error."`.
These are matched by `IGNORED_ERROR_PATTERNS` and reported as
`(N benign ignored)` — they never fail a site. Only real errors do.
