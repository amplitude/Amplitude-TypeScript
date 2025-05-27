# Repository Guidelines

This repository uses GitHub Actions for continuous integration. Contributors should replicate the CI steps locally before opening a pull request.

## Testing and Linting

1. Install dependencies with `yarn install --frozen-lockfile`.
2. Build all packages with `yarn build`.
3. Verify documentation with `yarn docs:check`.
4. Run unit tests with `yarn test` and example tests with `yarn test:examples`.
5. Lint the code using `yarn lint`.

These steps must pass before you submit your PR.

## Pull Request Requirements

- PR titles must follow the [conventional commit](https://www.conventionalcommits.org/ ) format and, when possible, include the affected module name. Examples: `feat(browser): add feature` or `fix(plugin): correct bug`.
- The CI matrix runs on Node.js `18.17.x`, `20.x`, and `22.x`. Ensure your code is compatible with these versions.

