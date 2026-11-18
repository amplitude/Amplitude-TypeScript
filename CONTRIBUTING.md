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

Use this procedure only for a **brand-new npm package name**. npm requires the package to exist before its Trusted Publisher can be configured. An existing package's prerelease or stable release goes directly through [Publishing SDK packages](#publishing-sdk-packages); it does not need another bootstrap.

1. **Use the shared SDK npm publishing account.** An authorized maintainer must have access to that account, permission to create/publish packages in the `@amplitude` scope, and 2FA enabled. Use Node 24, run `pnpm install` from the repository root, then `npm login` with the shared account. Check `npm whoami` before continuing. Do not use a personal npm account for this bootstrap.

2. **Publish the placeholder locally.** Run `pnpm deploy:publish:bootstrap` from the repository root. Enter the full package name (for example, `@amplitude/my-new-package`). At the initial-version prompt, either accept the default `0.0.1` or enter an optional prerelease placeholder such as `0.0.1-alpha.0`. Review the name/version before confirming, and complete npm's 2FA prompt when required.

   The [bootstrap script](scripts/publish/bootstrap-npm-package.sh) publishes **only `package.json`**, from a temporary directory, with public access and the **`alpha` dist-tag**, regardless of the chosen version. This reserves the name for Trusted Publishing setup; it is **not a functional package release** and must not be installed by consumers or used as a real dependency. The script does not build code, update repository manifests, or prepare compatible dependency versions. Verify the placeholder with `pnpm view @amplitude/my-new-package@0.0.1-alpha.0 version` and `pnpm view @amplitude/my-new-package dist-tags`, substituting the name/version you selected.

3. **Configure the intended Trusted Publisher on npm.** Open the new package's npm **Settings → Trusted publishing** page. For a normal SDK package, follow the current [analytics-browser access configuration](https://www.npmjs.com/package/@amplitude/analytics-browser/access) and [Publish v2.x workflow](.github/workflows/publish-v2.yml). The GitHub publisher fields are case sensitive:

   | Field | Normal SDK package value |
   | --- | --- |
   | Organization or user | `amplitude` |
   | Repository | `Amplitude-TypeScript` |
   | Workflow filename | `publish-v2.yml` (the file in `.github/workflows/`, not its display name) |
   | Environment | `npm-release` |

   Verify these values against the current workflow and reference package before saving; repository write/admin access and the configured release environment are also required to run it. Trusted Publishing uses GitHub OIDC for subsequent workflow publications. Do not restore a token-based single-package publishing path. Custom enrichment has a different workflow and stage-only permission: follow its [separate runbook](#publishing-the-custom-enrichment-browser-plugin).

4. **Prepare the first functional release.** Ensure the new SDK package's reviewed source manifest is eligible for normal Lerna/pnpm publishing (`private` absent or `false`) and that its build outputs and package entry points are correct. Choose a real version above the placeholder and review every runtime/peer dependency for compatibility and npm availability. Publish real code and any required SDK dependency versions together through **Publish v2.x**, using the prerelease or stable inputs below. Bootstrapping alone does not release the source code. Keep custom enrichment's private source manifest and Browser's exact published plugin pin as specified in its separate runbook.

#### Publishing SDK packages

Use [Publish v2.x](.github/workflows/publish-v2.yml) for both prereleases of existing packages (including the first real release after bootstrap) and stable SDK releases. It validates, versions, and publishes eligible SDK packages together; it is not a single-package publisher. Custom enrichment is excluded and follows the separate procedure below.

In **GitHub Actions → Publish v2.x → Run workflow**, set the inputs explicitly:

| Release intent | “Use workflow from” branch (dispatch ref) | `releaseType` | `branch` input (source to publish) | `skipLernaVersion` |
| --- | --- | --- | --- | --- |
| Branch prerelease | `main` or the intended `hotfix/*` branch | `prerelease` | Exact feature branch name, required (for example, `feature/new-package`) | Unchecked (`false`) |
| Stable release | `main` or the intended `hotfix/*` branch | `release` | Empty | Unchecked (`false`) |

The default `releaseType` is `prerelease`, so check it before dispatching. For a branch prerelease, select `main`/`hotfix/*` in the workflow branch selector and put the feature branch in the separate `branch` input; dispatching a publishing run directly from a feature branch is rejected. The workflow derives the prerelease identifier and npm dist-tag by removing all characters except letters, digits, and hyphens from the source branch (for example, `feature/new-package` becomes `featurenew-package`). The prerelease command passes that tag via `--tag`; stable publishing uses each package's `publishConfig.tag` (usually `latest`, but some packages specify `beta`). Review the package configuration and verify the resulting npm dist-tag before consumer adoption. Ensure the derived tag is suitable for the intended prerelease. Use `skipLernaVersion` only for [partial-publish recovery](#recovering-a-partial-publish-v2-workflow-run), never for normal first publication or a new release.

**Verify each functional release before adoption:**

- Confirm the intended version and tag on npm, for example `pnpm view @amplitude/my-new-package@<version> version dependencies peerDependencies` and `pnpm view @amplitude/my-new-package dist-tags`. Check every required dependency version is available and every peer range supports the intended stable or prerelease dependency versions; stable peer ranges do not automatically accept prereleases.
- Inspect the actual published tarball, for example `npm pack @amplitude/my-new-package@<version>` in a temporary directory, then inspect its files and `package/package.json`. Confirm real code, types, and entry points are present, and that packed dependency ranges resolve to the intended npm versions with no unresolved `workspace:` references or placeholder dependencies. Do not infer the published manifest from the workspace manifest alone.
- Install the exact version in a fresh consumer project outside the monorepo, with no workspace links or local overrides. Install required compatible peers, verify TypeScript resolution, and smoke-test the public API in the intended runtime. For a prerelease, install the explicit version or derived dist-tag; do not expect `latest` to select it. Verify Browser's exact custom-enrichment pin and the separate plugin compatibility requirements whenever Browser is released.

#### Publishing the custom enrichment browser plugin

This is the maintainer runbook for `@amplitude/plugin-custom-enrichment-browser`; no Linear ticket or external project document is needed to follow it. Use the existing [Publish custom enrichment workflow](.github/workflows/publish-custom-enrichment.yml), then a separate Browser adoption PR, then [Publish v2.x](.github/workflows/publish-v2.yml).

The plugin's repository manifest is private so Lerna skips its version and dependency updates. Recursive SDK publishing explicitly excludes it. Only the temporary staged artifact has `private` removed. Do not remove `private` from the source manifest or bypass this release path with generic SDK publishing.

**One-time prerequisites:** the plugin is declared as dual-use, and its npm Trusted Publisher must use `.github/workflows/publish-custom-enrichment.yml`, **stage-only** permission, and the `npm-release` environment. The workflow uses the existing release GitHub App in `npm-release` for protected-branch writes. An npm maintainer with 2FA must approve each new staged version. These settings require the appropriate npm/GitHub permissions; local build success does not establish that they are configured.

1. **Prepare and merge the plugin changes.** Update the plugin source and tests, and optionally add reviewed changelog notes for the intended stable version in `packages/plugin-custom-enrichment-browser/CHANGELOG.md`. Merge to `main` or the intended `hotfix/*` branch. Keep Browser's plugin dependency at its previous published version. The plugin's version is not bumped by routine Lerna releases; the independent workflow sets it in step 2. Review any changes to its `analytics-core` peer range rather than automatically widening it.

2. **Release, stage, approve, and verify the plugin.** In GitHub Actions, run **Publish custom enrichment** from that branch and enter the exact stable version to release. The workflow updates only the plugin version and changelog, preserving reviewed notes for that version or generating notes from plugin commits. It builds, tests, and lints the plugin and its workspace dependencies using pnpm 11 on Node 24, pushes a `chore(release): publish` commit and package-specific tag together, stages the plugin, and creates a GitHub Release using those changelog notes. Follow the workflow summary to npmjs.com's **Staged Packages** tab, where an npm maintainer reviews the staged package and approves it with 2FA. No further GitHub Actions confirmation is required. Confirm the version is live on the npm package page linked in the summary, or with `pnpm view @amplitude/plugin-custom-enrichment-browser@<version> version`, replacing `<version>` with the intended version. Staging success is not publication success; continue only when npm returns the intended version.

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

The independent workflow currently releases stable versions only. It creates the plugin's version/changelog update, release commit, package-specific Git tag, and GitHub Release without running Lerna or publishing other SDK packages. Plugin 1.0.0 predates this automation: it was published from `e0866041ef2ff19209d619c1a43116c27eaa6fc6`, and its publication date is recorded in the plugin changelog. Any separate historical tag or GitHub Release for 1.0.0 must reference that actual published source commit.

Retry with the same version to reuse the workflow-created release commit and tag; a completed release is not recreated. If only the GitHub Release job fails, use **Re-run failed jobs** to retry it without staging again. If staging succeeded but its result was interrupted, approve the existing stage on npm before retrying the same version. A version already on npm without a matching workflow-created tag is rejected rather than attaching it to unrelated source. A concurrent branch update stops the push without overwriting other work. For changed plugin code, prepare a new version; rerunning an already-published version does not publish those changes. Keep the type-only core import CI guard: this peer-dependency arrangement does not itself reduce the bundle or guarantee one core instance across every application dependency graph.

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
