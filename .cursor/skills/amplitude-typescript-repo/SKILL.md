---
name: amplitude-typescript-repo
description: Contributes to the Amplitude TypeScript analytics SDK monorepo (pnpm workspaces, Lerna, Nx). Covers PR prep, local test-server workflow, and customer-site manual tests via e2e/manual-test.js. Use when changing packages under packages/, running repo scripts, preparing PRs, testing a live site against a local bundle, or when the user mentions Amplitude-TypeScript, browser/node SDKs, manual-test, or customer-site validation.
---

# Amplitude TypeScript monorepo

## Layout

- **Package manager**: `pnpm` with workspaces (`packages/*`).
- **Build orchestration**: Lerna (`pnpm build`, `pnpm test`, `pnpm lint` stream across packages); Nx available for affected/graph targets (`package.json` scripts with `nx` prefix).
- **Source**: SDK and plugin code lives under `packages/` (for example `analytics-browser`, `analytics-core`, `analytics-node`).

## Before opening a PR (match CI)

Run in order after substantive changes:

1. `pnpm install`
2. `pnpm build`
3. `pnpm docs:check`
4. `pnpm test` and `pnpm test:examples`
5. `pnpm lint`

Full contributor notes: [AGENTS.md](../../../AGENTS.md) at repo root.

## Environment

- CI uses Node.js **18.17.x**, **20.x**, and **22.x** — avoid APIs or syntax that break that range.

## PR titles

Use [Conventional Commits](https://www.conventionalcommits.org/) and include the affected module when it helps, for example `feat(browser): …`, `fix(plugin): …`.

## Scoped commands

- Prefer root scripts above for consistency.
- To target one package: `pnpm --filter <package-name> <script>` (see each package’s `package.json` for local script names).

## Change discipline

- Keep diffs focused on the requested behavior; avoid unrelated refactors or new docs unless asked.
- Match existing patterns in the touched package (imports, types, test style).

## Customer site manual test of analytics (`e2e/manual-test.js`)

**Tell the user up front:** this flow only applies to sites that load Amplitude’s **unified script** or that use cdn.amplitude.com tags.

### Why `dev:ssh`

`e2e/manual-test.js` rewrites the CDN request to `https://local.website.com:5173/unified-script-local.js`. The Vite test server must be reachable at that **HTTPS** origin. Use `pnpm dev:ssh` after the one-time HTTPS setup in [test-server/README.md](../../../test-server/README.md) (`/etc/hosts`, `generate-signed-cert`, trust cert in Keychain). If that setup is missing, the manual test will not load the local bundle. If the user struggles to find the script, make sure they ran `dev:ssh` first.

### Run the manual test

`node ./e2e/manual-test.js <website-url>`. Example: `node ./e2e/manual-test.js https://example.com`

Playwright opens a headed browser, proxies HTML to strip SRI on Amplitude script tags, and swaps the unified script for the local `test-server/unified-script-local.js` chain. Leave Terminal A running until finished; stop with Ctrl+C in each terminal when done.

### Integrity Hashes

If the user experiences a problem with the proxying not working due to SRI failures, instruct the user to take the shasum of the failing integrity hash and add it to manual-test.js under INTEGRITY_HASHES.

### Testing specific versions

Aside from testing local versions, users need to be able to go back and test old versions of the analytics or session replay SDK. If the user asks to test a specific version (e.g.: session replay v1.22.7) than set the environment variable (e.g.: SESSION_REPLAY_VERSION) to have it set to that instead of using local

### Building before testing

Don't build bundles before testing. Leave that up to the user. But notify them if they're having troubles that they may be using a stale bundle.

### Manual tests not automatic

These tests should be manual. The manual script opens the browser and the user tests. Never use HEADLESS and always leave the script running indefinitely
