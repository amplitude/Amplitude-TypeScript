# Repository Guidelines

This repository uses GitHub Actions for continuous integration. Contributors should replicate the CI steps locally before opening a pull request.

## Local Environment Setup

Use Node.js 24 (the default in `.nvmrc`). The development toolchain requires Node.js >=22.13 because the repository pins pnpm 11; Node.js 20 is no longer supported for development.

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
- The CI matrix runs on Node.js `22.x`, `24.x`, and `26.x`. Ensure your code is compatible with these versions. Use Node.js >=22.13 for the pnpm 11 development toolchain.
