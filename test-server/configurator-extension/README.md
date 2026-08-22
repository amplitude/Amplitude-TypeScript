# Configurator runner extension

Runs a configuration built in the configurator on a site that doesn't have Amplitude installed, by
injecting the Browser SDK into it. It exists because a web page can't instrument another origin: the
configurator can generate the code, but only an extension can put it on someone else's site.

## Setting it up

The SDK bundles aren't checked in. Build them once, then vendor them in:

```bash
pnpm --dir packages/analytics-browser build
pnpm --dir packages/plugin-session-replay-browser build
node test-server/configurator-extension/sync-vendor.mjs
```

Load `test-server/configurator-extension` at `chrome://extensions` with developer mode on, and start the
test server with `pnpm dev`. After editing any file here, hit the extension's reload icon — that also
clears which tabs were being instrumented.

## Using it

**From the configurator.** Open `/configurator.html`, build a configuration, put a URL in the field next
to the "Run on URL" button, and click it. The page hands the configuration to this extension, which opens
that URL in a new tab and initialises the SDK there. The note beside the button says what was installed,
and the tab's console logs every event the SDK builds.

**On the tab you're looking at.** Click the toolbar button to instrument the current tab with whatever the
configurator sent last, or a debug-everything default if it hasn't sent anything yet. The badge reads `on`,
and clicking again switches it off. Either way the tab reloads, since that's the only way to catch a page
from the start.

## How the pieces fit

`configurator-bridge.js` sits on the configurator page and relays `window.postMessage` requests to
`background.js`. Its `matches` in the manifest cover the hosts the test server uses — `localhost` and
`127.0.0.1` over http for `pnpm dev`, `local.website.com` over https for `pnpm dev:ssh` — and nothing
else. Ports aren't part of a match pattern, so any port is covered, but serving the configurator from a
host that isn't listed is why the page would report no extension. It's scoped to the configurator's own
path rather than a host wildcard so the relay isn't offered to every site, given how much the extension is
allowed to do. Going through the page rather than `chrome.runtime.sendMessage` means the page needs no
extension ID and no `externally_connectable` entry, and it lets the extension announce itself so the
button can tell "not installed" from "not responding".

`background.js` marks a tab, then injects on `webNavigation.onCommitted`: the configuration, the SDK
bundle, session replay's bundle if it's configured, and finally `inject.js`, which wires them together.
All of it goes into the page's main world, because the SDK has to share globals with the page — in an
isolated world its patches to `fetch`, `XMLHttpRequest` and `history` would apply to nothing, and network
and SPA page-view tracking would quietly capture nothing while clicks kept working.

`csp.js` owns the site's Content-Security-Policy: `instrument()` removes it for that one tab and `forget()`
puts it back, so no path can mark a tab without clearing the way or leave a tab unprotected afterwards. It
also records what the policy said, which is the part worth having — see below.

The configuration is materialised on the configurator side by `runtime-config.js`, the same code the run
page uses, and travels as JSON. Regexes have nowhere to live in JSON, so `toJsonSafe()` turns them into
`{ __regex, __flags }` markers and the reviver in `inject.js` turns them back.

## Things worth knowing

- **Host permissions are `*://*/*`.** That's what "any URL a customer gives us" means. A version anyone
  else installs should ask per-site with `optional_host_permissions` and a prompt instead.
- **The site's CSP is removed for the tab, and reported.** Injecting bundles works on a page that forbids
  inline scripts, because injected files are exempt — but once the SDK runs, its requests are the page's
  requests, so a strict `connect-src` or `script-src` blocks event uploads, remote config and the CDN
  bundles. A `declarativeNetRequest` session rule removes the `content-security-policy` header, scoped to
  the instrumented tab by the `tabIds` condition, which only session-scoped rules support. Note that a
  second policy could not have loosened the first: CSP enforces every policy it is given, so appending only
  narrows, and a declarative rule can't read the existing value to rewrite it. Removal is the only option
  the browser offers.
- **What the policy would have blocked is the finding, not the obstacle.** A customer whose CSP stops
  Amplitude wants to know exactly that, so the original policy is compared against what the configuration
  will actually reach for and reported in the instrumented page's console and the toolbar button's tooltip.
  The comparison is a heuristic, not a CSP implementation: it follows the `default-src` fallback chain and
  matches host, wildcard and scheme sources, but ignores ports, paths and scheme upgrades.
- **Only header-delivered policies can be removed.** A policy in a `<meta http-equiv>` tag never crosses
  the network and is in force before anything here could see it, which makes `target-page.html` a harsher
  case than most real sites. Removal is also per-tab: another tab on the same URL keeps its policy.
- **Guides and Surveys isn't injected.** It fetches its bundle from the CDN per project, and the runner
  doesn't load it yet. The site's CSP is no longer the reason — with the header removed, this is only a
  matter of `inject.js` learning to add the script tag the run page already uses.
- **Chromium is stricter about UTF-8 than UTF-8 is.** Content script files go through
  `base::IsStringUTF8`, which rejects Unicode non-characters, and the session replay bundle contains four
  literal U+FFFE characters. Chrome rejects the whole file with "It isn't UTF-8 encoded", which is why
  `sync-vendor.mjs` escapes them on the way in rather than a plain `cp`.
- **Where events go.** The API key comes from the configurator, and events land in whatever project owns
  it. Use a scratch project, not a customer's production key.
- **The page's own Amplitude.** The bundle merges itself onto an existing `window.amplitude`, which would
  leave the site's `init` and `track` pointing at the injected instance. `background.js` snapshots the
  global first and `inject.js` puts it back, keeping its own client to itself.
