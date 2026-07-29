# Repository Guidelines

This repository uses GitHub Actions for continuous integration. Contributors should replicate the CI steps locally before opening a pull request.

## Local Environment Setup

Before running any tests or scripts, install dependencies and build the packages:

```bash
pnpm install
pnpm build
```

## Testing and Linting

1. Install dependencies with `pnpm install`.
2. Build all packages with `pnpm build`.
3. Verify documentation with `pnpm docs:check`.
4. Run unit tests with `pnpm test` and example tests with `pnpm test:examples`.
5. Lint the code using `pnpm lint`.
6. Check for unused dependencies with `pnpm lint:deps`.

These steps must pass before you submit your PR.

## Pull Request Requirements

- PR titles must follow the [conventional commit](https://www.conventionalcommits.org/ ) format and, when possible, include the affected module name. Examples: `feat(browser): add feature` or `fix(plugin): correct bug`.
- The CI matrix runs on Node.js `20.x`, `22.x`, and `24.x`. Ensure your code is compatible with these versions. Node 18 is no longer supported: `lerna`, which backs `pnpm build`/`test`/`lint`, requires `^20.19.0 || ^22.12.0 || >=24.0.0`.

