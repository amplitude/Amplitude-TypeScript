---
name: amplitude-typescript-repo
description: Works in the Amplitude TypeScript monorepo (pnpm workspaces, Lerna, packages under packages/*). Use when implementing or reviewing changes, running builds and tests, or preparing pull requests for this repository.
---

# Amplitude TypeScript SDK monorepo

## Layout

- **Root**: `pnpm` workspace; packages live under `packages/*` (for example `packages/analytics-browser`, `packages/analytics-core`).
- **Human guidelines**: [AGENTS.md](../../../AGENTS.md) at the repository root is authoritative for CI parity and PR expectations.
- **Commit/PR style**: See [.cursor/rules/commit-and-pr-guidelines.mdc](../../../.cursor/rules/commit-and-pr-guidelines.mdc) and [CONTRIBUTING.md](../../../CONTRIBUTING.md) when relevant.

## Before tests or scripts

Always install and build from the repository root:

```bash
pnpm install
pnpm build
```

## Checks to mirror CI (before a PR)

1. `pnpm install`
2. `pnpm build`
3. `pnpm docs:check`
4. `pnpm test`
5. `pnpm lint`

## Compatibility

CI runs on Node.js **18.17.x**, **20.x**, and **22.x**; avoid APIs or syntax that break those versions.

## Scoped work

For a single package, prefer targeted commands when faster, for example:

```bash
pnpm --filter @amplitude/analytics-browser test
pnpm --filter @amplitude/analytics-browser lint
```

Use the `name` field from the target `packages/<dir>/package.json` for other packages.
