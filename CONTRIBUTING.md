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

After approval, merge the PR to the appropriate release branch. Merging alone does not publish a package; a maintainer must run the appropriate publishing workflow below.

#### Publishing NPM package for the first time

Because the workflow uses Trusted Publishing, a new package can't be published from the publish workflow on the first try. 

To publish a package for the first time (administrators only):
1. run `pnpm install` from the root
2. run `pnpm deploy:publish:bootstrap` and enter the full npm package name (e.g. `@amplitude/my-new-package`) when prompted. The script publishes an empty package (package.json only); this requires you to be logged into an NPM admin account with 2FA enabled.
3. navigate to the NPM homepage of the new package
4. open "Settings" and configure it to use Trusted Publishing
5. copy the same configuration used in [analytics browser](https://www.npmjs.com/package/@amplitude/analytics-browser/access). **case sensitive**
6. now that it's in NPM and Trusted Publishing is enabled, this package can now be published from workflows

#### Publishing SDK packages

For a normal stable SDK release, open **GitHub Actions → Publish v2.x → Run workflow**, select `main` (or the intended `hotfix/*` branch), explicitly select `releaseType: release`, leave the optional `branch` input empty, and leave `skipLernaVersion` unchecked. The default release type is `prerelease`, so check this input before dispatching. The workflow requires repository write/admin permission and the configured release environments and credentials.

This workflow validates, versions, and publishes SDK packages. It excludes custom enrichment, which uses the separate procedure below. The first-time bootstrap procedure above is only for a package name that does not yet exist on npm. Do not use it for a new version of an existing package.

#### Publishing the custom enrichment browser plugin

This is the maintainer runbook for `@amplitude/plugin-custom-enrichment-browser`; no Linear ticket or external project document is needed to follow it. Use the existing [Publish custom enrichment workflow](.github/workflows/publish-custom-enrichment.yml), then a separate Browser adoption PR, then [Publish v2.x](.github/workflows/publish-v2.yml).

The plugin's repository manifest is private so Lerna skips its version and dependency updates. Recursive SDK publishing explicitly excludes it. Only the temporary staged artifact has `private` removed. Do not remove `private` from the source manifest or use the generic single-package publisher to bypass this release path.

**One-time prerequisites:** the plugin's npm Trusted Publisher must use `publish-custom-enrichment.yml`, stage-only permission, and the `npm-release` environment. The current workflow also requires reviewers on the GitHub `npm-custom-enrichment-approval` environment. An npm maintainer with 2FA must approve each new staged version. These settings require the appropriate npm/GitHub permissions; local build success does not establish that they are configured.

1. **Prepare and merge the plugin release PR.** Update the plugin source and tests, explicitly set the intended new stable version in `packages/plugin-custom-enrichment-browser/package.json`, and add its changelog entry in the same package directory. Merge to `main` or the intended `hotfix/*` branch. Keep Browser's plugin dependency at its previous published version. The plugin's version is not bumped by routine Lerna releases. Review any changes to its `analytics-core` peer range rather than automatically widening it.

2. **Stage, approve, and verify the plugin.** In GitHub Actions, run **Publish custom enrichment** from that release branch and enter the exact version committed in step 1. The workflow builds/tests and stages only the plugin using pnpm 11 on Node 24. An npm maintainer reviews the staged package on npmjs.com and approves it with 2FA. Then approve the current workflow's waiting GitHub environment job, which verifies that exact version is live. GitHub approval alone does not publish it. Independently check availability with `pnpm view @amplitude/plugin-custom-enrichment-browser@<version> version`, replacing `<version>` with the intended version. Staging success is not publication success; continue only when npm returns the intended version.

3. **Manually create and merge the Browser adoption PR.** After npm publication, update `dependencies["@amplitude/plugin-custom-enrichment-browser"]` in `packages/analytics-browser/package.json` to that exact published version, for example `"1.0.0"`. Do not use `workspace:*`, `^1.0.0`, or `~1.0.0`. Run `pnpm install` from the repository root, review and commit `pnpm-lock.yaml`, and verify a frozen-lockfile install succeeds. Replace any plugin changelog `pending publication` label with the actual npm publication date. Validate Browser-only installation, direct-plugin installation with compatible core, TypeScript resolution, and the repository checks before merging. This PR changes Browser's dependency on the plugin; it does not manually bump Browser's own version. Repeat this adoption step whenever Browser should consume a newer plugin release.

4. **Publish Browser with Publish v2.x.** After the adoption PR merges, follow the normal stable SDK release instructions above. Publish v2 checks that Browser's pinned plugin version exists on npm, then versions and publishes SDK packages while excluding custom enrichment. Verify that the resulting Browser package declares the intended exact plugin dependency. If the plugin is still staged, finish npm approval and verification before retrying; do not bypass the check. Publishing Browser first can make consumer installations fail because its dependency is unavailable.

Browser may continue releasing with its previous published plugin pin while a newer plugin version is pending. Publishing a plugin and adopting it in Browser are separate decisions; a plugin release does not automatically update Browser.

##### Why Browser uses an exact npm pin instead of `workspace:*`

The manual adoption PR is an intentional boundary between published plugin code and ongoing plugin development. Consider this example:

- Plugin `1.0.0` containing **code A** is published on npm.
- Someone changes the repository's plugin source to **code B**, but its package.json still says `1.0.0`.
- With `workspace:*`, Browser builds against the local workspace plugin, so code B can enter its browser bundle.
- pnpm converts `workspace:*` to the local version number when packing Browser. The published manifest would still declare `1.0.0`, which resolves to code A on npm, even though the bundle may contain code B.

Checking that npm has `1.0.0` does not catch this mismatch: it checks availability, not equality between workspace source and the published artifact. Approving a staged package later does not repair a Browser bundle that has already shipped.

With an exact npm pin and the committed lockfile, the repository's normal dependency installation resolves Browser's plugin from the published npm artifact. Unreleased workspace plugin edits do not automatically become Browser's dependency. The follow-up PR selects the published version and provides a review and compatibility check before Browser adopts it. Do not replace this pin with a workspace dependency as a convenience refactor, or use local links/overrides in release validation that bypass it. This restriction concerns Browser's dependency on the plugin; the plugin may still use workspace core as a development dependency.

##### Compatibility, release records, and retries

Plugin 1.0.0 was published on 2026-10-21. It deliberately introduced a breaking dependency change for direct plugin consumers: they must declare compatible `@amplitude/analytics-core` themselves. Browser-only consumers do not need a separate core declaration because Browser supplies it. The stable peer range `^2.61.0` does not cover arbitrary core prereleases; review those separately before an SDK prerelease. See the [plugin README](packages/plugin-custom-enrichment-browser/README.md) for consumer installation instructions.

The independent workflow currently releases stable versions only and does not run Lerna or create changelog entries, Git tags, or GitHub Releases. Maintain the plugin version/changelog explicitly, finalize the release date after publication, and handle any required Git tag/GitHub Release separately using the actual published source commit. Do not assume a `chore(release): publish` commit will be generated by this workflow.

If the intended version is already live, rerunning the plugin workflow skips staging and approval. If a stage is pending, approve it on npm before retrying. For changed plugin code, prepare a new version; rerunning an already-published version does not publish those changes. Keep the type-only core import CI guard: this peer-dependency arrangement does not itself reduce the bundle or guarantee one core instance across every application dependency graph.

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
