# Contributing to the Amplitude-TypeScript

🎉 Thanks for your interest in contributing! 🎉

## Getting Started

### Create a new issue

If find issues while using this library or just reading through it, look to see if an issue has been created. If no issues are related, feel free to open a new one using the template.

### Solve an issue

If you find any existing issues that you are interested in fixing, you are welcome to open a PR and we will gladly review your changes.

### Making Changes

#### Setup locally

Getting setup is quick and easy. Follow the steps below to get your your dev environment up.

1. Fork GitHub repo
2. Install dependencies
3. Build packages

```
$ git clone <HTTPS_OR_GIT_URL>
$ pnpm install
$ pnpm build
```

This repo contains mutliple major versions of all packages. For contributions to version `1.x`, create a branch off `v1.x`. For contributions to the `2.x` (latest) version, create a branch off `main`. Refer to the table below for more infomation about the release status of each package.

|Package|Version|Status|Dev Branch|
|-|-|-|-|
|Browser SDK|
|`@amplitude/analytics-browser`|V2|Beta|`main`|
|`@amplitude/analytics-browser`|V1|Current|`v1.x`|
|`@amplitude/marketing-analytics-browser`|V1|Current|`v1.x`|
|Node SDK|
|`@amplitude/analytics-node`|V2|Unreleased|`main`|
|`@amplitude/analytics-node`|V1|Current|`v1.x`|
|ReactNative SDK|
|`@amplitude/analytics-react-native`|V2|Unreleased|`main`|
|`@amplitude/analytics-react-native`|V1|Current|`v1.x`|

#### Test your changes

Building quality software is one of our top priorities. We recommend getting your changes tested using manual and automated practices.

```
$ pnpm build
$ pnpm test
```

When writing commit message, follow [PR Commit Title Conventions](#PR-Commit-Title-Conventions) for the format. A git hook will also run to verify that the format is followed.

#### Unused Dependencies

Dependencies that are declared in a `package.json` but never used by that package are reported by [knip](https://knip.dev):

```
$ pnpm lint:deps
```

This runs on every PR as the "Check Unused Dependencies" job. If it fails, either drop the dependency from the `package.json` it names, or — if the dependency really is used in a way a static check cannot see — add it to `knip.config.js` with a comment explaining why.

That escape hatch exists because a few dependencies in this repo are genuinely used without being imported: `tslib` is injected by `"importHelpers": true`, the rollup plugins are imported by the shared config in `scripts/build/` but must resolve from each package's own `node_modules`, and a handful are named as string literals in build configs. Prefer removing a dependency over ignoring it.

#### Deprecated Packages

The following packages are deprecated and **should not be added as dependencies** in new code:

- `@amplitude/analytics-types`
- `@amplitude/analytics-client-common`
- `@amplitude/analytics-remote-config`

**Replacements:**
- For `@amplitude/analytics-types` and `@amplitude/analytics-client-common`: Use `@amplitude/analytics-core` instead
- For `@amplitude/analytics-remote-config`: Use the new remote config client in `@amplitude/analytics-core` instead

These packages remain in the codebase for backward compatibility with existing code, but new dependencies on them are blocked by CI checks. If your PR fails the "Check Deprecated Packages" CI job, update your `package.json` to use the appropriate replacement from `@amplitude/analytics-core`.

#### Open a PR

Once you are finished with your changes and feel good about the proposed changes, create a pull request. A team member will assist in getting them reviewed. We are excited to work with you on this.

For contributions to version `1.x`, open a pull request against `v1.x`. For contributions to the `2.x` (latest) version, open a pull request against `main`.

#### Merge

As soon as your changes are approved, a team member will merge your PR to main and will get published shortly after.

#### Publishing NPM package for the first time

Because the workflow uses Trusted Publishing, a new package can't be published from the publish workflow on the first try. 

To publish a package for the first time (administrators only):
1. run `pnpm install` from the root
2. run `pnpm deploy:publish:bootstrap` and enter the full npm package name (e.g. `@amplitude/my-new-package`) when prompted. The script publishes an empty package (package.json only); this requires you to be logged into an NPM admin account with 2FA enabled.
3. navigate to the NPM homepage of the new package
4. open "Settings" and configure it to use Trusted Publishing
5. copy the same configuration used in [analytics browser](https://www.npmjs.com/package/@amplitude/analytics-browser/access). **case sensitive**
6. now that it's in NPM and Trusted Publishing is enabled, this package can now be published from workflows

#### Publishing the custom enrichment browser plugin

`@amplitude/plugin-custom-enrichment-browser` is released independently of `publish-v2`. Its repository manifest is private so Lerna skips its version and dependency updates. Recursive SDK publishing also explicitly excludes it. The staged artifact alone has `private` removed. Keep the `analytics-core` peer dependency at the reviewed compatible range (with workspace core as a development dependency) and analytics-browser's plugin dependency at an exact **published** version; neither should advance during routine SDK releases.

The plugin is declared as dual-use and every new version still requires an npm maintainer's 2FA approval. Before using the new workflow, update its npm Trusted Publisher to `.github/workflows/publish-custom-enrichment.yml`, with **stage-only** permission and the `npm-release` environment.

1. When plugin changes need a release, merge the reviewed changes on `main` or a `hotfix/*` branch. Leave analytics-browser's plugin dependency at the previous published version.
2. Manually run **Publish custom enrichment** on that branch, entering the exact stable version to release. The workflow updates only the plugin version and changelog, preserving any reviewed notes for that version or generating notes from plugin commits. It builds, tests, and lints the plugin and its workspace dependencies, pushes a `chore(release): publish` commit and package-specific tag together, stages the plugin, and creates a GitHub Release using those changelog notes. It uses pnpm 11 on Node 24 and the existing release GitHub App in `npm-release` for protected-branch writes.
3. Follow the workflow summary to npmjs.com's **Staged Packages** tab. An npm maintainer reviews the staged package and approves it with 2FA. No further GitHub Actions confirmation is required.
4. Confirm the version is live on the npm package page linked in the summary. In a follow-up change, update analytics-browser's exact plugin dependency and the lockfile to the now-published version. Regular `publish-v2` releases can then consume it without waiting for plugin approval.

The independent workflow currently releases stable versions only. Retry with the same version to reuse its release commit and tag; a completed release is not recreated. If only the GitHub Release job fails, use **Re-run failed jobs** to retry it without staging again. If staging succeeded but its result was interrupted, approve the existing stage on npm before retrying the same version. A version already on npm without a matching workflow-created tag is rejected rather than attaching it to unrelated source. A concurrent branch update stops the push without overwriting other work. This workflow never runs Lerna versioning or publishes other SDK packages.

The initial migration intentionally advances the plugin from 0.1.x to 1.0.0 because requiring the host to provide core is a breaking change for direct plugin consumers. Stage and approve 1.0.0 first; until then, keep browser pinned to the already-published 0.1.28. After approval, update browser's exact pin and lockfile in a follow-up release. A browser-only consumer should not need to declare core separately because browser already supplies it.

The plugin's stable peer range is `^2.61.0`. It does not cover arbitrary core prereleases: before adopting 1.0.0 in browser, explicitly review the intended core prerelease versions against that range. Do not automatically widen the peer range or silently ignore an incompatible peer. A release that needs a different peer contract requires a deliberate plugin release.

Peer dependencies let the bundled plugin use the core supplied by browser in the tested compatible consumer installations. They do not guarantee one core across every possible application graph. Direct plugin consumers must declare a compatible core themselves; see the plugin README for the breaking-change migration. Keep the type-only import CI guard: this manifest change does not itself prove future runtime imports have no bundle impact.

#### Recovering a partial `publish-v2` workflow run

Use this only when a previous `Publish v2.x` workflow run already created the release version and partially published packages to npm, but the workflow failed before all packages finished publishing.

To recover from that state:

1. Open the `Publish v2.x` workflow in GitHub Actions.
2. Click `Run workflow`.
3. Select the same `releaseType` that the failed run used.
4. Select the same branch that the failed run used, if applicable.
5. Enable the `skipLernaVersion` checkbox.
6. Run the workflow again.

When `skipLernaVersion` is enabled, the workflow skips the `lerna version` step for `release` and `prerelease` runs and skips the E2E test step. This lets the workflow continue to the publish step without trying to create a second release version.

Do not use `skipLernaVersion` for a normal release. It is only intended for recovery after a partial `publish-v2` run.

## Practices

### PR Commit Title Conventions

PR titles should follow [conventional commit standards](https://www.conventionalcommits.org/en/v1.0.0/). This helps automate the release process.

#### Commit Types

- **Special Case**: Any commit with `BREAKING CHANGES` in the body: Creates major release
- `feat(<optional scope>)`: New features (minimum minor release)
- `fix(<optional scope>)`: Bug fixes (minimum patch release)
- `perf(<optional scope>)`: Performance improvement
- `docs(<optional scope>)`: Documentation updates
- `test(<optional scope>)`: Test updates
- `refactor(<optional scope>)`: Code change that neither fixes a bug nor adds a feature
- `style(<optional scope>)`: Code style changes (e.g. formatting, commas, semi-colons)
- `build(<optional scope>)`: Changes that affect the build system or external dependencies (e.g. pnpm, Npm)
- `ci(<optional scope>)`: Changes to our CI configuration files and scripts
- `chore(<optional scope>)`: Other changes that don't modify src or test files
- `revert(<optional scope>)`: Revert commit
